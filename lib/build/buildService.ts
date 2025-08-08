// lib/build/buildService.ts

import { commitToGitHub } from "./commitToGitHub";
import { sanitizeGeneratedFiles } from "./sanitizeGeneratedFiles";
import { planProjectFiles } from "./planProjectFiles";
import { generateCodeBatch } from "./generateCodeBatch";
import { chunkArray } from "./chunkArray";
import type { BuildPayload } from "../../types";

/* -------------------------------------------------------------------------- */
/*                             Safe env accessors                              */
/* -------------------------------------------------------------------------- */

function getSafeNodeEnv(): Record<string, string> {
  // Avoid throwing when this file is evaluated in a non-Node runtime (e.g., Wrangler)
  const env = (typeof process !== "undefined" && (process as any).env) || {};
  // Return as plain object of strings (wrangler sometimes gives Proxy-like objects)
  const out: Record<string, string> = {};
  for (const k in env) {
    const v = (env as any)[k];
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/** Only the bits needed by codegen calls */
function getCodegenEnv(overrides?: Record<string, string | undefined>): Record<string, string> {
  const env = { ...getSafeNodeEnv(), ...(overrides || {}) } as Record<string, string>;
  const out: Record<string, string> = {};
  const allow = [
    "OPENAI_API_KEY",
    "OPENAI_APIKEY",
    "CODEGEN_MODEL",
    "CODEGEN_MAX_DESC_CHARS",
    "CODEGEN_MAX_TOKENS",
    "CODEGEN_TEMP",
    "CODEGEN_TIMEOUT_SECS",
    "CODEGEN_INTER_FILE_SLEEP",
    "CODEGEN_RETRIES",
    "CODEGEN_OUTPUT_ROOT",
    "CODEGEN_MIN_HTML_BYTES",
    "CODEGEN_MIN_CSS_BYTES",
    "CODEGEN_MIN_JS_BYTES",
  ];
  for (const k of allow) {
    if (env[k]) out[k] = env[k];
  }
  return out;
}

function getBatchSize(): number {
  const env = getSafeNodeEnv();
  const n = parseInt(env.CODEGEN_BATCH_SIZE || "5", 10);
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/* -------------------------------------------------------------------------- */
/*                         Cloudflare KV ensure helper                         */
/* -------------------------------------------------------------------------- */

async function ensureAssetsKv(projectName: string, accountId?: string, token?: string): Promise<string> {
  if (!accountId || !token) return "";
  const title = `${projectName}-ASSETS`;

  // Try to find existing
  try {
    const list = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
    );
    if (list.ok) {
      const data = (await list.json()) as any;
      const found = data?.result?.find((ns: any) => ns.title === title);
      if (found?.id) return found.id;
    }
  } catch {
    // ignore and attempt create
  }

  // Create if missing
  const createRes = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }
  );
  if (!createRes.ok) {
    throw new Error(`Failed to create KV namespace "${title}": ${createRes.status} ${createRes.statusText}`);
  }
  const created = (await createRes.json()) as any;
  const id = created?.result?.id;
  if (!id) throw new Error("Cloudflare KV create returned no id");
  return id;
}

/* -------------------------------------------------------------------------- */
/*                              Main entry point                               */
/* -------------------------------------------------------------------------- */

export async function buildAndDeployApp(
  payload: BuildPayload & { files?: { path: string; content: string }[] },
  env: {
    CF_API_TOKEN?: string;
    CF_ACCOUNT_ID?: string;
    GITHUB_PAT: string;
  }
) {
  const projectName = `mvp-${payload.ideaId}`;

  // 1) Plan the project: high-level plan + list of files to generate (paths + descriptions)
  const { plan, targets } = await planProjectFiles(payload);

  // 2) Generate code in batches, passing minimal env the generator needs
  const batches = chunkArray(targets, getBatchSize());
  const generated: { path: string; content: string }[] = [];

  for (const batch of batches) {
    const already = generated.map((f) => ({ path: f.path, content: f.content }));
    const out = await generateCodeBatch(batch, {
      plan,
      alreadyGenerated: already,
      env: getCodegenEnv(), // ✅ ensure env is provided
    });
    generated.push(...out);
  }

  // 3) If the caller also sent files (e.g., uploads or templates), include them
  if (payload.files?.length) {
    for (const f of payload.files) {
      // last-write-wins by path
      const idx = generated.findIndex((x) => x.path === f.path);
      if (idx >= 0) generated.splice(idx, 1);
      generated.push({ path: f.path, content: f.content });
    }
  }

  // 4) Sanitize/normalize outputs (adds worker, wrangler.toml, index.html, etc.)
  //    Provide CF creds so sanitizer can stamp account_id and [site] bucket
  const sanitized = sanitizeGeneratedFiles(generated, {
    ideaId: payload.ideaId,
    env: {
      CLOUDFLARE_API_TOKEN: env.CF_API_TOKEN,
      CLOUDFLARE_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    },
  });

  // 5) If serving static assets (public/) or worker references env.ASSETS, ensure KV
  const hasPublic = sanitized.some((f) => f.path.startsWith("public/"));
  const workerTxt = sanitized.find((f) => f.path === "functions/index.ts")?.content || "";
  const wantsAssets = hasPublic || /env\.ASSETS\b/.test(workerTxt);

  let assetsKvId = "";
  if (wantsAssets && env.CF_API_TOKEN && env.CF_ACCOUNT_ID) {
    assetsKvId = await ensureAssetsKv(projectName, env.CF_ACCOUNT_ID, env.CF_API_TOKEN);
  }

  // 6) If we created KV after sanitize, patch wrangler.toml to include the binding
  if (assetsKvId) {
    const idx = sanitized.findIndex((f) => f.path === "wrangler.toml");
    if (idx !== -1) {
      let toml = sanitized[idx].content;
      if (!/binding\s*=\s*"ASSETS"/.test(toml)) {
        toml += `

[[kv_namespaces]]
binding = "ASSETS"
id = "${assetsKvId}"`;
      }
      sanitized[idx] = { path: "wrangler.toml", content: toml };
    }
  }

  // 7) Commit to GitHub
  let repoUrl = "";
  try {
    repoUrl = await commitToGitHub(payload.ideaId, Object.fromEntries(sanitized.map(f => [f.path, f.content])), {
      token: env.GITHUB_PAT,
      org: "LaunchWing",
    });
  } catch (err) {
    // Surface commit error clearly
    throw new Error(`GitHub commit failed: ${String(err)}`);
  }

  const pagesUrl = `https://${projectName}.promptpulse.workers.dev`;

  return {
    pagesUrl,
    repoUrl,
    plan,
  };
}