export interface BuildPayload {
  ideaId: string;
  ideaSummary: {
    name: string;
    description: string;
  };
  branding: any;
  plan: string;
  messages: { role: string; content: string }[];
}

export async function buildAndDeployApp(payload: BuildPayload) {
  // Skip calling a build agent for now and fallback to static app
  let files = generateSimpleApp(payload.plan, payload.branding);

  // ✅ Validate file structure
  files = Object.fromEntries(
    Object.entries(files).filter(([path, content]) => {
      if (
        typeof path !== "string" ||
        typeof content !== "string" ||
        path.length > 200 ||
        !/^[^/\\?%*:|"<>]+(?:\/[^/\\?%*:|"<>]+)*$/.test(path)
      ) {
        console.warn("❌ Skipping invalid file:", path);
        return false;
      }
      return true;
    })
  );

  const fileCount = Object.keys(files).length;
  if (fileCount === 0) {
    throw new Error("No valid files to deploy");
  }

  console.log("✅ Validated files:", Object.keys(files));

  const repoUrl = await commitToGitHub(payload.ideaId, files);
  const pagesUrl = await deployToPages(repoUrl);
  return { pagesUrl, repoUrl, plan: payload.plan };
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

  await fetch(createRepoEndpoint, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: repoName,
      private: true,
    }),
  });

  const blobs: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const [path, content] of Object.entries(files)) {
    const blobRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/blobs`, {
      method: "POST",
      headers: {
        Authorization: `token ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: Buffer.from(content).toString("base64"),
        encoding: "base64",
      }),
    });
    const { sha } = await blobRes.json();
    blobs.push({ path, mode: "100644", type: "blob", sha });
  }

  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/main`, {
    headers: { Authorization: `token ${token}` },
  });
  const refData = await refRes.json();
  const baseCommitSha = refData.object?.sha;

  const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/trees`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tree: blobs,
      base_tree: baseCommitSha || undefined,
    }),
  });
  const { sha: newTreeSha } = await treeRes.json();

  const commitRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/commits`, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: "Initial MVP commit",
      tree: newTreeSha,
      parents: baseCommitSha ? [baseCommitSha] : [],
    }),
  });
  const { sha: newCommitSha } = await commitRes.json();

  await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/refs/heads/main`, {
    method: "PATCH",
    headers: {
      Authorization: `token ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sha: newCommitSha,
      force: true,
    }),
  });

  return `https://github.com/${owner}/${repoName}`;
}

async function deployToPages(repoUrl: string) {
  const accountId = (globalThis as any).CF_ACCOUNT_ID;
  const projectName = (globalThis as any).CF_PAGES_PROJECT;
  const token = (globalThis as any).CF_API_TOKEN;
  if (!accountId || !projectName || !token) {
    throw new Error("Cloudflare Pages credentials are not configured");
  }

  let owner;
  let repoName;
  try {
    const urlObj = new URL(repoUrl);
    const segments = urlObj.pathname.split("/").filter(Boolean);
    owner = segments[0];
    repoName = segments[1];
  } catch {
    throw new Error(`Unable to parse repoUrl: ${repoUrl}`);
  }

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        deployment_trigger: {
          type: "github",
          config: {
            repo_owner: owner,
            repo_name: repoName,
            production_branch: "main",
          },
        },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(
      `Pages deployment error: ${data.errors ? JSON.stringify(data.errors) : res.statusText}`
    );
  }

  return data.result?.url || `https://${projectName}.pages.dev`;
}

function generateSimpleApp(plan: string, branding: any): Record<string, string> {
  const appName = branding?.name || "My AI App";
  const tagline = branding?.tagline || "An AI‑powered experience";
  let primaryColour = branding?.palette?.primary || "#0066cc";

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