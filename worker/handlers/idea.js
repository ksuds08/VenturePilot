// SPDX-License-Identifier: MIT
// Handler for the `/idea` endpoint.  Generates multiple micro‑business
// suggestions as well as a structured business canvas from a user‑supplied
// prompt.  The canvas consists of a summary, a list of elaborated
// requirements and a set of clarifying questions.  The full canvas
// is stored in the bound KV namespace keyed by a generated idea ID.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';

export async function ideaHandler(request, env) {
  const body = await safeJson(request);
  if (!body?.prompt) {
    return jsonResponse({ error: 'Missing required field: prompt' }, 400);
  }
  const ideaId = crypto.randomUUID();
  // First, generate a handful of AI‑enabled micro‑business ideas
  const microIdeasRes = await openaiChat(env.OPENAI_API_KEY, [
    { role: 'system', content: 'You are VenturePilot, an AI startup co‑pilot.' },
    { role: 'user', content: `Generate 5 AI‑enabled micro‑business ideas based on: ${body.prompt}` },
  ], 'gpt-4o-mini');
  // Next, request a structured canvas.  We ask the model to return
  // valid JSON so that it can be parsed reliably.  If parsing fails we
  // fall back to a minimal canvas containing just the summary.
  const canvasRes = await openaiChat(env.OPENAI_API_KEY, [
    { role: 'system', content: 'You are VenturePilot, an AI startup co‑pilot.' },
    { role: 'user', content: `Return JSON with summary (string), requirements (string[]), questions (string[]) for: ${body.prompt}` },
  ]);
  let canvas = {};
  try {
    canvas = JSON.parse(canvasRes.choices?.[0]?.message?.content || '{}');
  } catch (_) {
    canvas = { summary: canvasRes.choices?.[0]?.message?.content || '' };
  }
  // Persist canvas to KV for later retrieval
  try {
    await env.KV.put(`idea:${ideaId}`, JSON.stringify({ prompt: body.prompt, canvas }));
  } catch (_) {
    // Ignore if KV is not bound
  }
  return jsonResponse({
    ideaId,
    ideas: microIdeasRes.choices?.[0]?.message?.content || '',
    summary: canvas.summary || '',
    requirements: Array.isArray(canvas.requirements) ? canvas.requirements : [],
    questions: Array.isArray(canvas.questions) ? canvas.questions : [],
  });
}
