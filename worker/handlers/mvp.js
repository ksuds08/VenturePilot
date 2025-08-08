// workers/api/mvp.js (your file)
import { buildAndDeployApp } from '../../lib/build/buildService.js';

export async function mvpHandler(request, env) {
  // 🔊 Debug: prove handler invoked + env var present
  console.log("MVP handler invoked. AGENT_BASE_URL =", env?.AGENT_BASE_URL);

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

  const requirements =
    typeof body.requirements === 'string'
      ? body.requirements
      : Array.isArray(body.requirements)
      ? body.requirements.join(' ')
      : typeof body.prompt === 'string'
      ? body.prompt
      : JSON.stringify(body) ?? '';

  const wantsStream =
    request.headers.get('accept')?.includes('text/event-stream') ||
    new URL(request.url).searchParams.get('stream') === 'true';

  if (!wantsStream) {
    return new Response('This endpoint only supports streaming', {
      status: 400,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const ideaId = body.ideaId || Math.random().toString(36).substring(2, 8);
        const ideaSummary = {
          name: (body.branding && body.branding.name) || 'AI MVP',
          description: requirements,
        };
        const branding = body.branding || {};
        const messages = body.messages || [];

        // Stages
        send({ type: 'status', message: '🧠 Planning…' });
        send({ type: 'status', message: '🛠️ Generating files…' });

        const result = await buildAndDeployApp(
          { ideaId, ideaSummary, branding, messages },
          env
        );

        send({ type: 'status', message: '📤 Publishing to GitHub…' });

        // buildAndDeployApp now performs the publish and returns repoUrl
        if (result?.repoUrl) {
          send({ type: 'repoUrl', url: result.repoUrl });
        }

        send({
          type: 'status',
          message:
            '🚀 Deployment will kick off via GitHub Actions automatically (usually 1–3 min)…',
        });

        // Optionally echo minimal file list or plan
        if (result?.plan) send({ type: 'plan', plan: result.plan });

        send({ type: 'status', message: '✅ Done' });
      } catch (err) {
        console.error("MVP handler error:", err?.message || err); // 🔊 Debug
        send({ type: 'error', message: 'Build error', details: String(err?.message || err) });
      } finally {
        controller.close();
      }
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