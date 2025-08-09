// lib/build/callGenerateCodeAPI.ts

export type FileGenTarget = { path: string; description: string };
export type FileGenOutput = { path: string; content: string };

type GeneratePayload = {
  plan: string;
  // we’ll send both keys to be extra compatible with older handlers
  target_files: FileGenTarget[];
  targetFiles?: FileGenTarget[];
  // optional context from the MVP request (thread/messages)
  messages?: { role: "system" | "user" | "assistant"; content?: string }[];
  ideaSummary?: { description?: string; [k: string]: unknown };
};

function safeEnv(name: string): string | undefined {
  if (typeof process !== "undefined" && (process as any)?.env?.[name]) {
    return (process as any).env[name];
  }
  return undefined;
}

function withBase(url?: string) {
  const base =
    (url || safeEnv("AGENT_BASE_URL") || "http://localhost:8000").replace(/\/+$/, "");
  return {
    generateBatch: `${base}/generate-batch`,
  };
}

async function postJSON<T>(
  url: string,
  body: unknown,
  init: { timeoutMs?: number; headers?: Record<string, string> } = {}
): Promise<T> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 300_000); // default 5 min

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Agent ${res.status} at ${url}: ${txt}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(id);
  }
}

export async function callGenerateCodeAPI(
  data: {
    plan: string;
    targetFiles: FileGenTarget[];
    // thread context is optional but helps quality
    messages?: { role: "system" | "user" | "assistant"; content?: string }[];
    ideaSummary?: { description?: string; [k: string]: unknown };
  },
  opts: {
    baseUrl?: string;
    includeContextFiles?: boolean; // kept for API compatibility
    expectContent?: boolean;       // kept for API compatibility
    timeoutMs?: number;
    apiKey?: string;
  } = {}
): Promise<FileGenOutput[]> {
  // 🚧 Guard: never call agent with zero files
  if (!data.targetFiles || data.targetFiles.length === 0) {
    throw new Error("callGenerateCodeAPI: targetFiles is empty");
  }

  const urls = withBase(opts.baseUrl);

  // Build agent-friendly payload (snake_case), plus camelCase for old routes
  const payload: GeneratePayload = {
    plan: data.plan,
    target_files: data.targetFiles, // ✅ agent’s expected key
    targetFiles: data.targetFiles,  // ✅ compatibility with older handlers
    messages: data.messages,
    ideaSummary: data.ideaSummary,
  };

  // Optional: log first few paths so we can see what we sent in CF logs
  try {
    const first = data.targetFiles.slice(0, 3).map((f) => f.path).join(", ");
    console.log(
      `callGenerateCodeAPI → base: ${opts.baseUrl || safeEnv("AGENT_BASE_URL") || "http://localhost:8000"} ` +
      `timeoutMs: ${opts.timeoutMs ?? 300_000} files: [${first}${data.targetFiles.length > 3 ? ", …" : ""}]`
    );
  } catch {}

  // One retry on AbortError / 524-like messages
  const attempt = async () =>
    postJSON<FileGenOutput[]>(
      urls.generateBatch,
      payload,
      {
        timeoutMs: opts.timeoutMs ?? 300_000,
        headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : undefined,
      }
    );

  try {
    return await attempt();
  } catch (e: any) {
    const msg = String(e?.message || e);
    // Basic backoff + retry on timeouts/gateway errors
    if (/aborted|timed\s*out|524|timeout/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 1500));
      return await attempt();
    }
    throw e;
  }
}