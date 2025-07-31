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

  // We no longer trigger deployToPages — rely on GitHub push to trigger Pages auto-deploy
  return { pagesUrl: null, repoUrl, plan: fallbackPlan };
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
      "User-Agent": "LaunchWing-Agent"
    },
    body: JSON.stringify({
      name: repoName,
      private: true,
      auto_init: true // Ensures repo isn't empty so commits succeed
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
          "User-Agent": "LaunchWing-Agent"
        },
        body: JSON.stringify({
          content: Buffer.from(content).toString("base64"),
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
        "User-Agent": "LaunchWing-Agent"
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
        "User-Agent": "LaunchWing-Agent"
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
        "User-Agent": "LaunchWing-Agent"
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
        "User-Agent": "LaunchWing-Agent"
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

function generateSimpleApp(plan: string, branding: any): Record<string, string> {
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

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName}</title>
  <link rel="stylesheet" href="styles.css" />
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
  <script src="app.js"></script>
</body>
</html>`;

  const stylesCss = `body {
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
}`;

  const appJs = `export function init() {
  console.log("App initialized");
}
window.addEventListener("DOMContentLoaded", init);`;

  return {
    "index.html": indexHtml,
    "styles.css": stylesCss,
    "app.js": appJs,
  };
}