export interface BuildPayload {
  ideaId: string;
  ideaSummary: {
    name: string;
    description: string;
  };
  branding: any;
  plan?: string;
  messages: { role: string; content: string }[];
}

export async function buildAndDeployApp(payload: BuildPayload) {
  const fallbackPlan =
    payload.plan || payload.ideaSummary?.description || "No plan provided";

  const projectName = `mvp-${payload.ideaId}`;

  // Generate a minimal, valid Worker + public assets project
  const files = generateSimpleApp(fallbackPlan, payload.branding, projectName);

  // Push to GitHub
  const repoUrl = await commitToGitHub(payload.ideaId, files);

  return {
    pagesUrl: `https://${projectName}.promptpulse.workers.dev`,
    repoUrl,
    plan: fallbackPlan,
  };
}

/* ----------------------- GitHub helpers ----------------------- */

function toBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function commitToGitHub(ideaId: string, files: Record<string, string>) {
  const token = (globalThis as any).PAT_GITHUB || (globalThis as any).GITHUB_PAT;
  const username = (globalThis as any).GITHUB_USERNAME;
  const org = (globalThis as any).GITHUB_ORG;

  if (!token || (!username && !org)) {
    throw new Error("GitHub credentials are not configured");
  }

  const repoName = `mvp-${ideaId}`;
  const owner = org || username;

  // 1) Create repo (or no-op if it exists)
  const createRepoEndpoint = org
    ? `https://api.github.com/orgs/${org}/repos`
    : `https://api.github.com/user/repos`;

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

  if (!createRes.ok && createRes.status !== 422) {
    // 422 = "already exists"
    const text = await createRes.text();
    throw new Error(`GitHub repo creation failed: ${text}`);
  }

  // 2) Prepare blobs
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

  // 3) Get base ref
  const refRes = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/main`,
    {
      headers: {
        Authorization: `token ${token}`,
        "User-Agent": "LaunchWing-Agent",
      },
    }
  );

  const baseCommitSha = refRes.ok ? (await refRes.json()).object?.sha : undefined;

  // 4) Create tree
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

  // 5) Create commit
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

  // 6) Update ref
  const patchRes = await fetch(
    `https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/main`,
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

  if (!patchRes.ok) {
    const text = await patchRes.text();
    throw new Error(`Patch ref failed: ${text}`);
  }

  return `https://github.com/${owner}/${repoName}`;
}

/* ----------------------- Project generator ----------------------- */

function generateSimpleApp(
  plan: string,
  branding: any,
  projectName: string,
): Record<string, string> {
  const appName = branding?.name || "My AI App";
  const tagline = branding?.tagline || "An AI‑powered experience";
  const primaryColour = branding?.palette?.primary || "#0066cc";
  const today = new Date().toISOString().split("T")[0];

  const escapedPlan = (plan || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escapedPlan
    .split(/\n+/)
    .map((p) => `<p>${p}</p>`)
    .join("\n");

  // ✅ wrangler v4 assets flow + tiny proxy worker
  return {
    // --- public assets ---
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
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
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

    "public/app.js": `(() => {
  console.log("App initialized");
})();`,

    // --- Worker: just forwards to assets (v4) ---
    "functions/index.ts": `export default {
  async fetch(request: Request, env: any): Promise<Response> {
    // In Wrangler v4, [assets] binds a service at env.ASSETS.
    // Forward everything to static assets. If you later want /api routes,
    // handle those before this line.
    return env.ASSETS.fetch(request);
  }
};`,

    // --- wrangler.toml (v4) ---
    "wrangler.toml": `name = "${projectName}"
main = "functions/index.ts"
compatibility_date = "${today}"

[assets]
directory = "public"
`,

    // --- (tiny) tsconfig so TypeScript compiles cleanly if used ---
    "tsconfig.json": `{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true
  }
}`,

    // --- GitHub Action (Wrangler v4, overridable) ---
    ".github/workflows/deploy.yml": `name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy with Wrangler v4
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          wranglerVersion: \${{ vars.WRANGLER_VERSION || '4.28.1' }}
`
  };
}