// lib/build/callPublishToGitHub.ts
export type PublishRequest = {
  repoOwner?: string;
  repoName: string;
  branch?: string;           // default "main"
  commitMessage?: string;    // default "chore: initial MVP"
  createRepo?: boolean;      // default true
};

export type PublishResponse = {
  repoUrl: string;
  branch: string;
  commitSha: string;
};

export async function callPublishToGitHub(
  req: PublishRequest,
  opts: { baseUrl?: string; apiKey?: string; timeoutMs?: number } = {}
): Promise<PublishResponse> {
  const baseUrl = opts.baseUrl || process.env.AGENT_BASE_URL || "https://launchwing-agent.onrender.com";
  const timeoutMs = opts.timeoutMs ?? 60_000;

  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/publish-to-github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey || process.env.AGENT_API_KEY
          ? { Authorization: `Bearer ${opts.apiKey || process.env.AGENT_API_KEY}` }
          : {}),
      },
      body: JSON.stringify({
        branch: "main",
        commitMessage: req.commitMessage ?? "chore: initial MVP",
        createRepo: req.createRepo ?? true,
        ...req,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`publish-to-github ${res.status} ${res.statusText}: ${text.slice(0, 400)}`);
    }
    return (await res.json()) as PublishResponse;
  } finally {
    clearTimeout(id);
  }
}