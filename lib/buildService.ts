/*
 * This module provides scaffolding for building and deploying an MVP based on
 * conversational context.  The current assistant only returns a high‑level
 * plan, so this file outlines the steps needed to generate source code,
 * package it, commit it to a repository and deploy it to Cloudflare Pages.
 *
 * Note: None of the functions in this file are wired into the application
 * yet.  They are skeletons intended to be fleshed out as the underlying
 * services (code generation, GitHub integration, Pages deployment) become
 * available.  See README.md for integration guidance.
 */

import JSZip from "jszip";

/**
 * Data describing the MVP to be built.  The assistant should provide
 * sufficient information for code generation, including a summarised idea,
 * branding details and the final plan text.
 */
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

/**
 * Primary entry point for building and deploying an application.  Given a
 * payload describing the idea and plan, this function will:
 *
 * 1. Request source code from an upstream build agent.
 * 2. Extract the project structure from the returned archive or JSON.
 * 3. Commit the code to a new or existing GitHub repository.
 * 4. Trigger a deployment to Cloudflare Pages and return the URL.
 *
 * Environment variables required (to be supplied via worker secrets):
 *  - BUILD_AGENT_URL: Endpoint that accepts a BuildPayload and returns
 *    project files.  This should be the future replacement for the
 *    current `/build` endpoint.
 *  - PAT_GITHUB: Personal access token with repo scope for committing code.
 *  - CF_API_TOKEN: API token with Cloudflare Pages write permissions.
 *  - CF_ACCOUNT_ID, CF_PAGES_PROJECT: Identifiers for your Pages project.
 */
export async function buildAndDeployApp(payload: BuildPayload) {
  // 1. Call the build agent to generate code.
  const buildRes = await fetch(
    (globalThis as any).BUILD_AGENT_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!buildRes.ok) {
    const err = await buildRes.text();
    throw new Error(`build agent error: ${err}`);
  }
  const buildData = await buildRes.json();

  // If the agent couldn’t generate code, fall back to returning the plan.
  if (!buildData.archive) {
    const files = generateSimpleApp(buildData.plan || payload.plan, payload.branding);
    const repoUrl = await commitToGitHub(payload.ideaId, files);
    const pagesUrl = await deployToPages(repoUrl);
    return { pagesUrl, repoUrl, plan: buildData.plan || payload.plan };
  }

  // 2. Decode the base64 ZIP into files using JSZip.
  const zip = new JSZip();
  const bytes = Uint8Array.from(atob(buildData.archive), (c) => c.charCodeAt(0));
  const project = await zip.loadAsync(bytes);
  const files: Record<string, string> = {};
  await Promise.all(
    Object.keys(project.files).map(async (filePath) => {
      const file = project.files[filePath];
      if (!file.dir) {
        const content = await file.async("string");
        files[filePath] = content;
      }
    }),
  );

  // 3. Commit the files to GitHub.
  const repoUrl = await commitToGitHub(payload.ideaId, files);

  // 4. Trigger a Pages deployment with the new repository.
  const pagesUrl = await deployToPages(repoUrl);

  return { pagesUrl, repoUrl };
}

/*
 * Create or update a GitHub repository and push the provided files.
 */
async function commitToGitHub(ideaId: string, files: Record<string, string>) {
  // Use PAT_GITHUB to authenticate with GitHub instead of GITHUB_TOKEN.
  const token    = (globalThis as any).PAT_GITHUB;
  const username = (globalThis as any).GITHUB_USERNAME;
  const org      = (globalThis as any).GITHUB_ORG;
  if (!token || (!username && !org)) {
    throw new Error("GitHub credentials are not configured");
  }
  const repoName = `mvp-${ideaId}`;

  // Choose the owner (org if provided, otherwise user)
  const owner = org || username;

  // Create the repository
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

  // Write blobs
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

  // Get reference to current commit (if any)
  const refRes = await fetch(`https://api.github.com/repos/${owner}/${repoName}/git/ref/heads/main`, {
    headers: { Authorization: `token ${token}` },
  });
  const refData = await refRes.json();
  const baseCommitSha = refData.object?.sha;

  // Create a tree from the blobs
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

  // Create a commit
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

  // Update the branch reference
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

/*
 * Trigger a Cloudflare Pages deployment using the new repository.
 */
async function deployToPages(repoUrl: string) {
  const accountId   = (globalThis as any).CF_ACCOUNT_ID;
  const projectName = (globalThis as any).CF_PAGES_PROJECT;
  const token       = (globalThis as any).CF_API_TOKEN;
  if (!accountId || !projectName || !token) {
    throw new Error("Cloudflare Pages credentials are not configured");
  }

  // Parse owner and repo from repoUrl
  const match = repoUrl.match(/github.com\\/([^/]+)\\/([^/]+)$/);
  if (!match) {
    throw new Error(`Unable to parse repoUrl: ${repoUrl}`);
  }
  const owner    = match[1];
  const repoName = match[2];

  // Call the Pages API to create a deployment
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
    },
  );
  const data = await res.json();
  if (!res.ok || data.success === false) {
    throw new Error(
      `Pages deployment error: ${data.errors ? JSON.stringify(data.errors) : res.statusText}`,
    );
  }
  return data.result?.url || `https://${projectName}.pages.dev`;
}

/**
 * Generate a simple static site if no code generator is available.
 */
function generateSimpleApp(plan: string, branding: any): Record<string, string> {
  const appName = branding?.name || "My AI App";
  const tagline = branding?.tagline || "An AI‑powered experience";
  // Determine a primary colour
  let primaryColour: string | undefined;
  if (branding?.palette) {
    if (Array.isArray(branding.palette) && branding.palette.length > 0) {
      primaryColour = branding.palette[0];
    } else if (typeof branding.palette === "object") {
      primaryColour = branding.palette.primary || branding.palette.main;
    }
  } else if (branding?.colors) {
    primaryColour = branding.colors.primary || branding.colors[0];
  }
  if (!primaryColour) {
    primaryColour = "#0066cc";
  }
  // Escape the plan and wrap it in paragraphs
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${appName}</title>
  <link rel="stylesheet" href="styles.css">
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
  margin: 0;
  padding: 0;
  line-height: 1.6;
  background: #f5f5f5;
  color: #333;
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

h1, h2 {
  margin-top: 0;
}

.tagline {
  font-style: italic;
  font-size: 1rem;
}

.footer {
  text-align: center;
  padding: 1rem;
  font-size: 0.8rem;
  color: #666;
}`;

  const appJs = `// Placeholder for future interactive code

export function init() {
  console.log('Application initialised');
}

// Automatically call init when the page loads
window.addEventListener('DOMContentLoaded', init);`;

  return {
    "index.html": indexHtml,
    "styles.css": stylesCss,
    "app.js": appJs,
  };
}