// lib/build/callGenerateCodeAPI.ts

export type FileGenInput = { path: string; description: string };
export type FileGenOutput = { path: string; content: string };

// Extended “object payload” shape used by generateCodeBatch
export type BatchPayload = {
  plan?: string;
  contextFiles?: { path: string; content: string }[];
  targetFiles: FileGenInput[];
};

type CallOpts = {
  baseUrl?: string;           // e.g. "https://<your-render-app>"
  apiKey?: string;            // if your agent requires it
  timeoutMs?: number;         // default 60000
  headers?: Record<string, string>;
};

type FirstArg = FileGenInput[] | BatchPayload;

/**
 * Calls the codegen agent with either:
 *   A) an array of files to generate, or
 *   B) an object payload { plan, contextFiles, targetFiles }
 * Returns normalized [{ path, content }] results.
 */
export async function callGenerateCodeAPI(
  arg: FirstArg,
  opts: CallOpts = {}
): Promise<FileGenOutput[]> {
  const baseUrl =
    opts.baseUrl ||
    process.env.AGENT_BASE_URL ||
    "http://localhost:8000";

  const timeoutMs = opts.timeoutMs ?? 60_000;

  const isArrayInput = Array.isArray(arg);
  const targetFiles: FileGenInput[] = isArrayInput ? (arg as FileGenInput[]) : (arg as BatchPayload).targetFiles;
  const plan = isArrayInput ? undefined : (arg as BatchPayload).plan;
  const contextFiles = isArrayInput ? undefined : (arg as BatchPayload).contextFiles;

  // Build a payload that works for both our agent variants
  const payload: any = {
    // Newer shape used by /generate-batch
    plan,
    context_files: contextFiles,
    target_files: targetFiles?.map(f => ({ path: f.path, description: f.description })),

    // Back-compat shapes for older /generate handlers
    file_specs: targetFiles?.map(f => ({
      path: f.path,
      content: f.description,       // agent variant A
      description: f.description,   // agent variant B
    })),
    files: targetFiles?.map(f => ({
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

  // Try /generate-batch first, then fallback to /generate
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