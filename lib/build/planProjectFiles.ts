// lib/build/planProjectFiles.ts

import type { BuildPayload } from "./types";

/**
 * Output shape used by buildService
 */
export type PlannedProject = {
  plan: string;
  filesToGenerate: { path: string; description: string }[];
};

/* ------------------------ helpers ------------------------ */

function isProbablyJSON(text: string | undefined | null): boolean {
  if (!text) return false;
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

function extractSimplePlan(payload: BuildPayload): string {
  // Prefer explicit plan if it looks like prose (not JSON)
  if (payload.plan && !isProbablyJSON(payload.plan)) {
    return payload.plan.trim();
  }

  // Try the last assistant message that isn't JSON
  const lastAssistant = [...(payload.messages || [])]
    .reverse()
    .find((m) => m.role === "assistant" && m.content && !isProbablyJSON(m.content));

  if (lastAssistant?.content) return lastAssistant.content.trim();

  // Try idea summary
  const summary = payload.ideaSummary?.description;
  if (summary && !isProbablyJSON(summary)) return summary.trim();

  // Fallback generic plan
  return "Build a minimal static MVP with an index page and a simple worker that serves assets from KV.";
}

/**
 * Baseline file plan we can always generate, even without a model.
 * Keep these descriptions short to reduce token usage downstream.
 */
function defaultFilesPlan(): { path: string; description: string }[] {
  return [
    {
      path: "functions/index.ts",
      description:
        "Cloudflare Worker: serve /index.html and other static files from KV (ASSETS). Fallback to a plain text message if not found.",
    },
    {
      path: "public/index.html",
      description:
        "Minimal HTML page with title, header, and a paragraph. Link /styles.css and /app.js if present.",
    },
    {
      path: "public/styles.css",
      description:
        "Tiny CSS with a centered container and basic typography. Nothing heavy.",
    },
    {
      path: "public/app.js",
      description:
        "Small script that logs a startup message and wires a minimal click handler if an element with id='cta' exists.",
    },
    {
      path: "wrangler.toml",
      description:
        "Wrangler config: name=mvp-<ideaId>, main=functions/index.ts, compatibility_date=today, add [site] bucket=./public. The ASSETS KV is handled/injected by build service.",
    },
    {
      path: ".github/workflows/deploy.yml",
      description:
        "GitHub Actions workflow that deploys with cloudflare/wrangler-action@v3. Expects CLOUDFLARE_API_TOKEN secret.",
    },
    {
      path: "package.json",
      description:
        "Minimal package.json with type=module and a noop build script.",
    },
  ];
}

/* ------------------------ optional LLM planner ------------------------ */

/**
 * If OPENAI_API_KEY is set (and the 'openai' package is present),
 * we ask the model to produce a compact list of files. Otherwise, we
 * fall back to a deterministic plan above.
 */
async function tryModelPlan(
  payload: BuildPayload
): Promise<{ plan: string; files: { path: string; description: string }[] } | null> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENAI_APIKEY;
  if (!apiKey) return null;

  // Avoid throwing if 'openai' lib is not installed; keep the import truly dynamic.
  let OpenAI: any;
  try {
    ({ default: OpenAI } = await import("openai"));
  } catch {
    return null; // library not available at runtime
  }

  try {
    const client = new OpenAI({ apiKey });

    const brief =
      payload.ideaSummary?.description ||
      extractSimplePlan(payload).slice(0, 1200);

    const sys =
      "You are a senior software planner. Output a short, explicit plan (3-6 sentences) and a minimal set of concrete files to implement it. Keep descriptions concise (<= 200 chars). No markdown, no code fences.";

    const user = [
      "Context:",
      brief,
      "",
      "Return a JSON object with keys:",
      `{
  "plan": "<short prose plan>",
  "files": [
    { "path": "functions/index.ts", "description": "<what to implement>"},
    ...
  ]
}`,
      "",
      "Only return valid JSON. Prefer Cloudflare Worker (functions/index.ts) + public assets.",
    ].join("\n");

    // Use Responses API if present; otherwise, fallback to Chat Completions signature
    let text: string | undefined;

    if (client.responses?.create) {
      const r = await client.responses.create({
        model: process.env.CODEGEN_PLANNER_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_output_tokens: 800,
        input: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      });
      text = r.output_text;
    } else {
      const r = await client.chat.completions.create({
        model: process.env.CODEGEN_PLANNER_MODEL || "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
      });
      text = r.choices?.[0]?.message?.content;
    }

    if (!text) return null;

    // Parse strict JSON; if it fails, ignore and fallback.
    const parsed = JSON.parse(text);
    if (
      typeof parsed !== "object" ||
      !parsed ||
      !Array.isArray(parsed.files) ||
      typeof parsed.plan !== "string"
    ) {
      return null;
    }

    // Normalize shape
    const files = parsed.files
      .filter((f: any) => f && typeof f.path === "string" && typeof f.description === "string")
      .map((f: any) => ({ path: String(f.path), description: String(f.description) }));

    if (files.length === 0) return null;

    return {
      plan: String(parsed.plan),
      files,
    };
  } catch {
    // Any model/parse issue -> fallback
    return null;
  }
}

/* ------------------------ main API ------------------------ */

export async function planProjectFiles(payload: BuildPayload): Promise<PlannedProject> {
  // Try the model-driven plan first (only if OPENAI_API_KEY + openai lib exist)
  const modelPlan = await tryModelPlan(payload);
  if (modelPlan) {
    return {
      plan: modelPlan.plan,
      filesToGenerate: modelPlan.files,
    };
  }

  // Deterministic fallback path
  const plan = extractSimplePlan(payload);
  const files = defaultFilesPlan();

  // Replace template placeholder in wrangler description if present
  const id = payload.ideaId || "mvp";
  const filesResolved = files.map((f) =>
    f.path === "wrangler.toml"
      ? {
          ...f,
          description:
            "Wrangler config: name=mvp-" +
            id +
            ", main=functions/index.ts, compatibility_date=today, add [site] bucket=./public. The ASSETS KV is handled/injected by build service.",
        }
      : f
  );

  return {
    plan,
    filesToGenerate: filesResolved,
  };
}