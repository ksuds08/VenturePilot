// lib/build/planProjectFiles.ts

import type { BuildPayload } from "./types";

// Small helper to pull a human plan if the payload contains one
function extractFallbackPlan(payload: BuildPayload): string {
  const raw = payload.plan || payload.ideaSummary?.description || "";
  if (raw && typeof raw === "string" && raw.trim()) return raw.trim();
  const reversed = [...(payload.messages || [])].reverse();
  const lastAssistant = reversed.find((m) => m.role === "assistant" && typeof m.content === "string");
  return lastAssistant?.content?.trim() || "No plan provided";
}

export async function planProjectFiles(payload: BuildPayload) {
  // If no key, skip OpenAI completely and fall back
  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.OPENAI_APIKEY ||
    process.env.NEXT_PUBLIC_OPENAI_API_KEY; // last resort; not recommended

  if (!apiKey) {
    const plan = extractFallbackPlan(payload);
    return {
      plan,
      files: [
        { path: "public/index.html", description: "Basic HTML landing page for the MVP." },
        { path: "functions/index.ts", description: "Cloudflare Worker handler to serve ASSETS KV or hello." },
        { path: "wrangler.toml", description: "Wrangler config with site bucket and optional KV binding." },
      ],
    };
  }

  // Lazy import to avoid compile-time dependency when not present
  const { default: OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  const userBrief =
    payload.plan ||
    payload.ideaSummary?.description ||
    "Generate a minimal MVP with a static index.html and a Worker handler.";

  const sys = [
    "You are a planning assistant that outputs a small, coherent file plan for a Cloudflare Worker + static site MVP.",
    "Return 6–12 files max. Prefer public/index.html, optional public/styles.css, public/app.js.",
    "Always include functions/index.ts (Worker) and wrangler.toml (with [site] bucket).",
  ].join("\n");

  const resp = await client.chat.completions.create({
    model: process.env.PLANNER_MODEL || "gpt-4o-mini",
    temperature: 0.2,
    max_tokens: 900,
    messages: [
      { role: "system", content: sys },
      {
        role: "user",
        content: `Brief:\n${userBrief}\n\nOutput JSON array of {path, description}.`,
      },
    ],
  });

  const text = resp.choices?.[0]?.message?.content?.trim() || "[]";
  let files: { path: string; description: string }[] = [];
  try {
    const tryJson = JSON.parse(text);
    if (Array.isArray(tryJson)) files = tryJson;
  } catch {
    // fallback minimal plan
    files = [
      { path: "public/index.html", description: "Basic HTML landing page for the MVP." },
      { path: "functions/index.ts", description: "Cloudflare Worker handler to serve ASSETS KV or hello." },
      { path: "wrangler.toml", description: "Wrangler config with site bucket and optional KV binding." },
    ];
  }

  return {
    plan: userBrief,
    files,
  };
}