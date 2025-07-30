/**
 * Base URL for all API calls.  If the environment provides
 * `NEXT_PUBLIC_API_URL` it will be used; otherwise a sensible
 * default is provided.  Defining it here ensures that all API
 * requests share the same origin.
 */
export const baseUrl =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://venturepilot-api.promptpulse.workers.dev";

export const validateUrl = `${baseUrl}/validate`;
export const brandUrl = `${baseUrl}/brand`;
export const mvpUrl = `${baseUrl}/mvp`;

/**
 * Submit an idea for validation.  Returns a promise with the parsed JSON response.
 */
export async function postValidate(idea: string, ideaId: any) {
  const res = await fetch(validateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, ideaId }),
  });
  return res.json();
}

/**
 * Request branding information for a given idea.
 */
export async function postBranding(idea: string, ideaId: any) {
  const res = await fetch(brandUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idea, ideaId }),
  });
  return res.json();
}

/**
 * Deploy an MVP for the given idea (standard request).
 */
export async function postMvp(
  ideaId: any,
  branding: any,
  messages: any[],
) {
  const res = await fetch(mvpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideaId, branding, messages }),
  });
  return res;
}

/**
 * Stream real-time deployment logs using Server-Sent Events.
 */
export async function getMvpStream(
  ideaId: any,
  branding: any,
  messages: any[],
  onLog: (message: string) => void,
  onDone: (result: { pagesUrl?: string; repoUrl?: string; plan?: string }) => void,
  onError: (error: string) => void,
) {
  const response = await fetch(`${mvpUrl}?stream=true`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ ideaId, branding, messages }),
  });

  if (!response.ok || !response.body) {
    onError(`HTTP error: ${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const chunk = buffer.slice(0, buffer.indexOf("\n\n"));
      buffer = buffer.slice(buffer.indexOf("\n\n") + 2);

      const lines = chunk.split("\n");
      const eventType = lines.find((l) => l.startsWith("event:"))?.slice(6).trim();
      const dataLine = lines.find((l) => l.startsWith("data:"));
      if (!dataLine) continue;

      const data = dataLine.slice(5).trim();
      if (eventType === "log") {
        onLog(data);
      } else if (eventType === "done") {
        try {
          const result = JSON.parse(data);
          onDone(result);
        } catch {
          onError("Failed to parse final result");
        }
      } else if (eventType === "error") {
        onError(data);
      }
    }
  }
}