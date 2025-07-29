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
 * Deploy an MVP for the given idea.
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
