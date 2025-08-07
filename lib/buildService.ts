// lib/build/buildService.ts

export interface BuildPayload {
  ideaId: string;
  ideaSummary: {
    name: string;
    description: string;
  };
  branding: any;
  plan?: string;
  messages: { role: string; content: string }[];
  files?: { path: string; content: string }[]; // ✅ optional agent output
}

/**
 * Build & deploy:
 * 1) If payload.files present → sanitize & organize real app files.
 * 2) Else → generate a very simple static app (fallback).
 * 3) Ensure wrangler.toml + workflow exist and are correct.
 * 4) Create KV namespace when needed (ASSETS binding).
 * 5) Commit to GitHub.
 */
export async function buildAndDeployApp(payload: BuildPayload) {
  const fallbackPlan =
    payload.plan || payload.ideaSummary?.description || "No plan provided";

  const projectName = `mvp-${payload.ideaId}`;

  // Cloudflare/GitHub creds pulled from Worker env (set in your wrangler.toml vars)
  const CF_ACCOUNT_ID = (globalThis as any).CF_ACCOUNT_ID as string | undefined;
  const CF_API_TOKEN = (globalThis as any).CF_API_TOKEN as string | undefined;
  const GITHUB_PAT = (globalThis as any).PAT_GITHUB as string | undefined;
  const GITHUB_ORG = (globalThis as any).GITHUB_ORG as string | undefined;
  const GITHUB_USERNAME = (globalThis as any).GITHUB_USERNAME as string | undefined;

  if (!GITHUB_PAT) {
    throw new Error("Missing GitHub PAT (PAT_GITHUB) in environment.");
  }
  if (!GITHUB_ORG && !GITHUB_USERNAME) {
    throw new Error("Missing GitHub owner (GITHUB_ORG or GITHUB_USERNAME).");
  }

  // Build file map (either sanitize agent files or generate fallback)
  let fileMap: Record<string, string> = {};

  if (payload.files && payload.files.length > 0) {
    // Sanitize/organize generated files
    const sanitized = sanitizeGeneratedFiles(payload.files, {
      ideaId: payload.ideaId,
      env: {
        CLOUDFLARE_API_TOKEN: CF_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT_ID,
      },
    });

    fileMap = Object.fromEntries(sanitized.map(f => [f.path, f.content]));
  } else {
    // Fallback to simple app
    const kvId = CF_API_TOKEN && CF_ACCOUNT_ID
      ? await ensureAssetsKv(projectName, CF_ACCOUNT_ID, CF_API_TOKEN)
      : ""; // if absent, fallback app will still build (no KV binding injected)

    fileMap = generateSimpleApp(
      fallbackPlan,
      payload.branding,
      projectName,
      kvId,
      CF_ACCOUNT_ID
    );
  }

  // If the sanitized files use ASSETS binding or include /public, ensure KV exists & wrangler wired
  const wantsAssets =
    Object.keys(fileMap).some(p => p.startsWith("public/")) ||
    /env\.ASSETS\b/.test(fileMap["functions/index.ts"] || "");

  let assetsKvId = "";
  if (wantsAssets && CF_API_TOKEN && CF_ACCOUNT_ID) {
    assetsKvId = await ensureAssetsKv(projectName, CF_ACCOUNT_ID, CF_API_TOKEN);
  }

  // Ensure wrangler.toml exists and is correct
  if (!fileMap["wrangler.toml"]) {
    fileMap["wrangler.toml"] = makeWranglerToml({
      projectName,
      accountId: CF_ACCOUNT_ID,
      kvId: assetsKvId,
      hasPublic: Object.keys(fileMap).some(p => p.startsWith("public/")),
    });
  } else {
    // Minimal patching: if ASSETS binding referenced but no kv, create & patch
    if (wantsAssets && !/binding\s*=\s*"ASSETS"/.test(fileMap["wrangler.toml"])) {
      if (CF_API_TOKEN && CF_ACCOUNT_ID) {
        assetsKvId =
          assetsKvId ||
          (await ensureAssetsKv(projectName, CF_ACCOUNT_ID, CF_API_TOKEN));
        // Append KV block if missing
        fileMap["wrangler.toml"] += `

[[kv_namespaces]]
binding = "ASSETS"
id = "${assetsKvId}"
`;
      }
    }
    // Ensure accountId is present if we have it
    if (CF_ACCOUNT_ID && !/^\s*account_id\s*=/.test(fileMap["wrangler.toml"])) {
      fileMap["wrangler.toml"] = fileMap["wrangler.toml"].replace(
        /\bname\s*=\s*".*?"/,
        (m) => `${m}\naccount_id = "${CF_ACCOUNT_ID}"`
      );
    }
    // Ensure site bucket if we have public assets
    if (
      Object.keys(fileMap).some(p => p.startsWith("public/")) &&
      !/\[site\][\s\S]*bucket\s*=/.test(fileMap["wrangler.toml"])
    ) {
      fileMap["wrangler.toml"] += `

[site]
bucket = "./public"
`;
    }
  }

  // Ensure GitHub Actions workflow exists and uses correct secret and action
  if (!fileMap[".github/workflows/deploy.yml"]) {
    fileMap[".github/workflows/deploy.yml"] = defaultDeployYaml();
  }

  // Ensure a default worker entry exists (if not provided by agent)
  if (!fileMap["functions/index.ts"]) {
    fileMap["functions/index.ts"] = defaultWorkerHandler();
  }

  const repoUrl = await commitToGitHub({
    ideaId: payload.ideaId,
    files: fileMap,
    token: GITHUB_PAT,
    org: GITHUB_ORG,
    username: GITHUB_USERNAME,
  });

  return {
    pagesUrl: `https://${projectName}.promptpulse.workers.dev`,
    repoUrl,
    plan: fallbackPlan,
  };
}

/* ---------------------------- helpers below ---------------------------- */

function defaultDeployYaml(): string {
  // ✅ Uses official action @v3 and the correct secret name. No bad "wranglerVersion: 4".
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
`;
}

function makeWranglerToml(params: {
  projectName: string;
  accountId?: string;
  kvId?: string;
  hasPublic: boolean;
}): string {
  const today = new Date().toISOString().slice(0, 10);
  const parts: string[] = [];
  parts.push(`name = "${params.projectName}"`);
  parts.push(`main = "functions/index.ts"`);
  parts.push(`compatibility_date = "${today}"`);
  if (params.accountId) parts.push(`account_id = "${params.accountId}"`);
  if (params.kvId) {
    parts.push(`
[[kv_namespaces]]
binding = "ASSETS"
id = "${params.kvId}"`.trim());
  }
  if (params.hasPublic) {
    parts.push(`
[site]
bucket = "./public"`.trim());
  }
  return parts.join("\n");
}

async function ensureAssetsKv(
  projectName: string,
  accountId: string,
  token: string
): Promise<string> {
  const title = `${projectName}-ASSETS`;
  // Try to find existing namespace first
  try {
    const list = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    ).then(r => r.json() as any);

    const found = list?.result?.find((ns: any) => ns.title === title);
    if (found?.id) return found.id;
  } catch {
    // ignore listing errors; we'll attempt create
  }

  // Create
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  const data = await res.json();
  if (!res.ok || !data?.result?.id) {
    throw new Error(
      `Failed to create KV namespace: ${JSON.stringify(data?.errors || data)}`
    );
  }
  return data.result.id;
}

function toBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function commitToGitHub(opts: {
  ideaId: string;
  files: Record<string, string>;
  token: string;
  org?: string;
  username?: string;
}) {
  const { ideaId, files, token, org, username } = opts;

  const repoName = `mvp-${ideaId}`;
  const owner = org || username!;
  const createRepoEndpoint = org
    ? `https://api.github.com/orgs/${org}/repos`
    : `https://api.github.com/user/repos`;

  // 1) Create repo (idempotent-ish: if already exists, continue)
  const createRes = await fetch(createRepoEndpoint, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "LaunchWing-Agent",
    },
    body: JSON.stringify({
      name: repoName,
      private: false,
      auto_init: true,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    if (!/name already exists/i.test(text)) {
      throw new Error(`GitHub repo creation failed: ${text}`);
    }
  }

  // 2) Build git tree via blobs → tree → commit → update ref
  const blobs: { path: string; mode: string; type: string; sha: string }[] = [];

  for (const [path, content] of Object.entries(files)) {
    const blobRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/blobs`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "LaunchWing-Agent",
        },
        body: JSON.stringify({
          content: toBase64(content),
          encoding: "base64",
        }),
      }
    );

    if (!blobRes.ok) {
      const text = await blobRes.text();
      throw new Error(`Blob creation failed for ${path}: ${text}`);
    }

    const { sha } = await blobRes.json();
    blobs.push({ path, mode: "100644", type: "blob", sha });
  }

  // main may not exist if auto_init failed previously; try both main and master
  const baseRefCandidates = ["heads/main", "heads/master"];
  let baseCommitSha: string | undefined;

  for (const ref of baseRefCandidates) {
    const refRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/ref/${ref}`,
      {
        headers: {
          Authorization: `token ${token}`,
          "User-Agent": "LaunchWing-Agent",
        },
      }
    );
    if (refRes.ok) {
      baseCommitSha = (await refRes.json()).object?.sha;
      break;
    }
  }

  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/git/trees`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "LaunchWing-Agent",
      },
      body: JSON.stringify({
        tree: blobs,
        base_tree: baseCommitSha || undefined,
      }),
    }
  );

  if (!treeRes.ok) {
    const text = await treeRes.text();
    throw new Error(`Tree creation failed: ${text}`);
  }

  const { sha: newTreeSha } = await treeRes.json();

  const commitRes = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/git/commits`,
    {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
        "User-Agent": "LaunchWing-Agent",
      },
      body: JSON.stringify({
        message: "Initial MVP commit",
        tree: newTreeSha,
        parents: baseCommitSha ? [baseCommitSha] : [],
      }),
    }
  );

  if (!commitRes.ok) {
    const text = await commitRes.text();
    throw new Error(`Commit failed: ${text}`);
  }

  const { sha: newCommitSha } = await commitRes.json();

  // Try to update main first, then master
  let updated = false;
  for (const ref of ["heads/main", "heads/master"]) {
    const patchRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/refs/${ref}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "LaunchWing-Agent",
        },
        body: JSON.stringify({
          sha: newCommitSha,
          force: true,
        }),
      }
    );
    if (patchRes.ok) {
      updated = true;
      break;
    }
  }

  if (!updated) {
    // If neither ref exists, create main
    await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/refs`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "LaunchWing-Agent",
        },
        body: JSON.stringify({
          ref: "refs/heads/main",
          sha: newCommitSha,
        }),
      }
    );
  }

  return `https://github.com/${owner}/${repoName}`;
}

/* ------------------- minimal fallback app generator ------------------- */

function generateSimpleApp(
  plan: string,
  branding: any,
  projectName: string,
  kvId: string,
  accountId?: string
): Record<string, string> {
  const appName = branding?.name || "My AI App";
  const tagline = branding?.tagline || "An AI‑powered experience";
  const primaryColour = branding?.palette?.primary || "#0066cc";

  const escapedPlan = plan
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escapedPlan
    .split(/\n+/)
    .map((p) => `<p>${p}</p>`)
    .join("\n");

  const today = new Date().toISOString().split("T")[0];

  const files: Record<string, string> = {
    "public/index.html": `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName}</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="header">
    <h1>${appName}</h1>
    <p class="tagline">${tagline}</p>
  </header>
  <main class="container">
    <h2>MVP Plan</h2>
    ${paragraphs}
  </main>
  <footer class="footer">
    <p>Generated by AI on ${new Date().toLocaleDateString()}</p>
  </footer>
  <script src="/app.js"></script>
</body>
</html>`,

    "public/styles.css": `body {
  font-family: sans-serif;
  background: #f5f5f5;
  color: #333;
  margin: 0;
  padding: 0;
  line-height: 1.6;
}
.header {
  background: ${primaryColour};
  color: #fff;
  padding: 1rem;
  text-align: center;
}
.container {
  max-width: 800px;
  margin: 2rem auto;
  padding: 0 1rem;
}
.footer {
  text-align: center;
  padding: 1rem;
  font-size: 0.8rem;
  color: #666;
}`,

    "public/app.js": `export function init() {
  console.log("App initialized");
}
window.addEventListener("DOMContentLoaded", init);`,

    "functions/index.ts": defaultWorkerHandler(),
    "wrangler.toml": makeWranglerToml({
      projectName,
      accountId,
      kvId,
      hasPublic: true,
    }),
    "tsconfig.json": `{
  "compilerOptions": {
    "target": "es2017",
    "downlevelIteration": true,
    "module": "esnext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}`,
    ".github/workflows/deploy.yml": defaultDeployYaml(),
    ".gitignore": `.wrangler
node_modules
dist
`,
  };

  return files;
}

function defaultWorkerHandler(): string {
  // Simple static file server using KV binding "ASSETS" if available,
  // else return a friendly message.
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

      // Fallback (no KV or file missing)
      return new Response("Hello from LaunchWing!", {
        headers: { "Content-Type": "text/plain" }
      });
    } catch (err) {
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
`;
}

/* ---------------- import at top or inline here ---------------- */

import { sanitizeGeneratedFiles } from "./sanitizeGeneratedFiles";