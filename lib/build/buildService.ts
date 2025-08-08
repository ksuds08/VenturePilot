// lib/build/buildService.ts

import type { BuildPayload } from "./types";
import { planProjectFiles } from "./planProjectFiles";
import { generateCodeBatch } from "./generateCodeBatch";
import { chunkArray } from "./chunkArray";
import { ensureAssetsKv } from "../cloudflare/createKvNamespace";
import { commitToGitHub } from "./commitToGitHub";
import { sanitizeGeneratedFiles } from "./sanitizeGeneratedFiles";

/* ------------------- safe env access (no Node globals) ------------------- */

const getEnv = (key: string, def?: string): string | undefined => {
  // Node/Bun
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromProcess = typeof process !== "undefined" && (process as any)?.env ? (process as any).env[key] : undefined;
  if (fromProcess !== undefined) return fromProcess;

  // Optional shim some folks inject (ignored if absent)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fromGlobal = (globalThis as any)?.__ENV__?.[key];
  if (fromGlobal !== undefined) return fromGlobal;

  return def;
};

// Config with safe fallbacks
const BATCH_SIZE = parseInt(getEnv("CODEGEN_BATCH_SIZE", "5")!, 10);
const CF_API_TOKEN = getEnv("CF_API_TOKEN") || getEnv("CLOUDFLARE_API_TOKEN");
const CF_ACCOUNT_ID = getEnv("CF_ACCOUNT_ID") || getEnv("CLOUDFLARE_ACCOUNT_ID");
const GITHUB_ORG = getEnv("GITHUB_ORG", "LaunchWing")!;
const GITHUB_PAT = getEnv("GITHUB_PAT") || getEnv("GITHUB_TOKEN") || "";

/* ----------------------------- types ----------------------------- */

type GenInput = { path: string; description: string };
type GenResult = { path: string; content: string };

/* --------------------------- main service --------------------------- */

export async function buildAndDeployApp(
  payload: BuildPayload & {
    files?: { path: string; content: string }[];
  }
) {
  const ideaId = payload.ideaId || "mvp";
  const projectName = `mvp-${ideaId}`;

  // 1) Plan files (uses model only if available; otherwise deterministic)
  const { plan, filesToGenerate } = await planProjectFiles(payload);

  // 2) Generate code in small batches to avoid OOM
  const batches = chunkArray<GenInput>(filesToGenerate, BATCH_SIZE);
  const generated: GenResult[] = [];

  for (const batch of batches) {
    const already = generated.map((f) => ({ path: f.path, content: f.content }));
    const out = await generateCodeBatch(batch, { plan, alreadyGenerated: already });
    generated.push(...out);
  }

  // 3) Sanitize/normalize + ensure Worker/wrangler/workflow/public
  const sanitized = sanitizeGeneratedFiles(
    generated,
    {
      ideaId,
      env: {
        CLOUDFLARE_API_TOKEN: CF_API_TOKEN,
        CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT_ID,
      },
    }
  );

  // 4) Ensure ASSETS KV if we’re serving public/ or worker references env.ASSETS
  const hasPublic = sanitized.some((f) => f.path.startsWith("public/"));
  const workerTxt = sanitized.find((f) => f.path === "functions/index.ts")?.content || "";
  const wantsAssets = hasPublic || /env\.ASSETS\b/.test(workerTxt);

  let assetsKvId = "";
  if (wantsAssets && CF_API_TOKEN && CF_ACCOUNT_ID) {
    assetsKvId = await ensureAssetsKv(projectName, CF_ACCOUNT_ID, CF_API_TOKEN);
    // If wrangler.toml was present, we don’t rewrite here; sanitizer already injected [site] and account_id.
    // KV binding is optional at author time because the worker reads env.ASSETS if bound.
  }

  // 5) Commit to GitHub
  if (!GITHUB_PAT) {
    throw new Error("GITHUB_PAT (or GITHUB_TOKEN) is required to commit the repo.");
  }

  const filesRecord = Object.fromEntries(sanitized.map((f) => [f.path, f.content]));
  const repoUrl = await commitToGitHub(ideaId, filesRecord, {
    token: GITHUB_PAT,
    org: GITHUB_ORG,
  });

  // 6) Compute preview URL (informational)
  const pagesUrl = `https://${projectName}.promptpulse.workers.dev`;

  return {
    pagesUrl,
    repoUrl,
    plan,
    assetsKvId,
  };
}