// lib/build/buildService.ts

/**
 * Orchestrates: plan -> batched codegen -> sanitize -> (optional) commit.
 * - Uses small batched requests to the agent/API to avoid OOM/timeouts.
 * - Passes only the minimal environment the generator needs.
 * - Avoids top-level `process` access so this file won’t explode when bundled by Wrangler.
 */

import { planProjectFiles } from "./planProjectFiles";
import { generateCodeBatch } from "./generateCodeBatch";
import { chunkArray } from "./chunkArray";
import { commitToGitHub } from "./commitToGitHub";
import { sanitizeGeneratedFiles } from "./sanitizeGeneratedFiles";

import type { BuildPayload } from "../../types";

/* -------------------------------------------------------------------------- */
/*                             Safe env accessors                              */
/* -------------------------------------------------------------------------- */

/**
 * Runtime-safe read of env values even when `process` is not defined (e.g., Wrangler).
 * Never referenced at module top-level; only inside functions.
 */
function readEnvVar(name: string): string | undefined {
  // Narrowly probe for process in multiple runtimes
  const anyGlobal: any = typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
  const maybeProc: any =
    typeof process !== "undefined"
      ? (process as any)
      : anyGlobal && typeof anyGlobal.process !== "undefined"
      ? (anyGlobal.process as any)
      : undefined;

  return maybeProc?.env?.[name];
}

/** Batch size: defaults to 5, overridable with CODEGEN_BATCH_SIZE env */
function getBatchSize(): number {
  const raw = readEnvVar("CODEGEN_BATCH_SIZE");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * Only pass the minimal env the generator needs. Keep this list short on purpose.
 * If you add a new dependency in the generator, also add it here.
 */
function getEnvSubset(): Record<string, string> {
  const keys = [
    // OpenAI / model selection
    "OPENAI_API_KEY",
    "OPENAI_API_BASE",
    "CODEGEN_MODEL",
    "CODEGEN_MAX_TOKENS",
    "CODEGEN_TEMP",
    "CODEGEN_TIMEOUT_SECS",

    // Any additional toggles that affect prompts/validation
    "CODEGEN_MIN_HTML_BYTES",
    "CODEGEN_MIN_CSS_BYTES",
    "CODEGEN_MIN_JS_BYTES",
  ];

  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = readEnvVar(k);
    if (typeof v === "string" && v.length > 0) {
      out[k] = v;
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                              Types for returns                              */
/* -------------------------------------------------------------------------- */

export type BuildServiceResult = {
  files: { path: string; content: string }[];
  plan: string;
  repoUrl?: string;
  pagesUrl?: string;
};

/* -------------------------------------------------------------------------- */
/*                               Main workflow                                 */
/* -------------------------------------------------------------------------- */

export async function buildService(
  payload: BuildPayload & {
    repo?: { token: string; org?: string; name?: string };
    // allow the caller to skip committing (useful in local dev/tests)
    skipCommit?: boolean;
  }
): Promise<BuildServiceResult> {
  // 1) Plan the project (names + descriptions only; no heavy code here)
  //    IMPORTANT: planProjectFiles returns { plan, targetFiles }
  const { plan, targetFiles } = await planProjectFiles(payload);

  // Edge case: nothing to generate
  if (!targetFiles || targetFiles.length === 0) {
    // Still sanitize to ensure wrangler.toml / index.html get injected later if needed
    const minimal = sanitizeGeneratedFiles([], {
      ideaId: payload.ideaId,
      env: {
        CLOUDFLARE_ACCOUNT_ID: readEnvVar("CLOUDFLARE_ACCOUNT_ID"),
        CLOUDFLARE_API_TOKEN: readEnvVar("CLOUDFLARE_API_TOKEN"),
      },
    });

    return {
      files: minimal,
      plan,
    };
  }

  // 2) Generate code in batches, passing minimal env and previously generated files as context
  const batches = chunkArray(
    targetFiles.map((t) => ({ path: t.path, description: t.description })),
    getBatchSize()
  );

  const generated: { path: string; content: string }[] = [];

  for (const batch of batches) {
    const already = generated.map((f) => ({ path: f.path, content: f.content }));
    const out = await generateCodeBatch(batch, {
      plan,
      alreadyGenerated: already,
      env: getEnvSubset(),
    });
    generated.push(...out);
  }

  // 3) Sanitize/normalize outputs (move to public/, inject worker, wrangler.toml, deploy.yml, etc.)
  const sanitized = sanitizeGeneratedFiles(generated, {
    ideaId: payload.ideaId,
    env: {
      CLOUDFLARE_ACCOUNT_ID: readEnvVar("CLOUDFLARE_ACCOUNT_ID"),
      CLOUDFLARE_API_TOKEN: readEnvVar("CLOUDFLARE_API_TOKEN"),
    },
  });

  // 4) Optional commit to GitHub (no Cloudflare ops here; those happen post-commit via Actions)
  let repoUrl: string | undefined;

  if (!payload.skipCommit && payload.repo?.token) {
    const org = payload.repo.org || "LaunchWing";
    const repoFiles: Record<string, string> = Object.fromEntries(
      sanitized.map((f) => [f.path, f.content])
    );

    // commitToGitHub will create or update a repo like: LaunchWing/mvp-<ideaId>
    repoUrl = await commitToGitHub(payload.ideaId, repoFiles, {
      token: payload.repo.token,
      org,
      // name is optional; if provided, use it; otherwise builder uses mvp-<ideaId>
      name: payload.repo.name,
    });
  }

  // 5) Return everything to caller; Pages/Workers URL (if any) is inferred later by deploy step
  return {
    files: sanitized,
    plan,
    repoUrl,
  };
}

/* -------------------------------------------------------------------------- */
/*                             Default export (opt)                            */
/* -------------------------------------------------------------------------- */

export default buildService;