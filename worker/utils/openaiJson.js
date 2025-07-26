// SPDX-License-Identifier: MIT
//
// Higher‑level wrapper around the OpenAI chat completions API that enforces
// JSON output.  This helper calls `openaiChat` and then cleans and parses
// the response content into JSON.  It retries once if parsing fails or if
// the model includes code fences or commentary.  If the second attempt
// fails, it throws an error so callers can handle the failure appropriately.

import { openaiChat } from './openai.js';

/**
 * Call the OpenAI chat completions API and return only the parsed JSON from
 * the assistant's message.  This function strips markdown code fences, cuts
 * out the JSON substring and attempts to parse it.  If parsing fails,
 * it will retry once after prepending a system reminder to return valid
 * JSON only.
 *
 * @param {string} apiKey – OpenAI API key
 * @param {Array<Object>} messages – chat messages for the completion
 * @param {Object} [options] – optional model and temperature overrides
 * @returns {Promise<any>} – parsed JSON object
 * @throws {Error} – if JSON cannot be parsed after two attempts
 */
export async function openaiChatJson(apiKey, messages, options = {}) {
  const { model = 'gpt-4o', temperature = 0.7 } = options;
  let attempt = 0;
  let msgs = messages;
  while (attempt < 2) {
    const res = await openaiChat(apiKey, msgs, model, temperature);
    let raw = res.choices?.[0]?.message?.content?.trim() || '';
    // Remove code fences and language hints
    raw = raw.replace(/```.*?\n|```/gs, '').trim();
    // Extract from first '{' to last '}' if possible
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    let jsonText = raw;
    if (start !== -1 && end !== -1 && end > start) {
      jsonText = raw.slice(start, end + 1);
    }
    try {
      return JSON.parse(jsonText);
    } catch (err) {
      attempt++;
      if (attempt >= 2) {
        throw new Error('Failed to parse JSON response from OpenAI');
      }
      // Prepend a reminder to return valid JSON only
      msgs = [
        { role: 'system', content: 'You must return only valid JSON. Do not include markdown or commentary.' },
        ...messages,
      ];
    }
  }
}