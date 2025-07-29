// SPDX-License-Identifier: MIT

// Updated MVP handler for VenturePilot.
//
// This replaces the previous call to generateHandler with a remote call
// to the Launchwing agent.  It extracts a requirements string from the
// incoming body, forwards it to the agent, and returns the agent’s
// message.  Any errors from the agent are forwarded to the client.

export async function mvpHandler(request, env) {
  if (request.method.toUpperCase() !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  // Derive a requirements string from the body: prefer `requirements`
  // (string or array), then `prompt`, else fall back to serializing the body.
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
    } catch {
      requirements = '';
    }
  }

  try {
    const agentRes = await fetch(
      'https://launchwing-agent.onrender.com/build',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requirements })
      }
    );

    if (!agentRes.ok) {
      const errorText = await agentRes.text();
      return new Response(`Agent error: ${errorText}`, {
        status: agentRes.status,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    const data = await agentRes.json();
    const message = data?.message ?? '';
    return new Response(message, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`Failed to contact agent: ${msg}`, {
      status: 502,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}