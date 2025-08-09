// lib/build/generateCodeBatch.ts

import { callGenerateCodeAPI, type FileGenOutput } from './callGenerateCodeAPI';

type ChatMsg = { role: "system" | "user" | "assistant"; content?: string };

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
    // 🔥 pass through thread + metadata so the agent has real context
    meta?: {
      messages?: ChatMsg[];
      ideaId?: string;
      ideaSummary?: { description?: string; [k: string]: unknown };
      branding?: Record<string, unknown>;
    };
  }
): Promise<FileGenOutput[]> {
  const { plan } = opts;

  const chunkSize = Number(opts.env?.CODEGEN_CHUNK_SIZE) || 5;

  const baseUrl =
    opts.env?.AGENT_BASE_URL ||
    (typeof process !== 'undefined' ? (process as any)?.env?.AGENT_BASE_URL : undefined) ||
    'http://localhost:8000';

  const apiKey =
    opts.env?.AGENT_API_KEY ||
    (typeof process !== 'undefined' ? (process as any)?.env?.AGENT_API_KEY : undefined);

  const timeoutMs = Number(opts.env?.CODEGEN_TIMEOUT_MS) || 300_000; // 5 min

  const chunks = chunkArray(filesToGenerate || [], Math.max(1, chunkSize));
  const allResults: FileGenOutput[] = [];

  for (const chunk of chunks) {
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
        apiKey,
      }
    );
    allResults.push(...res);
  }

  return allResults;
}