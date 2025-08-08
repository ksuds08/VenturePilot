// lib/build/generateCodeBatch.ts

import { callGenerateCodeAPI, type FileGenOutput } from './callGenerateCodeAPI';

function chunkArray<T>(arr: T[], size: number): T[][] {
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
    plan: any;
    alreadyGenerated: { path: string; content: string }[];
    env: Record<string, string | undefined>;
  }
): Promise<FileGenOutput[]> {
  const { plan /*, alreadyGenerated*/ } = opts;

  // Chunk size from env or default 5 (keeps payloads and responses small)
  const chunkSize =
    (Number(opts.env?.CODEGEN_CHUNK_SIZE) || 5);

  const chunks = chunkArray(filesToGenerate || [], Math.max(1, chunkSize));
  const allResults: FileGenOutput[] = [];

  for (const chunk of chunks) {
    // IMPORTANT:
    // - Do not include contextFiles by default to avoid large request bodies.
    // - Keep expectContent=true for compatibility with current agent.
    const res = await callGenerateCodeAPI(
      {
        plan,
        // contextFiles: alreadyGenerated, // intentionally omitted to reduce payload size
        targetFiles: chunk,
      },
      {
        // You can flip these via env or caller if needed:
        includeContextFiles: false,
        expectContent: true,
        timeoutMs: Number(opts.env?.CODEGEN_TIMEOUT_MS) || 60_000,
      }
    );
    allResults.push(...res);
  }

  return allResults;
}