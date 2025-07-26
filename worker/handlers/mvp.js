// SPDX-License-Identifier: MIT
//
// Thin wrapper around the internal generate handler.  The original MVP
// generation logic lives in handlers/generate.js; this module simply
// forwards incoming requests to that route.  Splitting the heavy
// generation work into a separate handler makes it easier to offload
// long‑running tasks to a different service or Durable Object in the
// future without changing the public API.

export async function mvpHandler(request, env) {
  // Build a URL pointing at the internal /generate route on the same host.
  const url = new URL(request.url);
  url.pathname = '/generate';
  // Forward the request method, headers and body.  We clone the body by
  // reading it as text; for binary bodies this could be adapted to
  // request.arrayBuffer().  If reading fails, pass through null.
  let body;
  try {
    body = await request.text();
  } catch (_) {
    body = null;
  }
  const response = await fetch(url.toString(), {
    method: request.method,
    headers: request.headers,
    body,
  });
  // Return the response as‑is.  The Cloudflare runtime will stream the
  // response body back to the client.
  return response;
}
