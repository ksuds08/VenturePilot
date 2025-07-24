// SPDX-License-Identifier: MIT
// Handler for the `/assistant` endpoint.  Acts as a conversational
// startup coach that replies with a multi‑paragraph answer and
// extracts a refined business idea from the conversation.  The
// refined idea is returned separately so that the front end can
// distinguish between the chat response and the synthesised idea.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';

export async function assistantHandler(request, env) {
  const body = await safeJson(request);
  if (!Array.isArray(body?.messages)) {
    return jsonResponse({ error: 'Missing messages' }, 400);
  }
  // Prepend system prompt instructing the assistant to be a startup coach
  const system = {
    role: 'system',
    content: `You are a startup coach. Provide a thoughtful, multi‑paragraph reply to the user's message.
At the end, include a concise summary of the business idea using the exact label 'Refined Idea:' on its own line, followed by the summary on the next line.`,
  };
  const result = await openaiChat(env.OPENAI_API_KEY, [system, ...body.messages]);
  const content = result.choices?.[0]?.message?.content || '';
  // Extract the refined idea section
  const match = content.match(/Refined Idea:\s*\n+([\s\S]*)$/i);
  const refined = match ? match[1].trim() : '';
  const reply = match ? content.replace(match[0], '').trim() : content;
  return jsonResponse({ reply, refinedIdea: refined });
}
