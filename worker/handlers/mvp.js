// api/mvp.js
import { buildAndDeployApp } from '../../lib/build/buildService.js';

export async function mvpHandler(request, env) {
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

        const parts = ['frontend', 'backend', 'assets', 'config'];
        const allFiles = [];

        send('🤔 Analyzing your prompt and starting chunked generation...');
        await delay(500);

        for (const part of parts) {
          send(`🧠 Generating ${part} files...`);
          await delay(300);

          try {
            const res = await fetch('https://launchwing-agent.onrender.com/generate/chunk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ part, prompt: requirements }),
            });

            if (!res.ok) {
              const errText = await res.text();
              send(`❌ ${part} generation failed: ${errText}`);
              continue;
            }

            const { files } = await res.json();
            if (!Array.isArray(files) || files.length === 0) {
              send(`⚠️ No ${part} files returned`);
              continue;
            }

            send(`✅ ${files.length} ${part} files generated`);
            allFiles.push(...files);
            await delay(400);
          } catch (e) {
            send(`❌ Error generating ${part}: ${e.message}`);
          }
        }

        if (allFiles.length === 0) {
          send('❌ No files generated. Cannot deploy.');
          controller.close();
          return;
        }

        const validFiles = allFiles.filter(
          (f) => f && typeof f.path === 'string' && typeof f.content === 'string'
        );

        if (validFiles.length !== allFiles.length) {
          send(`⚠️ Skipped ${allFiles.length - validFiles.length} malformed file(s)`);
        }

        send(`🧾 Deploying ${validFiles.length} files...`);
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
            files: validFiles,
          });

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

