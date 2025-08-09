// lib/build/generateCodeBatch.ts

import { callGenerateCodeAPI, type FileGenOutput } from "./callGenerateCodeAPI";

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

function readEnvLocal(name: string): string | undefined {
  const g: any = typeof globalThis !== "undefined" ? (globalThis as any) : undefined;
  const p: any = typeof process !== "undefined" ? (process as any) : g?.process;
  return p?.env?.[name];
}

function intFromEnv(v: string | undefined, fallback: number): number {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isAbortLike(err: any): boolean {
  const msg = (err?.message || "").toLowerCase();
  return msg.includes("abort") || msg.includes("timed out") || msg.includes("timeout");
}

function isTransientStatus(status?: number): boolean {
  if (!status && status !== 0) return false;
  return status >= 500 || status === 408 || status === 429;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function generateCodeBatch(
  filesToGenerate: { path: string; description: string }[],
  opts: {
    plan: any;
    alreadyGenerated: { path: string; content: string }[];
    env: Record<string, string | undefined>;
  }
): Promise<FileGenOutput[]> {
  const { plan /*, alreadyGenerated*/ } = opts;

  // Chunking (unchanged)
  const chunkSize = Number(opts.env?.CODEGEN_CHUNK_SIZE) || 5;

  // Base URL (unchanged)
  const baseUrl =
    opts.env?.AGENT_BASE_URL ||
    readEnvLocal("AGENT_BASE_URL") ||
    "http://localhost:8000";

  // ⏱️ Longer timeout + retries (new)
  const timeoutSecs = intFromEnv(opts.env?.CODEGEN_TIMEOUT_SECS, 300); // default 5m
  const timeoutMs = timeoutSecs * 1000;
  const retries = intFromEnv(opts.env?.CODEGEN_RETRIES, 2);
  const backoffBaseMs = intFromEnv(opts.env?.CODEGEN_RETRY_BASE_MS, 1000);

  const chunks = chunkArray(filesToGenerate || [], Math.max(1, chunkSize));
  const allResults: FileGenOutput[] = [];

  for (const chunk of chunks) {
    let attempt = 0;
    // retry loop per chunk
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const res = await callGenerateCodeAPI(
          {
            plan,
            // contextFiles: alreadyGenerated, // keep payload small
            targetFiles: chunk,
          },
          {
            baseUrl,
            includeContextFiles: false,
            expectContent: true,
            timeoutMs, // ✅ 5-minute default timeout
          }
        );

        allResults.push(...res);
        break; // success for this chunk
      } catch (err: any) {
        attempt++;
        const status: number | undefined = err?.status;
        const abort = isAbortLike(err);
        const transient = isTransientStatus(status);

        if (attempt > retries || (!abort && !transient)) {
          // give up
          console.error(
            `generateCodeBatch: giving up after ${attempt} attempt(s).`,
            err?.message || err
          );
          throw err;
        }

        const delay = backoffBaseMs * Math.pow(2, attempt - 1);
        console.warn(
          `generateCodeBatch: retry ${attempt}/${retries} in ${delay}ms ` +
            `(abort=${abort} transient=${transient} status=${status ?? "n/a"})`
        );
        await sleep(delay);
      }
    }
  }

  return allResults;
}

export default generateCodeBatch;