// lib/build/callGenerateCodeAPI.ts

export type FileGenInput = { path: string; description: string };
export type FileGenOutput = { path: string; content: string };

type CallOpts = {
  baseUrl?: string;           // e.g. "https://<your-render-app>"
  apiKey?: string;            // if your agent requires it
  timeoutMs?: number;         // default 60000
  headers?: Record<string, string>;
};

/**
 * Calls the codegen agent with a batch of file specs and returns generated files.
 * Tries /generate-batch first, then falls back to /generate for compatibility.
 */
export async function callGenerateCodeAPI(
  filesToGenerate: FileGenInput[],
  opts: CallOpts = {}
): Promise<FileGenOutput[]> {
  const baseUrl =
    opts.baseUrl ||
    process.env.AGENT_BASE_URL ||
    "http://localhost:8000";

  const timeoutMs = opts.timeoutMs ?? 60_000;

  // Agent expects a list of FileSpec-like objects.
  // Send both "file_specs" and "files" for compatibility.
  const payload = {
    file_specs: filesToGenerate.map(f => ({
      path: f.path,
      content: f.description,       // agent variant A
      description: f.description,   // agent variant B
    })),
    files: filesToGenerate.map(f => ({
      path: f.path,
      content: f.description,
      description: f.description,
    })),
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  if (opts.apiKey || process.env.AGENT_API_KEY) {
    headers.Authorization = `Bearer ${opts.apiKey || process.env.AGENT_API_KEY}`;
  }

  // Small helper to POST with timeout
  const postJson = async (url: string) => {
    const ac = new AbortController();
    const id = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (!res.ok) {
        const text = await safeText(res);
        throw new Error(`Agent ${res.status} ${res.statusText} at ${url}: ${text.slice(0, 400)}`);
      }
      const data = (await res.json()) as any;
      return normalizeOutputs(data);
    } finally {
      clearTimeout(id);
    }
  };

  // Try /generate-batch then fallback to /generate
  const endpoints = [`${baseUrl}/generate-batch`, `${baseUrl}/generate`];

  let lastErr: unknown;
  for (const ep of endpoints) {
    try {
      return await postJson(ep);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/* ----------------------- helpers ----------------------- */

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

// Normalize various agent response shapes into { path, content }[]
function normalizeOutputs(raw: any): FileGenOutput[] {
  if (!raw) return [];

  // Common shapes:
  // 1) { files: [{ path, content }...] }
  if (Array.isArray(raw.files) && raw.files.every(isPathContent)) {
    return raw.files as FileGenOutput[];
  }

  // 2) direct array: [{ path, content }]
  if (Array.isArray(raw) && raw.every(isPathContent)) {
    return raw as FileGenOutput[];
  }

  // 3) { result: [...] }
  if (Array.isArray(raw.result) && raw.result.every(isPathContent)) {
    return raw.result as FileGenOutput[];
  }

  // 4) fallback: try to coerce
  if (Array.isArray(raw)) {
    return raw.map(coercePathContent).filter(Boolean) as FileGenOutput[];
  }
  if (raw && typeof raw === "object" && Array.isArray(raw.result)) {
    return raw.result.map(coercePathContent).filter(Boolean) as FileGenOutput[];
  }
  throw new Error("Unrecognized agent response shape");
}

function isPathContent(x: any): x is FileGenOutput {
  return x && typeof x.path === "string" && typeof x.content === "string";
}

function coercePathContent(x: any): FileGenOutput | null {
  if (!x) return null;
  const path = typeof x.path === "string" ? x.path : (x.filename ?? x.file ?? null);
  const content = typeof x.content === "string" ? x.content : (x.body ?? x.code ?? null);
  if (typeof path === "string" && typeof content === "string") {
    return { path, content };
  }
  return null;
}