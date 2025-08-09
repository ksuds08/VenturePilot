// lib/build/generateCodeBatch.ts

import { callGenerateCodeAPI } from "./callGenerateCodeAPI";

// Keep the return type local so we don’t depend on callGenerateCodeAPI re-exporting it.
export type FileGenOutput = { path: string; content: string };

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function generateCodeBatch(
  filesToGenerate: { path: string; description: string }[],
  opts: {
    plan: string;
    alreadyGenerated: { path: string; content: string }[];
    env: Record<string, string | undefined>;
    // Context we forward to the agent for better generations
    meta?: {
      messages?: any[];
      ideaSummary?: any;
      branding?: any;
    };
  }
): Promise<FileGenOutput[]> {
  if (!filesToGenerate || filesToGenerate.length === 0) {
    throw new Error("generateCodeBatch called with 0 files; aborting.");
  }

  const { plan } = opts;

  // chunk + timeouts/retries
  const chunkSize = Number(opts.env?.CODEGEN_CHUNK_SIZE) || 5;
  const timeoutMs = Number(opts.env?.CODEGEN_TIMEOUT_MS) || 300_000; // 5 min
  const maxAttempts = Math.max(1, Number(opts.env?.CODEGEN_RETRIES) || 2);
  const baseUrl =
    opts.env?.AGENT_BASE_URL ||
    (typeof process !== "undefined" ? (process as any)?.env?.AGENT_BASE_URL : undefined) ||
    "http://localhost:8000";

  const chunks = chunkArray(filesToGenerate, Math.max(1, chunkSize));
  const allResults: FileGenOutput[] = [];

  for (const chunk of chunks) {
    let attempt = 0;
    // simple backoff: 2s, 4s
    const backoff = (n: number) => new Promise((r) => setTimeout(r, 2000 * n));

    // retry loop
    for (;;) {
      attempt++;
      try {
        const res = await callGenerateCodeAPI(
          {
            plan,
            targetFiles: chunk,
            messages: opts.meta?.messages ?? [],
            ideaSummary: opts.meta?.ideaSummary,
            branding: opts.meta?.branding,
            // ⚠️ do NOT send ideaId; the agent payload doesn’t accept it
          },
          {
            baseUrl,
            includeContextFiles: false, // keep payload lean
            expectContent: true,
            timeoutMs,
          }
        );
        allResults.push(...res);
        break; // success for this chunk
      } catch (err: any) {
        // Optional: only retry on network-ish failures; here we retry on anything except 4xx
        const msg = String(err?.message || err);
        const shouldRetry =
          attempt < maxAttempts && !/ 4\d\d /.test(msg); // crude 4xx detector in thrown text

        if (!shouldRetry) {
          throw err;
        }
        await backoff(attempt); // 2s then 4s
      }
    }
  }

  return allResults;
}