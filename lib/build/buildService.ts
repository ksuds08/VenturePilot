// lib/build/buildService.ts

import { commitToGitHub } from './commitToGitHub';
import { generateSimpleApp } from './generateSimpleApp';
import { createKvNamespace } from '../cloudflare/createKvNamespace';
import { sanitizeGeneratedFiles } from './sanitizeGeneratedFiles';
import type { BuildPayload } from './types';

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

/* ------------------- deploy files we might need to inject ------------------- */

function defaultDeployYaml(): string {
  return `name: Deploy to Cloudflare Workers

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

function defaultWorkerHandler(): string {
  return `export default {
  async fetch(request: Request, env: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;

      if (env.ASSETS) {
        const key = path.startsWith("/") ? path.slice(1) : path;
        const content = await env.ASSETS.get(key, { type: "text" });
        if (content) {
          return new Response(content, {
            headers: { "Content-Type": getContentType(key) },
          });
        }
      }

      return new Response("Hello from LaunchWing!", {
        headers: { "Content-Type": "text/plain" }
      });
    } catch {
      return new Response("Internal Error", { status: 500 });
    }
  }
};

function getContentType(file: string): string {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".js")) return "application/javascript";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "text/plain";
}
`.trim();
}

/* -------------------------- wrangler.toml helpers -------------------------- */

function makeWranglerToml(opts: {
  projectName: string;
  accountId?: string;
  kvId?: string;
  hasPublic: boolean;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`name = "${opts.projectName}"`);
  lines.push(`main = "functions/index.ts"`);
  lines.push(`compatibility_date = "${today}"`);
  if (opts.accountId) lines.push(`account_id = "${opts.accountId}"`);
  if (opts.kvId) {
    lines.push(`
[[kv_namespaces]]
binding = "ASSETS"
id = "${opts.kvId}"`.trim());
  }
  if (opts.hasPublic) {
    lines.push(`
[site]
bucket = "./public"`.trim());
  }
  return lines.join("\n");
}

// idempotent upserts
function addAccountIdOnce(toml: string, accountId?: string): string {
  if (!accountId) return toml;
  // If any account_id present anywhere, do nothing
  if (/^\s*account_id\s*=/m.test(toml)) return toml;
  // Insert after name="…", otherwise append
  const nameLine = /^\s*name\s*=\s*".*?"\s*$/m;
  if (nameLine.test(toml)) {
    return toml.replace(nameLine, (m) => `${m}\naccount_id = "${accountId}"`);
  }
  return (toml.trimEnd() + `\naccount_id = "${accountId}"\n`);
}

function addAssetsKvOnce(toml: string, kvId?: string): string {
  if (!kvId) return toml;
  if (/^\s*\[\[kv_namespaces\]\][\s\S]*?^\s*binding\s*=\s*"ASSETS"/m.test(toml)) {
    return toml; // already has ASSETS binding somewhere
  }
  return toml.trimEnd() + `

[[kv_namespaces]]
binding = "ASSETS"
id = "${kvId}"
`;
}

function addSiteBucketOnce(toml: string, hasPublic: boolean): string {
  if (!hasPublic) return toml;
  if (/\[site\][\s\S]*bucket\s*=/.test(toml)) return toml;
  return toml.trimEnd() + `

[site]
bucket = "./public"
`;
}

/* ------------------------------- utilities ------------------------------- */

async function ensureAssetsKv(projectName: string, accountId: string, token: string): Promise<string> {
  const title = `${projectName}-ASSETS`;

  // Try to reuse existing
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
    // ignore listing errors; we'll create below
  }

  // Create if missing
  return createKvNamespace({ token, accountId, title });
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

  // --- sanitize input or fall back to a trivial app scaffold ---
  let files: Record<string, string> = {};

  if (payload.files && payload.files.length > 0) {
    console.log("🧾 Raw file paths from agent:", payload.files.map(f => f.path));

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
    // For fallback, try to ensure KV so /public can be served from ASSETS if we upload later
    let kvId = "";
    if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
      try {
        kvId = await ensureAssetsKv(projectName, env.CF_ACCOUNT_ID, env.CF_API_TOKEN);
        console.log("✅ ASSETS KV ensured for fallback:", kvId);
      } catch (e) {
        console.warn("⚠️ Could not ensure ASSETS KV for fallback:", String(e));
      }
    }
    // generateSimpleApp has 4 params (plan, branding, projectName, kvId)
    files = await generateSimpleApp(fallbackPlan, payload.branding, projectName, kvId);
    console.log("✅ Fallback files generated");
  }

  // --- detect whether we need assets (KV + [site] bucket) ---
  const hasPublic = Object.keys(files).some(p => p.startsWith("public/"));
  const workerTxt = files["functions/index.ts"] || "";
  const wantsAssets = hasPublic || /env\.ASSETS\b/.test(workerTxt);

  // --- ensure/create KV if we want assets and creds exist ---
  let assetsKvId = "";
  if (wantsAssets && env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
    assetsKvId = await ensureAssetsKv(projectName, env.CF_ACCOUNT_ID, env.CF_API_TOKEN);
    console.log("✅ ASSETS KV ensured:", assetsKvId);
  } else if (wantsAssets) {
    console.warn("⚠️ Wants ASSETS but Cloudflare credentials missing — proceeding without KV.");
  }

  // --- ensure worker exists (serve from KV) ---
  if (!files["functions/index.ts"]) {
    console.warn("⚠️ Missing functions/index.ts — injecting default Worker");
    files["functions/index.ts"] = defaultWorkerHandler();
  }

  // --- ensure wrangler.toml is correct and idempotent ---
  if (!files["wrangler.toml"]) {
    files["wrangler.toml"] = makeWranglerToml({
      projectName,
      accountId: env.CF_ACCOUNT_ID,
      kvId: assetsKvId || undefined,
      hasPublic,
    });
  } else {
    let toml = files["wrangler.toml"];
    toml = addAccountIdOnce(toml, env.CF_ACCOUNT_ID);
    toml = addAssetsKvOnce(toml, wantsAssets ? assetsKvId : undefined);
    toml = addSiteBucketOnce(toml, hasPublic);
    files["wrangler.toml"] = toml;
  }

  // --- ensure GitHub Actions workflow exists ---
  if (!files[".github/workflows/deploy.yml"]) {
    console.warn("⚠️ Missing deploy.yml — injecting fallback");
    files[".github/workflows/deploy.yml"] = defaultDeployYaml();
  }

  // --- commit to GitHub ---
  let repoUrl = '';
  try {
    console.log("🚀 Calling commitToGitHub...");
    repoUrl = await commitToGitHub(payload.ideaId, files, {
      token: env.GITHUB_PAT,
      org: 'LaunchWing',
    });
    console.log("✅ GitHub repo created:", repoUrl);
  } catch (err) {
    console.error("❌ GitHub commit failed:", err);
    throw err;
  }

  const pagesUrl = `https://${projectName}.promptpulse.workers.dev`;
  console.log("✅ Deployment planned to:", pagesUrl);

  return {
    pagesUrl,
    repoUrl,
    plan: fallbackPlan,
  };
}