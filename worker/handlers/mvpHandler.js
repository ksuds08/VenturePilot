// SPDX-License-Identifier: MIT

/*
 * Cloudflare Worker handler for the MVP endpoint.  This handler accepts a
 * POST request containing a set of requirements, forwards them to the
 * Launchwing agent to generate a high‑level plan, and then optionally
 * builds and deploys a working application based on that plan using the
 * functions defined in lib/buildService.ts.
 *
 * To enable automatic code generation and deployment you must provide the
 * following environment variables via Worker secrets:
 *
 *   BUILD_AGENT_URL     – URL of a service that can generate project files
 *                         from a BuildPayload (see buildService.ts).  If
 *                         omitted, the handler falls back to generating a
 *                         simple static site from the plan.
 *   PAT_GITHUB          – Personal access token for committing to GitHub.
 *   GITHUB_USERNAME     – Your GitHub username associated with the token.
 *   CF_API_TOKEN        – Cloudflare API token with Pages write access.
 *   CF_ACCOUNT_ID       – Your Cloudflare account ID.
 *   CF_PAGES_PROJECT    – The name of your Cloudflare Pages project.
 *
 * The handler retains compatibility with the previous behaviour by
 * returning a JSON object with a `plan` field when build/deploy is not
 * possible or fails.  It also supports Server‑Sent Events (SSE) if the
 * client requests a streaming response.
 */

import { buildAndDeployApp } from "./lib/buildService";

export async function mvpHandler(request: Request, env: Record<string, any>) {
  // Handle CORS preflight requests
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  // Only POST is supported for this endpoint
  if (request.method.toUpperCase() !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Attempt to parse the incoming JSON body
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response("Invalid JSON body", {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Derive a requirements string from the request payload.  Accepts
  // `requirements` (string or array) or `prompt`; falls back to
  // serialising the entire body.
  let requirements: string;
  if (typeof body.requirements === "string") {
    requirements = body.requirements;
  } else if (Array.isArray(body.requirements)) {
    requirements = body.requirements.join(" ");
  } else if (typeof body.prompt === "string") {
    requirements = body.prompt;
  } else {
    requirements = JSON.stringify(body) ?? "";
  }

  try {
    // Determine if the client wants an SSE stream
    const url = new URL(request.url);
    const wantsStream =
      request.headers.get("accept")?.includes("text/event-stream") ||
      url.searchParams.get("stream") === "true";

    const endpoint = wantsStream
      ? "https://launchwing-agent.onrender.com/build/stream"
      : "https://launchwing-agent.onrender.com/build";

    // Forward the requirements to the Launchwing agent
    const agentRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirements }),
    });

    // If the agent responds with an error, return it directly
    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      return new Response(`Agent error: ${errorText}`, {
        status: agentRes.status,
        headers: {
          "Content-Type": "text/plain",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // If the client requested streaming, pipe the SSE body through
    if (wantsStream) {
      return new Response(agentRes.body, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Otherwise parse the agent's response as text and attempt JSON
    const rawText = await agentRes.text();
    let planData: any;
    try {
      planData = JSON.parse(rawText);
    } catch {
      planData = { message: rawText };
    }
    const plan = planData?.message ?? "";

    // Attempt to build and deploy a real application.  This requires
    // environment variables (see module header) to be configured.
    try {
      // Construct a payload for buildAndDeployApp.  Use values from the
      // request body if available, otherwise provide sensible defaults.
      const ideaId =
        body.ideaId || Math.random().toString(36).substring(2, 8);
      const ideaSummary = {
        name: body.branding?.name || "AI MVP",
        description: requirements,
      };
      const branding = body.branding || {};
      const messages = body.messages || [];
      const buildPayload = {
        ideaId,
        ideaSummary,
        branding,
        plan,
        messages,
      };
      const result: any = await buildAndDeployApp(buildPayload as any);
      if (result.pagesUrl) {
        return new Response(
          JSON.stringify({ pagesUrl: result.pagesUrl, repoUrl: result.repoUrl ?? null }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }
    } catch (err) {
      console.error("Build/deploy failed", err);
      // Continue to return the plan only
    }

    // Fallback: return the plan in JSON
    return new Response(JSON.stringify({ plan }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Failed to contact agent: ${msg}`, {
      status: 502,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}