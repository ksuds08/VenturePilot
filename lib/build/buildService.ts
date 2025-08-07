import { commitToGitHub } from './commitToGitHub';
import { generateSimpleApp } from './generateSimpleApp';
import { createKvNamespace } from '../cloudflare/createKvNamespace';
import { sanitizeGeneratedFiles } from './sanitizeGeneratedFiles';
import type { BuildPayload } from './types';

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

function defaultWranglerToml(projectName: string, kvNamespaceId?: string): string {
  return `name = "${projectName}"
main = "functions/index.ts"
compatibility_date = "2024-08-01"
${kvNamespaceId ? `
[[kv_namespaces]]
binding = "SUBMISSIONS_KV"
id = "${kvNamespaceId}"
` : ''}`.trim();
}

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
  async fetch(request, env) {
    return new Response("Hello from LaunchWing!", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};`;
}

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

  let kvNamespaceId = '';

  const needsKv = payload.files?.some(f =>
    f.path === 'functions/index.ts' && f.content.includes('env.SUBMISSIONS_KV')
  );

  if (needsKv) {
    if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
      try {
        kvNamespaceId = await createKvNamespace({
          token: env.CF_API_TOKEN,
          accountId: env.CF_ACCOUNT_ID,
          title: `submissions-${projectName}-${Date.now()}`,
        });
        console.log("✅ KV namespace created:", kvNamespaceId);
      } catch (err) {
        console.error("❌ KV namespace creation failed:", err);
        throw new Error(`❌ KV required but failed to create: ${err.message}`);
      }
    } else {
      console.error("❌ KV required but credentials missing");
      throw new Error("❌ This app requires KV, but Cloudflare credentials are missing.");
    }
  } else {
    console.log("✅ KV not used — skipping KV creation.");
  }

  let files: Record<string, string>;

  if (payload.files) {
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

    if (!files['wrangler.toml']) {
      console.warn("⚠️ Missing wrangler.toml — injecting fallback");
      files['wrangler.toml'] = defaultWranglerToml(projectName, kvNamespaceId);
    }

    if (!files['.github/workflows/deploy.yml']) {
      console.warn("⚠️ Missing deploy.yml — injecting fallback");
      files['.github/workflows/deploy.yml'] = defaultDeployYaml();
    }

    if (!files['functions/index.ts']) {
      console.warn("⚠️ Missing functions/index.ts — injecting fallback Worker");
      files['functions/index.ts'] = defaultWorkerHandler();
    }
  } else {
    console.warn("⚠️ No agent files provided — falling back to generateSimpleApp()");
    files = await generateSimpleApp(fallbackPlan, payload.branding, projectName, kvNamespaceId);
    console.log("✅ Fallback files generated");
  }

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