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
          controller.enqueue(encoder.encode(`data: ${text}\n\n`));

        send('🧠 Generating full project with structured files...');
        await delay(500);

        let files = [];

        try {
          const res = await fetch('https://launchwing-agent.onrender.com/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: requirements }),
          });

          if (!res.ok) {
            const errText = await res.text();
            send(`❌ Code generation failed: ${errText}`);
            controller.close();
            return;
          }

          const result = await res.json();
          files = Array.isArray(result.files) ? result.files : [];

          if (files.length === 0) {
            send('❌ No files returned from agent');
            controller.close();
            return;
          }

          send(`✅ Received ${files.length} files from agent`);
          await delay(400);
        } catch (err) {
          send(`❌ Agent request failed: ${err.message}`);
          controller.close();
          return;
        }

        send('🚀 Deploying your app...');
        await delay(500);

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
            send('✅ Deployment successful!');
            send(`pagesUrl:${result.pagesUrl}`);
            if (result.repoUrl) {
              send(`repoUrl:${result.repoUrl}`);
            }
          } else {
            send('❌ Deployment failed. No pages URL returned.');
          }
        } catch (err) {
          send(`❌ Deployment error: ${err.message}`);
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