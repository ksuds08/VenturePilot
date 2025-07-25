// SPDX-License-Identifier: MIT
// Handler for the `/brand` endpoint.  Generates a branding kit for a
// given idea and stores the result in KV.  The returned JSON includes
// a name, tagline, array of colours and a logo description.  If a
// logo prompt is provided it calls OpenAI's image generation API to
// produce a URL for a generated logo and includes it in the response.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';

export async function brandHandler(request, env) {
  const body = await safeJson(request);
  if (!body?.idea) {
    return jsonResponse({ error: 'Missing idea' }, 400);
  }
  const ideaId = body.ideaId || crypto.randomUUID();
  const idea = body.idea;
  // Ask OpenAI to produce a branding kit in JSON form
  const res = await openaiChat(env.OPENAI_API_KEY, [
    { role: 'system', content: 'Return JSON: name, tagline, colors[], logoDesc' },
    { role: 'user', content: `Create branding for: ${idea}` },
  ]);
  const raw = res.choices?.[0]?.message?.content || '{}';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = { error: 'Could not parse JSON', raw };
  }
  let logoUrl = null;
  if (parsed.logoDesc) {
    // Use DALL·E 3 to generate a logo image.  We ignore errors from this
    // call so that a missing image does not fail the entire request.
    try {
      const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'dall-e-3', prompt: parsed.logoDesc, n: 1, size: '1024x1024' }),
      });
      const imgJson = await imgRes.json();
      if (imgJson?.data?.[0]?.url) {
        logoUrl = imgJson.data[0].url;
        parsed.logoUrl = logoUrl;
      }
    } catch (err) {
      console.warn('⚠️ Failed to generate logo image:', err);
    }
  }
  // Persist the branding kit keyed by idea
  try {
    await env.KV.put(`brand:${ideaId}`, JSON.stringify(parsed));
  } catch (_) {
    // KV is optional; ignore if not bound
  }
  return jsonResponse({ ...parsed, ideaId });
}
