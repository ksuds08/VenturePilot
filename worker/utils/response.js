// SPDX-License-Identifier: MIT
// Utility helpers for JSON request/response handling.
// These helpers standardise JSON parsing and response creation so that
// handlers remain concise and free from boilerplate.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Create a JSON Response with the given data and status.
 *
 * CORS headers are automatically merged in so that callers can
 * interact with the worker from any origin.  The `Content-Type`
 * header is always set to `application/json`.
 *
 * @param {Object} obj – the data to serialise to JSON
 * @param {number} status – the HTTP status code (default: 200)
 * @returns {Response}
 */
export function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Safely parse a JSON request body.  If parsing fails the returned
 * promise rejects, allowing the handler to return an error response.
 *
 * @param {Request} request – the incoming request whose body will be parsed
 * @returns {Promise<Object>} – the parsed JSON payload
 */
export async function safeJson(request) {
  try {
    return await request.json();
  } catch (_) {
    throw new Error('Invalid JSON payload');
  }
}

/**
 * Sanitize a free‑form description by removing control characters and
 * limiting its length.  This is primarily used when passing user
 * input into AI models to avoid injection of formatting or control
 * sequences.
 *
 * @param {string} str – the input string
   * @returns {string} – the cleaned and truncated string
 */
export function sanitizeDescription(str) {
  return (str || '').replace(/[\r\n\t\f\v\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 350);
}
