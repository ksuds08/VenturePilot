// lib/build/callPublishToGitHub.ts

export type PublishRequest = {
  repoOwner?: string;
  repoName: string;
  branch?: string;            // default "main"
  commitMessage?: string;     // default "chore: initial MVP"
  createRepo?: boolean;       // default true
  // Allow passing exact files to commit (so sanitizer wins and we avoid empty commits)
  files?: { path: string; content: string }[];
};

export type PublishResponse = {
  repoUrl: string;
  branch: string;
  commitSha: string;
};

function safeEnv(name: string): string | undefined {
  try {
    // Guarded access so Workers/edge runtimes don't throw
    if (typeof process !== "undefined" && (process as any)?.env?.[name]) {
      return (process as any).env[name];
    }
  } catch {
    // ignore
  }
  return undefined;
}

export async function callPublishToGitHub(
  req: PublishRequest,
  opts: { baseUrl?: string; apiKey?: string; timeoutMs?: number } = {}
): Promise<PublishResponse> {
  const baseRaw =
    opts.baseUrl ||
    safeEnv("AGENT_BASE_URL") ||
    "https://launchwing-agent.onrender.com";
  const baseUrl = baseRaw.replace(/\/+$/, ""); // strip trailing slash

  // Default timeout (overridable via opts or env)
  const timeoutMs =
    opts.timeoutMs ??
    Number(safeEnv("AGENT_TIMEOUT_MS") || safeEnv("PUBLISH_TIMEOUT_MS") || 180_000);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/publish-to-github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        branch: req.branch ?? "main",
        commitMessage: req.commitMessage ?? "chore: initial MVP",
        createRepo: req.createRepo ?? true,
        ...req, // includes req.files, repoOwner, repoName, etc.
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `publish-to-github ${res.status} ${res.statusText}: ${text.slice(0, 400)}`
      );
    }

    return (await res.json()) as PublishResponse;
  } finally {
    clearTimeout(timer);
  }
}

export default callPublishToGitHub;