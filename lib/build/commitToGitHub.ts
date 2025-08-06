import { toBase64 } from "./toBase64";

export async function commitToGitHub(
  ideaId: string,
  files: Record<string, string>,
  opts?: { token?: string; org?: string }
): Promise<string> {
  const token = opts?.token || (globalThis as any).PAT_GITHUB;
  const org = opts?.org || (globalThis as any).GITHUB_ORG;
  const username = (globalThis as any).GITHUB_USERNAME;

  console.log("🔐 GitHub Token Present:", Boolean(token));
  console.log("📛 GitHub Org:", org || "(none)");
  console.log("👤 GitHub Username:", username || "(none)");

  if (!token) {
    console.error("❌ Missing GitHub token");
    throw new Error("GitHub token is required");
  }

  const repoName = `mvp-${ideaId}`;
  const owner = org || username;

  if (!owner) {
    console.error("❌ No GitHub owner provided (org or username required)");
    throw new Error("GitHub org or username must be provided");
  }

  const createRepoEndpoint = org
    ? `https://api.github.com/orgs/${org}/repos`
    : `https://api.github.com/user/repos`;

  console.log(`📁 Creating GitHub repo: ${owner}/${repoName}`);

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
    console.error("❌ GitHub repo creation failed:", text);
    throw new Error(`GitHub repo creation failed: ${text}`);
  }

  console.log("✅ Repo created. Uploading files...");

  const blobs: { path: string; mode: string; type: string; sha: string }[] = [];

  for (const [rawPath, content] of Object.entries(files)) {
    const path = rawPath?.trim().replace(/^\/+/, "");
    if (!path) {
      console.warn(`⚠️ Skipping file with empty or invalid path: "${rawPath}"`);
      continue;
    }

    console.log(`📦 Creating blob for: ${path}`);

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
      console.error(`❌ Blob creation failed for ${path}:`, text);
      throw new Error(`Blob creation failed for ${path}: ${text}`);
    }

    const { sha } = await blobRes.json();
    blobs.push({ path, mode: "100644", type: "blob", sha });
  }

  console.log("🌲 Creating tree...");

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
    console.error("❌ Tree creation failed:", text);
    throw new Error(`Tree creation failed: ${text}`);
  }

  const { sha: newTreeSha } = await treeRes.json();

  console.log("📝 Creating commit...");

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
    console.error("❌ Commit failed:", text);
    throw new Error(`Commit failed: ${text}`);
  }

  const { sha: newCommitSha } = await commitRes.json();

  console.log("🔁 Updating ref to point to new commit...");

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
    console.error("❌ Ref update failed:", text);
    throw new Error(`Patch ref failed: ${text}`);
  }

  const repoUrl = `https://github.com/${owner}/${repoName}`;
  console.log("✅ GitHub commit complete:", repoUrl);
  return repoUrl;
}