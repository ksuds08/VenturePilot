// SPDX-License-Identifier: MIT
// Utility helper to call the OpenAI chat completions API.  This module
// centralizes all OpenAI network requests so individual handlers can
// import a single function instead of re‑defining the fetch logic.

/**
 * Call the OpenAI chat completions API.
 *
 * @param {string} apiKey – the secret API key to use for authentication
 * @param {Array<Object>} messages – an array of message objects, each
 *   having a `role` and `content` property
 * @param {string} model – the model identifier to use (defaults to gpt‑4o)
 * @param {number} temperature – sampling temperature (optional)
 * @returns {Promise<Object>} – the parsed JSON response from OpenAI
 * @throws {Error} – if the HTTP request fails
 */
export async function openaiChat(apiKey, messages, model = 'gpt-4o', temperature = 0.7) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature }),
  });
  if (!response.ok) {
    // If OpenAI returns an error, expose the body for easier debugging
    const errorText = await response.text();
    throw new Error(`OpenAI error: ${errorText}`);
  }
  return response.json();
}
