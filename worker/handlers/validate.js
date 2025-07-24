// SPDX-License-Identifier: MIT
// Handler for the `/validate` endpoint.  This handler accepts an idea
// description and returns a structured validation covering the market,
// audience, business model, competitors and risks.  Results are cached
// in the bound KV namespace for 24 hours to avoid redundant calls to
// OpenAI.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';

export async function validateHandler(request, env) {
  // Parse the incoming JSON body
  const body = await safeJson(request);
  if (!body?.idea) {
    return jsonResponse({ error: 'Missing idea' }, 400);
  }
  const ideaId = body.ideaId || crypto.randomUUID();
  const cacheKey = `validate:${ideaId}`;
  // Check KV cache first
  const cached = await env.KV.get(cacheKey);
  if (cached) {
    return jsonResponse({ validation: cached, ideaId, cached: true });
  }
  // Construct OpenAI messages
  const messages = [
    { role: 'system', content: 'Startup validation with: market, audience, model, competitors, risks' },
    { role: 'user', content: `Validate: ${body.idea}` },
  ];
  // Call OpenAI; errors will propagate to the caller
  const validation = await openaiChat(env.OPENAI_API_KEY, messages);
  const output = validation.choices?.[0]?.message?.content || '';
  // Persist to KV for 24h (86400 seconds)
  await env.KV.put(cacheKey, output, { expirationTtl: 86400 });
  return jsonResponse({ validation: output, ideaId });
}
