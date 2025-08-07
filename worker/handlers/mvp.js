import { buildAndDeployApp } from '../../lib/build/buildService.js';

export async function mvpHandler(request, env) {
  console.log("DEBUG: CLOUDFLARE_ACCOUNT_ID =", env.CLOUDFLARE_ACCOUNT_ID);
  console.log("DEBUG: CLOUDFLARE_API_TOKEN =", env.CLOUDFLARE_API_TOKEN?.slice?.(0, 5) + '...');

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method.toUpperCase() !== 'POST') {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

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

  const wantsStream =
    request.headers.get('accept')?.includes('text/event-stream') ||
    new URL(request.url).searchParams.get('stream') === 'true';

  if (wantsStream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (text) =>
          controller.enqueue(encoder.encode(`${text}\n\n`));

        const agentRes = await fetch('https://launchwing-agent.onrender.com/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: requirements }),
        });

        if (!agentRes.ok || !agentRes.body) {
          send(`data: ${JSON.stringify({ error: 'Agent request failed' })}`);
          controller.close();
          return;
        }

        const reader = agentRes.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let files = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split('\n\n');
            buffer = parts.pop(); // retain last partial

            for (const chunk of parts) {
              if (!chunk.startsWith('data:')) continue;
              const payload = chunk.slice(5).trim();

              try {
                const parsed = JSON.parse(payload);
                if (Array.isArray(parsed.files)) {
                  files = parsed.files;
                }

                send(`data: ${payload}`);
              } catch {
                send(`data: ${JSON.stringify({ error: 'Malformed SSE event' })}`);
              }
            }
          }
        } catch (err) {
          send(`data: ${JSON.stringify({ error: 'Stream error', details: err.message })}`);
          controller.close();
          return;
        }

        send(`data: ${JSON.stringify({ type: 'status', message: '🚀 Deploying your app...' })}`);

        const ideaId = body.ideaId || Math.random().toString(36).substring(2, 8);
        const ideaSummary = {
          name: (body.branding && body.branding.name) || 'AI MVP',
          description: requirements,
        };
        const branding = body.branding || {};
        const messages = body.messages || [];

        try {
          const result = await buildAndDeployApp({
            ideaId,
            ideaSummary,
            branding,
            messages,
            files,
          }, env);

          if (result.pagesUrl) {
            send(`data: ${JSON.stringify({ type: 'status', message: '✅ Deployment successful!' })}`);
            send(`data: ${JSON.stringify({ type: 'pagesUrl', url: result.pagesUrl })}`);
            if (result.repoUrl) {
              send(`data: ${JSON.stringify({ type: 'repoUrl', url: result.repoUrl })}`);
            }
          } else {
            send(`data: ${JSON.stringify({ type: 'error', message: 'Deployment failed. No pages URL returned.' })}`);
          }
        } catch (err) {
          send(`data: ${JSON.stringify({ type: 'error', message: 'Deployment error', details: err.message })}`);
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  return new Response('This endpoint only supports streaming', {
    status: 400,
    headers: {
      'Content-Type': 'text/plain',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}