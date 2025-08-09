// lib/build/callGenerateCodeAPI.ts
export type FileGenOutput = { path: string; content: string };

type GenerateBatchPayload = {
  plan: any;
  targetFiles: { path: string; description: string }[];
  messages?: any[];
  ideaId?: string;
  ideaSummary?: any;
  branding?: any;
  // optionally, contextFiles?: { path: string; content: string }[];
};

type CallOpts = {
  baseUrl?: string;
  timeoutMs?: number;
  expectContent?: boolean;
  includeContextFiles?: boolean;
  apiKey?: string;
};

function normalizeBase(url: string | undefined): string {
  const u = (url || '').trim();
  if (!u) return 'http://localhost:8000';
  return u.replace(/\/+$/, '');
}

export async function callGenerateCodeAPI(
  payload: GenerateBatchPayload,
  opts: CallOpts
): Promise<FileGenOutput[]> {
  const base = normalizeBase(opts.baseUrl);
  const timeoutMs = Math.max(10_000, (opts.timeoutMs ?? 300_000)); // default 5 min
  console.log(`callGenerateCodeAPI → base: ${base} timeoutMs: ${timeoutMs}`);

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/generate-batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        plan: payload.plan,
        targetFiles: payload.targetFiles,
        messages: payload.messages ?? [],
        ideaId: payload.ideaId,
        ideaSummary: payload.ideaSummary,
        branding: payload.branding,
      }),
      signal: ctrl.signal,
    });

    // Cloudflare 524 / agent errors
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Agent ${res.status} at ${base}/generate-batch: ${txt.slice(0, 400)}`);
    }

    // Allow both {files:[...]} OR [...]
    const json = await res.json().catch(() => ({}));
    const files: any =
      Array.isArray(json) ? json :
      Array.isArray(json?.files) ? json.files :
      Array.isArray(json?.data?.files) ? json.data.files : [];

    if (!Array.isArray(files)) {
      throw new Error(`Agent returned invalid payload`);
    }

    // Normalize outputs
    return files
      .filter((f: any) => f && typeof f.path === 'string')
      .map((f: any) => ({ path: String(f.path), content: String(f.content ?? '') }));
  } finally {
    clearTimeout(t);
  }
}