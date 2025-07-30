// SPDX-License-Identifier: MIT

/**
 * Handle POST requests to `/mvp`.  Parse the incoming body to extract a
 * human‑readable requirements string and forward it to the Launchwing agent.
 *
 * If the client requests streaming (via `Accept: text/event-stream` or
 * `?stream=true` in the URL), this handler proxies the agent’s SSE
 * stream directly. Otherwise it returns a JSON object with a `plan` field.
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

  // Derive the requirements string from the payload
  let requirements;
  if (typeof body.requirements === 'string') {
    requirements = body.requirements;
  } else if (Array.isArray(body.requirements)) {
    requirements = body.requirements.join(' ');
  } else if (typeof body.prompt === 'string') {
    requirements = body.prompt;
  } else {
    requirements = JSON.stringify(body) ?? '';
  }

  try {
    // Determine if the client wants a streaming response
    const url = new URL(request.url);
    const wantsStream =
      request.headers.get('accept')?.includes('text/event-stream') ||
      url.searchParams.get('stream') === 'true';

    const endpoint = wantsStream
      ? 'https://launchwing-agent.onrender.com/build/stream'
      : 'https://launchwing-agent.onrender.com/build';

    const agentRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requirements }),
    });

    if (!agentRes.ok) {
      // Read the error body even if not streaming
      const errorText = await agentRes.text();
      return new Response(`Agent error: ${errorText}`, {
        status: agentRes.status,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // Stream through SSE if requested
    if (wantsStream) {
      return new Response(agentRes.body, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    // Otherwise return the message wrapped in JSON with a `plan` key
    // Read raw text, log it, then parse
    const rawText = await agentRes.text();
    console.log('Agent raw response:', rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch {
      // Fallback to plain text if JSON parsing fails
      data = { message: rawText };
    }

    const message = data?.message ?? '';
    return new Response(JSON.stringify({ plan: message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Failed to contact agent: ${msg}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain' },
    });
  }
}