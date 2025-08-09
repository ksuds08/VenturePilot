// lib/build/callGenerateCodeAPI.ts

export type FileGenTarget = { path: string; description: string };
export type FileGenOutput = { path: string; content: string };

type ChatMsg = { role: "system" | "user" | "assistant"; content?: string };

type GeneratePayload = {
  plan: string;

  // Primary key the agent expects
  target_files: FileGenTarget[];
  // Back-compat for any older handler
  targetFiles?: FileGenTarget[];

  // Context / metadata
  messages?: ChatMsg[];
  ideaSummary?: { description?: string; [k: string]: unknown };

  // Optional extras (send both snake & camel for compatibility)
  idea_id?: string;
  ideaId?: string;
  branding?: Record<string, unknown>;
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
    messages?: ChatMsg[];
    ideaSummary?: { description?: string; [k: string]: unknown };
    ideaId?: string;
    branding?: Record<string, unknown>;
  },
  opts: {
    baseUrl?: string;
    includeContextFiles?: boolean; // reserved
    expectContent?: boolean;       // reserved
    timeoutMs?: number;
    apiKey?: string;
  } = {}
): Promise<FileGenOutput[]> {
  if (!data.targetFiles || data.targetFiles.length === 0) {
    throw new Error("callGenerateCodeAPI: targetFiles is empty");
  }

  const urls = withBase(opts.baseUrl);

  const payload: GeneratePayload = {
    plan: data.plan,
    target_files: data.targetFiles, // ✅ agent’s key
    targetFiles: data.targetFiles,  // ✅ back-compat
    messages: data.messages,
    ideaSummary: data.ideaSummary,
    idea_id: data.ideaId,
    ideaId: data.ideaId,
    branding: data.branding,
  };

  try {
    const first = data.targetFiles.slice(0, 3).map((f) => f.path).join(", ");
    console.log(
      `callGenerateCodeAPI → base: ${opts.baseUrl || safeEnv("AGENT_BASE_URL") || "http://localhost:8000"} ` +
      `timeoutMs: ${opts.timeoutMs ?? 300_000} files: [${first}${data.targetFiles.length > 3 ? ", …" : ""}]`
    );
  } catch {}

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
    if (/aborted|timed\s*out|524|timeout/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 1500));
      return await attempt();
    }
    throw e;
  }
}