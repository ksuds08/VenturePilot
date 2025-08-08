// lib/build/buildService.ts
import { planProjectFiles } from "./planProjectFiles";
import { generateCodeBatch } from "./generateCodeBatch";
import { chunkArray } from "./chunkArray";
// import { commitToGitHub } from "./commitToGitHub"; // ⛔️ no longer used in this flow
import { sanitizeGeneratedFiles } from "./sanitizeGeneratedFiles";
import { callPublishToGitHub } from "./callPublishToGitHub";
import { runInterfaceSelfTest } from "./typecheck";

type BuildPayloadLike = {
  ideaId: string;
  userBrief?: string;
  features?: string[];
  stack?: string[];
  [key: string]: unknown;
};

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

function getBatchSize(): number {
  const raw = readEnvVar("CODEGEN_BATCH_SIZE");
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

function getEnvSubset(): Record<string, string> {
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
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = readEnvVar(k);
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

export type BuildServiceResult = {
  files: { path: string; content: string }[];
  plan: string;
  repoUrl?: string;
  pagesUrl?: string;
};

export async function buildService(
  payload: BuildPayloadLike & {
    repo?: { token: string; org?: string }; // kept for compat; ignored now
    skipCommit?: boolean;
  }
): Promise<BuildServiceResult> {
  const { plan, targetFiles } = await planProjectFiles(payload as any);

  if (!targetFiles || targetFiles.length === 0) {
    const minimal = sanitizeGeneratedFiles([], {
      ideaId: payload.ideaId,
      env: {
        CLOUDFLARE_ACCOUNT_ID: readEnvVar("CLOUDFLARE_ACCOUNT_ID"),
        CLOUDFLARE_API_TOKEN: readEnvVar("CLOUDFLARE_API_TOKEN"),
      },
    });
    return { files: minimal, plan };
  }

  // 2) Batched generation → agent (write-only)
  const batches = chunkArray(
    targetFiles.map((t: any) => ({ path: t.path, description: t.description })),
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

  // 3) Sanitize for return only (UI)—deployment will use agent’s on-disk files
  const sanitized = sanitizeGeneratedFiles(generated, {
    ideaId: payload.ideaId,
    env: {
      CLOUDFLARE_ACCOUNT_ID: readEnvVar("CLOUDFLARE_ACCOUNT_ID"),
      CLOUDFLARE_API_TOKEN: readEnvVar("CLOUDFLARE_API_TOKEN"),
    },
  });

  // 4) Publish via agent → GitHub (instead of commitToGitHub)
  let repoUrl: string | undefined;
  if (!payload.skipCommit) {
    const repoName = `mvp-${payload.ideaId}`;
    const publish = await callPublishToGitHub(
      {
        repoOwner: "LaunchWing",
        repoName,
        branch: "main",
        commitMessage: `chore: initial MVP for ${payload.ideaId}`,
        createRepo: true,
      },
      {
        baseUrl: readEnvVar("AGENT_BASE_URL"),
        apiKey: readEnvVar("AGENT_API_KEY"),
      }
    );
    repoUrl = publish.repoUrl;
  }

  return { files: sanitized, plan, repoUrl };
}

export default buildService;
export const buildAndDeployApp = buildService;