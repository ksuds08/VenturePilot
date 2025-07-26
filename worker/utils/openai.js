// SPDX-License-Identifier: MIT
//
// Utility helper to call the OpenAI chat completions API.  This module
// centralises all OpenAI network requests so individual handlers can
// import a single function instead of re‑defining the fetch logic.

/**
 * Call the OpenAI chat completions API.
 *
 * This helper accepts an optional `functions` parameter which allows
 * callers to enable OpenAI's function‑calling mode.  When provided,
 * the functions array is passed through to the API.  If omitted,
 * behaviour is identical to the original implementation.
 *
 * @param {string} apiKey – the secret API key to use for authentication
 * @param {Array} messages – an array of message objects, each
 *   having a `role` and `content` property
 * @param {string} [model] – the model identifier to use (defaults to gpt‑4o)
 * @param {number} [temperature] – sampling temperature (optional)
 * @param {Array|null} [functions] – optional array of function definitions for the model to call
 * @returns {Promise<Object>} – the parsed JSON response from OpenAI
 * @throws {Error} – if the HTTP request fails
 */
export async function openaiChat(apiKey, messages, model = 'gpt-4o', temperature = 0.7, functions = undefined) {
  // Build the request body.  Only include optional keys when they are
  // defined – this avoids sending empty or null values to the API.
  const body = { model, messages, temperature };
  if (Array.isArray(functions) && functions.length > 0) {
    body.functions = functions;
  }
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // If OpenAI returns an error, expose the body for easier debugging
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${errorText}`);
  }
  return response.json();
}
