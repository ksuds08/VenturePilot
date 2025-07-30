// SPDX-License-Identifier: MIT

/*
 * Cloudflare Worker handler for the MVP endpoint.  It accepts requirements,
 * forwards them to the Launchwing agent for a plan, and then optionally
 * builds and deploys a real application using lib/buildService.js.
 *
 * Required environment variables (set in your Worker settings):
 *   BUILD_AGENT_URL (optional) – upstream code‑generator endpoint
 *   PAT_GITHUB      – GitHub personal access token
 *   GITHUB_USERNAME and/or GITHUB_ORG – repo owner info
 *   CF_API_TOKEN    – Cloudflare API token with Pages permissions
 *   CF_ACCOUNT_ID   – your Cloudflare account ID
 *   CF_PAGES_PROJECT– name of your Pages project
 */

import { buildAndDeployApp } from '../../lib/buildService.js';

export async function mvpHandler(request, env) {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only POST is supported for this endpoint
  if (request.method.toUpperCase() !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Attempt to parse the incoming JSON body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Build a requirements string from the body
  let requirements;
  if (typeof body.requirements === 'string') {
    requirements = body.requirements;
  } else if (Array.isArray(body.requirements)) {
    requirements = body.requirements.join(' ');
  } else if (typeof body.prompt === 'string') {
    requirements = body.prompt;
  } else {
    requirements = JSON.stringify(body) ?? '';
  }

  try {
    // Determine if the client wants an SSE stream
    const url = new URL(request.url);
    const wantsStream =
      request.headers.get('accept')?.includes('text/event-stream') ||
      url.searchParams.get('stream') === 'true';

    const endpoint = wantsStream
      ? 'https://launchwing-agent.onrender.com/build/stream'
      : 'https://launchwing-agent.onrender.com/build';

    // Forward the requirements to the Launchwing agent
    const agentRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements }),
    });

    // If the agent responds with an error, return it directly
    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      return new Response(`Agent error: ${errorText}`, {
        status: agentRes.status,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // If the client requested streaming, pipe the SSE body through
    if (wantsStream) {
      return new Response(agentRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Otherwise parse the agent's response
    const rawText = await agentRes.text();
    let planData;
    try {
      planData = JSON.parse(rawText);
    } catch {
      planData = { message: rawText };
    }
    const plan = planData?.message ?? '';

    // Try to build and deploy the application; fall back to returning the plan
    try {
      const ideaId =
        body.ideaId || Math.random().toString(36).substring(2, 8);
      const ideaSummary = {
        name: (body.branding && body.branding.name) || 'AI MVP',
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
      const result = await buildAndDeployApp(buildPayload);
      if (result.pagesUrl) {
        return new Response(
          JSON.stringify({
            pagesUrl: result.pagesUrl,
            repoUrl: result.repoUrl ?? null,
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          },
        );
      }
    } catch (err) {
      // Log the build/deploy error, then continue to return the plan
      console.error('Build/deploy failed', err);
    }

    // Fallback: return the plan in JSON
    return new Response(JSON.stringify({ plan }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Failed to contact agent: ${msg}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}