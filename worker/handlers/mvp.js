// SPDX-License-Identifier: MIT

/**
 * Handle POST requests to `/mvp`. Parse the incoming body to extract a
 * human‑readable requirements string and forward it to the Launchwing agent.
 *
 * Supports CORS by responding to OPTIONS preflight requests and
 * adding an Access-Control-Allow-Origin header to every response.
 */
export async function mvpHandler(request, env) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*', // set to your Pages domain if you prefer
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Only allow POST for the actual handler
  if (request.method.toUpperCase() !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Parse the request body
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
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

    // Handle non-OK responses from the agent
    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      return new Response(`Agent error: ${errorText}`, {
        status: agentRes.status,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Stream SSE directly if requested
    if (wantsStream) {
      return new Response(agentRes.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // Otherwise return the message wrapped in JSON with a `plan` key
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
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Failed to contact agent: ${msg}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}