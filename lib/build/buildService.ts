// lib/build/buildService.ts
import { planProjectFiles } from "./planProjectFiles";
import { generateCodeBatch } from "./generateCodeBatch";
import { chunkArray } from "./chunkArray";
import { callPublishToGitHub } from "./callPublishToGitHub";

// ——— types ———
type BuildPayloadLike = {
  ideaId: string;
  userBrief?: string;
  features?: string[];
  stack?: string[];
  [key: string]: unknown;
};

export type BuildServiceResult = {
  // What we show back to the UI (just the generated files)
  files: { path: string; content: string }[];
  plan: string;
  repoUrl?: string;
  pagesUrl?: string;
};

// ——— env helpers ———
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
  ];
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = getEnv(k, runtimeEnv);
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

// ——— path/content utils (NO content rewriting) ———
function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Strict, minimal normalization for publishing:
 * - normalize slashes
 * - drop blank/unsafe paths
 * - do not modify content
 * - preserve duplicates by last-write-wins (so later batches can overwrite)
 */
function normalizeForPublish(
  files: { path: string; content: string }[]
): { path: string; content: string }[] {
  const map = new Map<string, { path: string; content: string }>();
  for (const f of files) {
    const raw = (f?.path || "").trim();
    if (!raw) continue;
    const np = normPath(raw);

    // guard against traversal
    if (np.includes("..")) continue;

    // ensure folder structure preserved (Map keeps last write)
    map.set(np, { path: np, content: typeof f.content === "string" ? f.content : "" });
  }
  return Array.from(map.values());
}

// ——— main ———
export async function buildService(
  payload: BuildPayloadLike & {
    repo?: { token: string; org?: string }; // kept for compat; ignored now
    skipCommit?: boolean;
  },
  env?: Record<string, any>
): Promise<BuildServiceResult> {
  const { plan, targetFiles } = await planProjectFiles(payload as any);

  // If planner yielded nothing, just stop early (don’t create stubs)
  if (!targetFiles || targetFiles.length === 0) {
    return { files: [], plan };
  }

  // 1) Generate files in small batches
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
        // AGENT_API_KEY intentionally not exposed to codegen
      },
    });
    generated.push(...out);
  }

  // 2) Minimal, safe normalization; NO sanitization, NO filler content.
  const publishReady = normalizeForPublish(generated);

  // Optional: visibility logs (safe) -> can help trace empties if they ever appear.
  try {
    const total = publishReady.length;
    const empties = publishReady.filter(f => (f.content ?? "").length === 0).length;
    console.log(
      `PUBLISH_STATS files=${total} empty=${empties} sample=${publishReady.slice(0, 5).map(f => `${f.path}:${(f.content||"").length}`).join(",")}`
    );
  } catch {}

  // 3) Publish exactly what we generated to GitHub
  let repoUrl: string | undefined;
  if (!payload.skipCommit) {
    const repoName = `mvp-${payload.ideaId}`;
    const baseUrl = getEnv("AGENT_BASE_URL", env);
    try {
      const publish = await callPublishToGitHub(
        {
          repoOwner: "LaunchWing",
          repoName,
          branch: "main",
          commitMessage: `chore: MVP for ${payload.ideaId}`,
          createRepo: true,
          // 👇 send the exact files we just generated (paths + content + dirs preserved)
          files: publishReady,
        },
        {
          baseUrl,
          apiKey: getEnv("AGENT_API_KEY", env),
        }
      );
      repoUrl = publish.repoUrl;
      console.log("Publish complete:", publish.repoUrl, publish.commitSha);
    } catch (e: any) {
      console.error("ERROR publish-to-github:", e?.message || e);
      throw e;
    }
  }

  // 4) Return the same set to the UI (what got published)
  return { files: publishReady, plan, repoUrl };
}

export default buildService;

// Convenience alias
export async function buildAndDeployApp(
  payload: BuildPayloadLike & { repo?: { token: string; org?: string }; skipCommit?: boolean },
  env?: Record<string, any>
): Promise<BuildServiceResult> {
  return buildService(payload, env);
}