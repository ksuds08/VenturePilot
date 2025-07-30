import { buildAndDeployApp } from '../../lib/buildService.js';

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

        send("🤔 Analyzing your prompt...");
        await delay(800);

        // Call the agent
        const agentRes = await fetch('https://launchwing-agent.onrender.com/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: requirements }),
        });

        if (!agentRes.ok) {
          const errorText = await agentRes.text();
          send(`❌ Agent error: ${errorText}`);
          controller.close();
          return;
        }

        const json = await agentRes.json();
        const files = json.files;

        if (!Array.isArray(files) || files.length === 0) {
          send("❌ Agent returned no files.");
          controller.close();
          return;
        }

        send("✅ Code files generated.");
        await delay(600);

        send("🚀 Deploying your MVP...");
        await delay(600);

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
          });

          if (result.pagesUrl) {
            send("✅ Deployment successful!");
            send(`pagesUrl:${result.pagesUrl}`);
            if (result.repoUrl) {
              send(`repoUrl:${result.repoUrl}`);
            }
          } else {
            send("❌ Deployment failed.");
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
        'Connection': 'keep-alive',
      },
    });
  }

  // Non-streaming fallback
  try {
    const agentRes = await fetch('https://launchwing-agent.onrender.com/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: requirements }),
    });

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

    const json = await agentRes.json();
    const files = json.files;

    if (!Array.isArray(files) || files.length === 0) {
      return new Response('No files returned by agent', {
        status: 502,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const ideaId = body.ideaId || Math.random().toString(36).substring(2, 8);
    const ideaSummary = {
      name: (body.branding && body.branding.name) || 'AI MVP',
      description: requirements,
    };
    const branding = body.branding || {};
    const messages = body.messages || [];

    const result = await buildAndDeployApp({
      ideaId,
      ideaSummary,
      branding,
      messages,
      files,
    });

    if (result.pagesUrl) {
      return new Response(
        JSON.stringify({
          pagesUrl: result.pagesUrl,
          repoUrl: result.repoUrl ?? null,
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        },
      );
    } else {
      return new Response('Deployment failed', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`MVP handler error: ${msg}`, {
      status: 502,
      headers: {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}

// Helper delay function
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}