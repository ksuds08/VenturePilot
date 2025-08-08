// lib/build/buildService.ts

import { commitToGitHub } from './commitToGitHub';
import { sanitizeGeneratedFiles } from './sanitizeGeneratedFiles';
import type { BuildPayload } from './types';
import { planProjectFiles } from './planProjectFiles';
import { generateCodeBatch } from './generateCodeBatch';
import { chunkArray } from './chunkArray';
import { ensureAssetsKv } from '../cloudflare/createKvNamespace';

/* ------------------- config ------------------- */
const BATCH_SIZE = parseInt(process.env.CODEGEN_BATCH_SIZE || "5", 10);

/* ------------------- main API ------------------- */
export async function buildAndDeployApp(
  payload: BuildPayload,
  env: {
    CF_API_TOKEN?: string;
    CF_ACCOUNT_ID?: string;
    GITHUB_PAT: string;
  }
) {
  const projectName = `mvp-${payload.ideaId}`;
  let allGeneratedFiles: { path: string; content: string }[] = [];

  /* ------------------- 1) Planning pass ------------------- */
  console.log("📐 Planning project files...");
  const plan = await planProjectFiles(payload);
  console.log(`✅ Plan ready: ${plan.files.length} files, shared: ${plan.sharedFiles.length}`);

  /* ------------------- 2) Generate shared files first ------------------- */
  if (plan.sharedFiles.length > 0) {
    console.log("🛠 Generating shared files...");
    const shared = await generateCodeBatch(plan.sharedFiles, {
      plan,
      alreadyGenerated: [],
      env
    });
    allGeneratedFiles.push(...shared);
  }

  /* ------------------- 3) Generate remaining files in batches ------------------- */
  const remainingFiles = plan.files.filter(
    f => !plan.sharedFiles.includes(f.path)
  );

  const batches = chunkArray(remainingFiles, BATCH_SIZE);
  for (const batch of batches) {
    console.log(`🛠 Generating batch of ${batch.length} files...`);
    const batchFiles = await generateCodeBatch(batch, {
      plan,
      alreadyGenerated: allGeneratedFiles,
      env
    });
    allGeneratedFiles.push(...batchFiles);
  }

  /* ------------------- 4) Sanitize ------------------- */
  const sanitized = sanitizeGeneratedFiles(allGeneratedFiles, {
    ideaId: payload.ideaId,
    env: {
      CLOUDFLARE_API_TOKEN: env.CF_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CF_ACCOUNT_ID
    }
  });

  /* ------------------- 5) Ensure KV if needed ------------------- */
  const hasPublic = sanitized.some(f => f.path.startsWith("public/"));
  let assetsKvId = "";
  if (hasPublic && env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
    assetsKvId = await ensureAssetsKv(projectName, env.CF_ACCOUNT_ID, env.CF_API_TOKEN);
    console.log("✅ ASSETS KV ensured:", assetsKvId);
  }

  /* ------------------- 6) Commit to GitHub ------------------- */
  let repoUrl = "";
  try {
    console.log("🚀 Committing to GitHub...");
    repoUrl = await commitToGitHub(payload.ideaId, sanitized, {
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
    plan
  };
}