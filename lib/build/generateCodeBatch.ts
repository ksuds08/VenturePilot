// lib/build/generateCodeBatch.ts
import { callGenerateCodeAPI, type FileGenOutput } from './callGenerateCodeAPI';

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export async function generateCodeBatch(
  filesToGenerate: { path: string; description: string }[],
  opts: {
    plan: any;
    alreadyGenerated: { path: string; content: string }[];
    env: Record<string, string | undefined>;
    meta?: {
      ideaId?: string;
      ideaSummary?: any;
      branding?: any;
      messages?: any[];
    };
  }
): Promise<FileGenOutput[]> {
  const { plan } = opts;

  const chunkSize = Number(opts.env?.CODEGEN_CHUNK_SIZE) || 5;
  const baseUrl =
    opts.env?.AGENT_BASE_URL ||
    (typeof process !== 'undefined' ? (process as any)?.env?.AGENT_BASE_URL : undefined) ||
    'http://localhost:8000';

  const timeoutMs = Number(opts.env?.CODEGEN_TIMEOUT_MS) || 300_000; // ✅ 5 min
  const maxRetries = Number(opts.env?.CODEGEN_RETRIES) ?? 1;         // retry count (1 = one extra try)
  const baseBackoff = Number(opts.env?.CODEGEN_RETRY_BACKOFF_MS) || 2_000;

  const chunks = chunkArray(filesToGenerate || [], Math.max(1, chunkSize));
  const allResults: FileGenOutput[] = [];

  for (const chunk of chunks) {
    let attempt = 0;
    // simple retry loop for AbortError or CF 524
    while (true) {
      try {
        const res = await callGenerateCodeAPI(
          {
            plan,
            targetFiles: chunk,
            messages: opts.meta?.messages ?? [],
            ideaId: opts.meta?.ideaId,
            ideaSummary: opts.meta?.ideaSummary,
            branding: opts.meta?.branding,
          },
          {
            baseUrl,
            includeContextFiles: false,
            expectContent: true,
            timeoutMs,
          }
        );
        allResults.push(...res);
        break; // chunk success
      } catch (err: any) {
        const msg = String(err?.message || err);
        const isAbort = err?.name === 'AbortError' || /aborted|timeout/i.test(msg);
        const is524 = /(\b524\b|HTTP\s?524)/.test(msg);
        if ((isAbort || is524) && attempt < maxRetries) {
          const backoff = baseBackoff * Math.pow(2, attempt);
          console.log(`generateCodeBatch: retrying chunk (attempt ${attempt + 1}/${maxRetries}) after ${backoff}ms due to: ${msg}`);
          await sleep(backoff);
          attempt++;
          continue;
        }
        console.log(`generateCodeBatch: giving up on chunk due to: ${msg}`);
        throw err;
      }
    }
  }

  return allResults;
}