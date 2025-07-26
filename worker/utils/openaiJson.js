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
 * @param {Array} messages – chat messages for the completion
 * @param {Object} [options] – optional model and temperature overrides
 * @returns {Promise<Object>} – parsed JSON object
 * @throws {Error} – if JSON cannot be parsed after two attempts
 */
export async function openaiChatJson(apiKey, messages, options = {}) {
  const { model = 'gpt-4o', temperature = 0.7 } = options;
  let attempt = 0;
  let msgs = messages;
  while (attempt < 2) {
    const res = await openaiChat(apiKey, msgs, model, temperature);
    let raw = res.choices?.[0]?.message?.content?.trim() || '';
    // Remove triple backticks and any optional language tags.  Some models
    // prefix their JSON with ```json or ``` before the object.  This regex
    // strips the fence and any immediate non‑newline characters following it.
    raw = raw.replace(/```[a-zA-Z0-9]*\s*/g, '').trim();
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
      /**
       * If the first parse fails, attempt a series of increasingly permissive
       * repairs. Common issues include single‑quoted keys/values, trailing
       * commas, and unquoted keys. We'll attempt to fix each in turn and
       * parse again. If all repairs fail, fall back to evaluating the
       * response as a JavaScript object.  Only after all attempts fail
       * will we throw an error.
       */
      const repairs = [];
      // 1. Fix single quotes around keys and values
      repairs.push((str) => str
        .replace(/'([^']+)'(?=\s*:)/g, '"$1"')
        .replace(/:\s*'([^']+)'/g, ': "$1"'));
      // 2. Remove trailing commas before closing braces/brackets
      repairs.push((str) => str.replace(/,\s*([}\]])/g, '$1'));
      // 3. Quote unquoted keys (e.g. { foo: 1 } -> { "foo": 1 })
      repairs.push((str) => str.replace(/([\{,]\s*)([A-Za-z0-9_]+)\s*:/g, '$1"$2":'));
      let lastError = err;
      for (const repair of repairs) {
        try {
          const repaired = repair(jsonText);
          return JSON.parse(repaired);
        } catch (e) {
          lastError = e;
        }
      }
      // 4. As a last resort, evaluate as JavaScript object
      try {
        // eslint-disable-next-line no-new-func
        const obj = Function('"use strict";return (' + jsonText + ')')();
        return obj;
      } catch (e) {
        lastError = e;
      }
      // If we've exhausted all repair attempts, retry the API call once with a stricter system message
      attempt++;
      if (attempt >= 2) {
        throw new Error('Failed to parse JSON response from OpenAI');
      }
      msgs = [
        { role: 'system', content: 'You must return only valid JSON. Do not include markdown or commentary.' },
        ...messages,
      ];
    }
  }
}
