// SPDX-License-Identifier: MIT

// Updated MVP handler for VenturePilot.
//
// This implementation replaces the previous call to the internal
// `generateHandler` with a remote call to the Launchwing agent.  The
// Launchwing service accepts a simple `requirements` string and returns either
// a JSON payload with a `message` property or an SSE stream of progress
// updates.  If the call fails, the error status and response are
// forwarded directly to the client.

/**
 * Handle POST requests to `/mvp`.  Parse the incoming body to extract a
 * human‑readable requirements string and forward it to the Launchwing agent.
 *
 * If the client requests streaming (via `Accept: text/event-stream` or
 * `?stream=true` in the URL), this handler proxies the agent’s SSE
 * stream directly.  Otherwise it returns only the final message.
 *
 * @param {Request} request
 * @param {Object} env Environment bindings passed in by Cloudflare (unused)
 * @returns {Promise<Response>}
 */
export async function mvpHandler(request, env) {
  if (request.method.toUpperCase() !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return new Response('Invalid JSON body', { status: 400 });
  }

  // Attempt to derive a requirements string from the provided payload.
  let requirements;
  if (typeof body.requirements === 'string') {
    requirements = body.requirements;
  } else if (Array.isArray(body.requirements)) {
    requirements = body.requirements.join(' ');
  } else if (typeof body.prompt === 'string') {
    requirements = body.prompt;
  } else {
    try {
      requirements = JSON.stringify(body);
    } catch (_) {
      requirements = '';
    }
  }

  try {
    // Determine whether the client expects a streaming response.  We check
    // both the Accept header and a `stream` query parameter.  If either
    // indicates streaming, we'll call the agent's streaming endpoint and
    // forward the SSE body directly to the client.  Otherwise we use the
    // synchronous endpoint and return only the final message.
    const url = new URL(request.url);
    const wantsStream =
      request.headers.get('accept')?.includes('text/event-stream') ||
      url.searchParams.get('stream') === 'true';

    const endpoint = wantsStream
      ? 'https://launchwing-agent.onrender.com/build/stream'
      : 'https://launchwing-agent.onrender.com/build';

    const agentRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requirements }),
    });

    if (!agentRes.ok) {
      // If the agent returned an error, forward the status and body
      const errorText = await agentRes.text();
      return new Response(`Agent error: ${errorText}`, {
        status: agentRes.status,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Streaming mode: pipe the SSE stream through without reading it.  The
    // Cloudflare Worker will handle streaming the ReadableStream to the
    // client.  Set the appropriate content type.
    if (wantsStream) {
      return new Response(agentRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
        },
      });
    }

    // Non‑streaming mode: parse the JSON and return the final message.
    const data = await agentRes.json();
    const message = data?.message ?? '';
    return new Response(message, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Failed to contact agent: ${msg}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}