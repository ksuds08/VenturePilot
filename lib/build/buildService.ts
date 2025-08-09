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
  // may include: messages, ideaSummary, branding, etc.
  [key: string]: unknown;
};

/* ----------------------- env helpers ----------------------- */

function readEnvVar(name: string): string | undefined {
  const anyGlobal: any =
    typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
  const maybeProc: any =
    typeof process !== "undefined"
      ? (process as any)
      : anyGlobal && typeof anyGlobal.process !== "undefined"
      ? (anyGlobal.process as any)
      : undefined;
  return maybeProc?.env?.[name];
}

// Prefer Worker `env` first, then fallback to process.env
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
    // OpenAI / model selection
    "OPENAI_API_KEY",
    "OPENAI_API_BASE",
    "CODEGEN_MODEL",
    "CODEGEN_MAX_TOKENS",
    "CODEGEN_TEMP",
    "CODEGEN_TIMEOUT_SECS",

    // Additional toggles affecting validation
    "CODEGEN_MIN_HTML_BYTES",
    "CODEGEN_MIN_CSS_BYTES",
    "CODEGEN_MIN_JS_BYTES",
  ];

  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = getEnv(k, runtimeEnv);
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

/* ----------------------- helpers ----------------------- */

function isCiOrMeta(path: string) {
  const p = path.replace(/\\/g, "/");
  return p.startsWith(".github/") || p === "wrangler.toml";
}

function hasSubstantiveFiles(files: { path: string; content: string }[]): boolean {
  // “Real” == non-CI/meta file with at least 1 byte
  return files.some(
    (f) => !isCiOrMeta(f.path) && typeof f.content === "string" && f.content.length > 0
  );
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
  payload: BuildPayloadLike & {
    repo?: { token: string; org?: string }; // kept for compat; ignored now
    skipCommit?: boolean;
  },
  env?: Record<string, any> // <-- accept Worker env
): Promise<BuildServiceResult> {
  const { plan, targetFiles } = await planProjectFiles(payload as any);

  if (!targetFiles || targetFiles.length === 0) {
    throw new Error("Planner returned 0 target files; aborting before publish.");
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
        AGENT_BASE_URL: getEnv("AGENT_BASE_URL", env), // ✅ ensure agent URL is passed to codegen
      },
      // ✅ pass through context so the agent gets the full brief/thread
      meta: {
        ideaId: String(payload.ideaId || ""),
        messages: (payload as any).messages || [],
        ideaSummary: (payload as any).ideaSummary || undefined,
        branding: (payload as any).branding || undefined,
      },
    });
    generated.push(...out);
  }

  // 3) Sanitize for UI **and** for publish (this is the authoritative file set)
  const sanitized = sanitizeGeneratedFiles(generated, {
    ideaId: String(payload.ideaId || ""),
    env: {
      CLOUDFLARE_ACCOUNT_ID: getEnv("CLOUDFLARE_ACCOUNT_ID", env),
      CLOUDFLARE_API_TOKEN: getEnv("CLOUDFLARE_API_TOKEN", env),
    },
  });

  // 🔎 Log sizes for debugging
  try {
    console.log(
      "SANITIZED FILES:",
      sanitized.map((f) => `${f.path}(${(f.content ?? "").length})`).join(", ")
    );
  } catch {}

  // 🚫 Guard: don’t publish if nothing substantive was generated
  if (!hasSubstantiveFiles(sanitized)) {
    throw new Error("No substantive files generated (only CI/meta or empty). Not publishing.");
  }

  // 4) Publish via agent → GitHub (send sanitized files so agent doesn't re-generate)
  let repoUrl: string | undefined;
  if (!payload.skipCommit) {
    const repoName = `mvp-${payload.ideaId}`;
    try {
      const baseUrl = getEnv("AGENT_BASE_URL", env);
      console.log("DEBUG publish -> baseUrl:", baseUrl);

      const publish = await callPublishToGitHub(
        {
          repoOwner: "LaunchWing",
          repoName,
          branch: "main",
          commitMessage: `chore: initial MVP for ${payload.ideaId}`,
          createRepo: true,
          // 👇 ship the sanitized files to the agent, verbatim
          files: sanitized,
        },
        {
          baseUrl,
          apiKey: getEnv("AGENT_API_KEY", env),
        }
      );

      console.log("DEBUG publish <- repoUrl:", publish.repoUrl, "sha:", publish.commitSha);
      repoUrl = publish.repoUrl;
    } catch (e: any) {
      console.error("ERROR publish-to-github:", e?.message || e);
      throw e;
    }
  }

  return { files: sanitized, plan, repoUrl };
}

// Keep default export
export default buildService;

// 👇 Explicit named export so the bundler can resolve it reliably
export async function buildAndDeployApp(
  payload: BuildPayloadLike & {
    repo?: { token: string; org?: string };
    skipCommit?: boolean;
  },
  env?: Record<string, any>
): Promise<BuildServiceResult> {
  return buildService(payload, env);
}