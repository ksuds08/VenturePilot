// lib/build/generateCodeBatch.ts

export async function generateCodeBatch(
  filesToGenerate: { path: string; description: string }[],
  opts: {
    plan: any;
    alreadyGenerated: { path: string; content: string }[];
    env: Record<string, string | undefined>;
    meta?: { ideaId?: string; messages?: any[]; ideaSummary?: any; branding?: any };
  }
): Promise<FileGenOutput[]> {
  if (!filesToGenerate || filesToGenerate.length === 0) {
    throw new Error('generateCodeBatch called with 0 files; aborting.');
  }

  const { plan } = opts;
  const chunkSize = Number(opts.env?.CODEGEN_CHUNK_SIZE) || 5;
  const baseUrl =
    opts.env?.AGENT_BASE_URL ||
    (typeof process !== 'undefined' ? (process as any)?.env?.AGENT_BASE_URL : undefined) ||
    'http://localhost:8000';

  const chunks = chunkArray(filesToGenerate || [], Math.max(1, chunkSize));
  const allResults: FileGenOutput[] = [];

  for (const chunk of chunks) {
    const res = await callGenerateCodeAPI(
      {
        plan,
        targetFiles: chunk,
        messages: opts.meta?.messages ?? [],
        ideaSummary: opts.meta?.ideaSummary,
        branding: opts.meta?.branding,
      },
      {
        baseUrl,
        includeContextFiles: false,
        expectContent: true,
        timeoutMs: Number(opts.env?.CODEGEN_TIMEOUT_MS) || 300_000, // 5 min default
      }
    );
    allResults.push(...res);
  }

  return allResults;
}