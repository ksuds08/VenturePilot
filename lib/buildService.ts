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

  const files = generateSimpleApp(fallbackPlan, payload.branding);
  const repoUrl = await commitToGitHub(payload.ideaId, files);

  // Create Pages project to ensure deploy target exists
  const projectName = `mvp-${payload.ideaId}`;
  await ensurePagesProject(projectName);

  return { pagesUrl: null, repoUrl, plan: fallbackPlan };
}

// Helper: UTF-8 safe base64 encoder
function toBase64(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

async function commitToGitHub(ideaId: string, files: Record<string, string>) {
  const token = (globalThis as any).PAT_GITHUB;
  const username = (globalThis as any).GITHUB_USERNAME;
  const org = (globalThis as any).GITHUB_ORG;
  if (!token || (!username && !org)) {
    throw new Error("GitHub credentials are not configured");
  }

  const repoName = `mvp-${ideaId}`;
  const owner = org || username;

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

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`GitHub repo creation failed: ${text}`);
  }

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

async function ensurePagesProject(projectName: string) {
  const token = (globalThis as any).CF_API_TOKEN;
  const accountId = (globalThis as any).CF_ACCOUNT_ID;
  if (!token || !accountId) {
    throw new Error("Missing Cloudflare credentials for Pages project creation.");
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: projectName,
        production_branch: "main",
        build_config: { build_command: "", destination_dir: "./", root_dir: "" },
        source: { type: "github", config: { owner: "LaunchWing", repo_name: projectName, production_branch: "main" } },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok && data.errors?.[0]?.code !== 81044) {
    throw new Error(`Pages project creation failed: ${JSON.stringify(data.errors)}`);
  }
}

function generateSimpleApp(plan: string, branding: any): Record<string, string> {
  const appName = branding?.name || "My AI App";
  const tagline = branding?.tagline || "An AI‑powered experience";
  const primaryColour = branding?.palette?.primary || "#0066cc";

  const escapedPlan = plan.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = escapedPlan.split(/\n+/).map((p) => `<p>${p}</p>`).join("\n");

  return {
    "index.html": `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${appName}</title><link rel="stylesheet" href="styles.css" /></head><body><header class="header"><h1>${appName}</h1><p class="tagline">${tagline}</p></header><main class="container"><h2>MVP Plan</h2>${paragraphs}</main><footer class="footer"><p>Generated by AI on ${new Date().toLocaleDateString()}</p></footer><script src="app.js"></script></body></html>`,
    "styles.css": `body { font-family: sans-serif; background: #f5f5f5; color: #333; margin: 0; padding: 0; line-height: 1.6; } .header { background: ${primaryColour}; color: #fff; padding: 1rem; text-align: center; } .container { max-width: 800px; margin: 2rem auto; padding: 0 1rem; } .footer { text-align: center; padding: 1rem; font-size: 0.8rem; color: #666; }`,
    "app.js": `export function init() { console.log("App initialized"); } window.addEventListener("DOMContentLoaded", init);`,
    "README.md": `# ${appName}\n\nGenerated via LaunchWing\n\n- Auto‑deploys using GitHub Actions & Cloudflare Pages`,
    "wrangler.toml": `name = "${projectName}"\ncompatibility_date = "${new Date().toISOString().split("T")[0]}"\npages_build_output_dir = "./"`,
    ".github/workflows/deploy.yml": `name: Deploy to Cloudflare Pages\n\non:\n  push:\n    branches: [main]\n\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Checkout\n        uses: actions/checkout@v3\n\n      - name: Install Wrangler\n        run: npm install -g wrangler\n\n      - name: Deploy with Wrangler\n        run: wrangler pages deploy ./ --project-name="\${{ secrets.CF_PAGES_PROJECT }}" --branch=main\n        env:\n          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}`,
    "tsconfig.json": `{"compilerOptions":{"target":"es2017","downlevelIteration":true,"module":"esnext","moduleResolution":"node","strict":true,"esModuleInterop":true,"skipLibCheck":true,"forceConsistentCasingInFileNames":true}}`
  };
}