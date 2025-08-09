// lib/build/buildService.ts
import { planProjectFiles } from "./planProjectFiles";
import { generateCodeBatch } from "./generateCodeBatch";
import { chunkArray } from "./chunkArray";
import { sanitizeGeneratedFiles } from "./sanitizeGeneratedFiles";
import { callPublishToGitHub } from "./callPublishToGitHub";
import { runInterfaceSelfTest } from "./typecheck";

type BuildPayloadLike = {
  ideaId: string;
  userBrief?: string;
  features?: string[];
  stack?: string[];
  messages?: any[];            // ✅ make sure messages is allowed through
  ideaSummary?: { description?: string; [k: string]: any };
  branding?: Record<string, any>;
  [key: string]: unknown;
};

/* ----------------------- env helpers ----------------------- */

function readEnvVar(name: string): string | undefined {
  const anyGlobal: any = typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
  const maybeProc: any =
    typeof process !== "undefined"
      ? (process as any)
      : anyGlobal && typeof anyGlobal.process !== "undefined"
      ? (anyGlobal.process as any)
      : undefined;
  return maybeProc?.env?.[name];
}

function getEnv(name: string, runtimeEnv?: Record<string, any>): string | undefined {
  const v = runtimeEnv?.[name];
  return typeof v === "string" && v.length > 0 ? v : readEnvVar(name);
}

function getBatchSize(runtimeEnv?: Record<string, any>): number {
  const raw = getEnv("CODEGEN_BATCH_SIZE", runtimeEnv);
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function getEnvSubset(runtimeEnv?: Record<string, any>): Record<string, string> {
  const keys = [
    "OPENAI_API_KEY",
    "OPENAI_API_BASE",
    "CODEGEN_MODEL",
    "CODEGEN_MAX_TOKENS",
    "CODEGEN_TEMP",
    "CODEGEN_TIMEOUT_SECS",

    "CODEGEN_MIN_HTML_BYTES",
    "CODEGEN_MIN_CSS_BYTES",
    "CODEGEN_MIN_JS_BYTES",

    // 👇 new knobs (optional)
    "CODEGEN_TIMEOUT_MS",
    "CODEGEN_RETRIES",
    "CODEGEN_RETRY_BACKOFF_MS",
    "CODEGEN_CHUNK_SIZE",
  ];

  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = getEnv(k, runtimeEnv);
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

/* ----------------------- types ----------------------- */

export type BuildServiceResult = {
  files: { path: string; content: string }[];
  plan: string;
  repoUrl?: string;
  pagesUrl?: string;
};

/* ----------------------- main ----------------------- */

export async function buildService(
  payload: BuildPayloadLike & { repo?: { token: string; org?: string }; skipCommit?: boolean },
  env?: Record<string, any>
): Promise<BuildServiceResult> {
  const { plan, targetFiles } = await planProjectFiles(payload as any);

  if (!targetFiles || targetFiles.length === 0) {
    const minimal = sanitizeGeneratedFiles([], {
      ideaId: payload.ideaId,
      env: {
        CLOUDFLARE_ACCOUNT_ID: getEnv("CLOUDFLARE_ACCOUNT_ID", env),
        CLOUDFLARE_API_TOKEN: getEnv("CLOUDFLARE_API_TOKEN", env),
      },
    });
    return { files: minimal, plan };
  }

  // 2) Batched generation → agent (write-only)
  const batches = chunkArray(
    targetFiles.map((t: any) => ({ path: t.path, description: t.description })),
    getBatchSize(env)
  );

  const generated: { path: string; content: string }[] = [];
  for (const batch of batches) {
    const already = generated.map((f) => ({ path: f.path, content: f.content }));
    const out = await generateCodeBatch(batch, {
      plan,
      alreadyGenerated: already,
      env: {
        ...getEnvSubset(env),
        AGENT_BASE_URL: getEnv("AGENT_BASE_URL", env),
      },
      // ✅ pass conversation + identifiers through so the agent can condition on them
      meta: {
        ideaId: payload.ideaId,
        ideaSummary: payload.ideaSummary ?? {},
        branding: payload.branding ?? {},
        messages: Array.isArray(payload.messages) ? payload.messages : [],
      },
    });
    generated.push(...out);
  }

  // 3) Sanitize for UI **and** for publish (authoritative file set)
  const sanitized = sanitizeGeneratedFiles(generated, {
    ideaId: payload.ideaId,
    env: {
      CLOUDFLARE_ACCOUNT_ID: getEnv("CLOUDFLARE_ACCOUNT_ID", env),
      CLOUDFLARE_API_TOKEN: getEnv("CLOUDFLARE_API_TOKEN", env),
    },
  });

  // 4) Publish via agent → GitHub (send sanitized files)
  let repoUrl: string | undefined;
  if (!payload.skipCommit) {
    const repoName = `mvp-${payload.ideaId}`;
    const baseUrl = getEnv("AGENT_BASE_URL", env);
    const apiKey = getEnv("AGENT_API_KEY", env);

    const publish = await callPublishToGitHub(
      {
        repoOwner: "LaunchWing",
        repoName,
        branch: "main",
        commitMessage: `chore: initial MVP for ${payload.ideaId}`,
        createRepo: true,
        files: sanitized,
      },
      { baseUrl, apiKey }
    );
    repoUrl = publish.repoUrl;
  }

  return { files: sanitized, plan, repoUrl };
}

export default buildService;

export async function buildAndDeployApp(
  payload: BuildPayloadLike & { repo?: { token: string; org?: string }; skipCommit?: boolean },
  env?: Record<string, any>
): Promise<BuildServiceResult> {
  return buildService(payload, env);
}