// lib/build/buildService.ts
import { commitToGitHub } from './commitToGitHub';
import { generateSimpleApp } from './generateSimpleApp';
import { sanitizeGeneratedFiles } from './sanitizeGeneratedFiles';
import { planProjectFiles } from './planProjectFiles';
import { generateCodeBatch } from './generateCodeBatch';
import { chunkArray } from './chunkArray';
import { createKvNamespace } from '../cloudflare/createKvNamespace';
import type { BuildPayload } from './types';

/* ------------------- config ------------------- */
const BATCH_SIZE = parseInt(process.env.CODEGEN_BATCH_SIZE || "5", 10);

/* ------------------------ helpers: plan extraction ------------------------ */

function isProbablyJSON(text: string): boolean {
  return typeof text === 'string' && (
    text.trim().startsWith('{') || text.trim().startsWith('[')
  );
}

function extractFallbackPlan(payload: BuildPayload): string {
  const raw = payload.plan || payload.ideaSummary?.description || '';
  if (!isProbablyJSON(raw) && raw.trim()) return raw.trim();

  const reversed = [...payload.messages].reverse();
  const lastAssistant = reversed.find(
    (m) => m.role === 'assistant' && !isProbablyJSON(m.content)
  );
  return lastAssistant?.content?.trim() || 'No plan provided';
}

/* ------------------- KV utility (local helper) ------------------- */

async function ensureAssetsKv(projectName: string, accountId: string, token: string): Promise<string> {
  const title = `${projectName}-ASSETS`;

  // Try to reuse an existing namespace
  try {
    const listRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
    if (listRes.ok) {
      const data = await listRes.json() as any;
      const found = data?.result?.find((ns: any) => ns.title === title);
      if (found?.id) return found.id;
    }
  } catch {
    // ignore – we'll try to create below
  }

  // Create if missing
  const id = await createKvNamespace({ token, accountId, title });
  return id;
}

/* -------------------------- main build+deploy API -------------------------- */

export async function buildAndDeployApp(
  payload: BuildPayload & {
    files?: { path: string; content: string }[];
  },
  env: {
    CF_API_TOKEN?: string;
    CF_ACCOUNT_ID?: string;
    GITHUB_PAT: string;
  }
) {
  const fallbackPlan = extractFallbackPlan(payload);
  const projectName = `mvp-${payload.ideaId}`;

  // If we have a plan for specific files, use the multi‑request path.
  // Otherwise fall back to the simple scaffold.
  let files: Record<string, string> = {};

  if (payload.files && payload.files.length > 0) {
    console.log("🧾 Raw file paths from agent:", payload.files.map(f => f.path));

    // 1) Sanitize incoming files (move web assets under public/, fix wrangler.toml, etc.)
    const sanitized = sanitizeGeneratedFiles(payload.files, {
      ideaId: payload.ideaId,
      env: {
        CLOUDFLARE_API_TOKEN: env.CF_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: env.CF_ACCOUNT_ID,
      },
    });

    files = Object.fromEntries(sanitized.map(f => [f.path, f.content]));
    console.log("✅ Sanitized file list:", Object.keys(files));
  } else {
    console.warn("⚠️ No agent files provided — falling back to generateSimpleApp()");
    let kvId = "";
    if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
      try {
        kvId = await ensureAssetsKv(projectName, env.CF_ACCOUNT_ID, env.CF_API_TOKEN);
        console.log("✅ ASSETS KV ensured for fallback:", kvId);
      } catch (e) {
        console.warn("⚠️ Could not ensure ASSETS KV for fallback:", String(e));
      }
    }
    files = await generateSimpleApp(fallbackPlan, payload.branding, projectName, kvId);
    console.log("✅ Fallback files generated");
  }

  // Decide if we want ASSETS (KV + [site] bucket) based on presence of public/* or worker code referencing env.ASSETS
  const hasPublic = Object.keys(files).some(p => p.startsWith("public/"));
  const workerTxt = files["functions/index.ts"] || "";
  const wantsAssets = hasPublic || /env\.ASSETS\b/.test(workerTxt);

  // Ensure KV exists if needed
  let assetsKvId = "";
  if (wantsAssets && env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
    assetsKvId = await ensureAssetsKv(projectName, env.CF_ACCOUNT_ID, env.CF_API_TOKEN);
    console.log("✅ ASSETS KV ensured:", assetsKvId);
  }

  // Ensure a worker handler exists
  if (!files["functions/index.ts"]) {
    console.warn("⚠️ Missing functions/index.ts — injecting a minimal handler");
    files["functions/index.ts"] =
      `export default {
  async fetch(request: Request, env: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (env.ASSETS) {
      const key = path.startsWith("/") ? path.slice(1) : path;
      const content = await env.ASSETS.get(key, { type: "text" });
      if (content) {
        return new Response(content, { headers: { "Content-Type": (key.endsWith(".html")?"text/html": key.endsWith(".css")?"text/css": key.endsWith(".js")?"application/javascript": "text/plain") } });
      }
    }
    return new Response("Hello from LaunchWing!", { headers: { "Content-Type": "text/plain" } });
  }
};`;
  }

  // Ensure wrangler.toml exists or is patched (the sanitizer already tries, but defend here too)
  if (!files["wrangler.toml"]) {
    const today = new Date().toISOString().slice(0, 10);
    let toml = `name = "${projectName}"
main = "functions/index.ts"
compatibility_date = "${today}"`;
    if (env.CF_ACCOUNT_ID) toml += `\naccount_id = "${env.CF_ACCOUNT_ID}"`;
    if (hasPublic) {
      toml += `

[site]
bucket = "./public"`;
    }
    if (assetsKvId) {
      toml += `

[[kv_namespaces]]
binding = "ASSETS"
id = "${assetsKvId}"`;
    }
    files["wrangler.toml"] = toml;
  }

  // Ensure GitHub Actions workflow exists
  if (!files[".github/workflows/deploy.yml"]) {
    files[".github/workflows/deploy.yml"] = `name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`.trim();
  }

  // Commit to GitHub
  console.log("🚀 Calling commitToGitHub...");
  const repoUrl = await commitToGitHub(payload.ideaId, files, {
    token: env.GITHUB_PAT,
    org: 'LaunchWing',
  });
  console.log("✅ GitHub repo created:", repoUrl);

  const pagesUrl = `https://${projectName}.promptpulse.workers.dev`;
  console.log("✅ Deployment planned to:", pagesUrl);

  return {
    pagesUrl,
    repoUrl,
    plan: fallbackPlan,
  };
}