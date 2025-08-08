// lib/build/callGenerateCodeAPI.ts

export type FileGenInput = { path: string; description: string };
export type FileGenOutput = { path: string; content: string };

export type BatchPayload = {
  plan?: string;
  contextFiles?: { path: string; content: string }[];
  targetFiles: FileGenInput[];
};

type CallOpts = {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
  includeContextFiles?: boolean;
  expectContent?: boolean;
};

type FirstArg = FileGenInput[] | BatchPayload;

function safeEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && (process as any)?.env?.[name]) {
    return (process as any).env[name];
  }
  return undefined;
}

export async function callGenerateCodeAPI(
  arg: FirstArg,
  opts: CallOpts = {}
): Promise<FileGenOutput[]> {
  const baseRaw =
    opts.baseUrl ||
    safeEnv("AGENT_BASE_URL") ||
    "http://localhost:8000";
  const base = baseRaw.replace(/\/+$/, "");

  const timeoutMs = opts.timeoutMs ?? 60_000;
  const expectContent = opts.expectContent ?? true;
  const includeContext = !!opts.includeContextFiles;

  const isArrayInput = Array.isArray(arg);
  const targetFiles: FileGenInput[] = isArrayInput
    ? (arg as FileGenInput[])
    : (arg as BatchPayload).targetFiles;

  const plan = isArrayInput ? undefined : (arg as BatchPayload).plan;
  const contextFiles = isArrayInput ? undefined : (arg as BatchPayload).contextFiles;

  const payload: any = {
    plan,
    target_files: targetFiles?.map(f => ({ path: f.path, description: f.description })),
    file_specs: targetFiles?.map(f => ({
      path: f.path,
      content: f.description,
      description: f.description,
    })),
    files: targetFiles?.map(f => ({
      path: f.path,
      content: f.description,
      description: f.description,
    })),
  };

  if (includeContext && contextFiles?.length) {
    payload.context_files = contextFiles;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers || {}),
  };
  if (opts.apiKey) {
    headers.Authorization = `Bearer ${opts.apiKey}`;
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
      return normalizeOutputs(data, { expectContent });
    } finally {
      clearTimeout(id);
    }
  };

  const endpoints = [`${base}/generate-batch`, `${base}/generate`];

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

async function safeText(res: Response): Promise<string> {
  try { return await res.text(); } catch { return ""; }
}

function normalizeOutputs(
  raw: any,
  opts: { expectContent: boolean }
): FileGenOutput[] {
  const coerce = (x: any): FileGenOutput | null => {
    if (!x) return null;
    const path =
      typeof x.path === "string" ? x.path : (x.filename ?? x.file ?? null);
    let content: string | null =
      typeof x.content === "string"
        ? x.content
        : (typeof x.body === "string" ? x.body : (typeof x.code === "string" ? x.code : null));

    if (content == null && !opts.expectContent) content = "";
    if (typeof path === "string" && typeof content === "string") {
      return { path, content };
    }
    return null;
  };

  if (!raw) return [];
  if (Array.isArray(raw.files)) return raw.files.map(coerce).filter(Boolean) as FileGenOutput[];
  if (Array.isArray(raw))       return raw.map(coerce).filter(Boolean) as FileGenOutput[];
  if (raw && Array.isArray(raw.result)) return raw.result.map(coerce).filter(Boolean) as FileGenOutput[];
  throw new Error("Unrecognized agent response shape");
}