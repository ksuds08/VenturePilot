import type { BuildPayload } from './types';
import { generateWranglerToml } from '../generate/generateWranglerToml';

function escapeHTML(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function generateSimpleApp(
  plan: string,
  branding: BuildPayload['branding'],
  projectName: string,
  kvNamespaceId: string
): Promise<Record<string, string>> {
  const appName = branding?.name || 'My AI App';
  const tagline = branding?.tagline || 'An AI-powered experience';
  const primaryColor = branding?.palette?.primary || '#2563eb';
  const escapedPlan = escapeHTML(typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2));

  const workerIndexTs = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/api/submissions" && request.method === "GET") {
      if (!env.SUBMISSIONS_KV) {
        return new Response("KV binding missing", { status: 500 });
      }

      try {
        const list = await env.SUBMISSIONS_KV.list({ prefix: "submission:" });
        const values = await Promise.all(
          list.keys.map(async (entry) => {
            try {
              const raw = await env.SUBMISSIONS_KV.get(entry.name);
              return raw ? JSON.parse(raw) : null;
            } catch {
              return null;
            }
          })
        );
        const parsed = values.filter(Boolean);
        return new Response(JSON.stringify(parsed, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response("Error reading from KV", { status: 500 });
      }
    }

    if (path === "/api/submit" && request.method === "POST") {
      if (!env.SUBMISSIONS_KV) {
        return new Response("KV binding missing", { status: 500 });
      }

      try {
        const name = await request.text();
        const submittedAt = new Date().toISOString();
        const record = { name, submittedAt };
        const key = \`submission:\${Date.now()}\`;
        await env.SUBMISSIONS_KV.put(key, JSON.stringify(record));
        return new Response(
          JSON.stringify({ message: \`Thanks, \${name}!\` }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (err) {
        return new Response("Error writing to KV", { status: 500 });
      }
    }

    const files = {
      '/': {
        content: \`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${appName}</title>
  <link rel="stylesheet" href="/style.css" />
</head>
<body>
  <main>
    <h1>${appName}</h1>
    <h2>${tagline}</h2>
    <pre>${escapedPlan}</pre>

    <form id="userForm">
      <input name="name" placeholder="Your name" required />
      <button type="submit">Submit</button>
    </form>
    <p id="responseMsg"></p>

    <button onclick="sayHi()">Try Me</button>
  </main>
  <script src="/main.js"></script>
</body>
</html>\`,
        type: "text/html",
      },
      '/style.css': {
        content: \`
body {
  font-family: system-ui, sans-serif;
  background: #f8fafc;
  margin: 0;
  padding: 2rem;
  color: #111827;
}
main {
  text-align: center;
}
h1 {
  color: ${primaryColor};
  font-size: 2rem;
  margin-bottom: 0.5rem;
}
button {
  background: ${primaryColor};
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  margin-top: 1rem;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
}
input {
  padding: 0.5rem;
  border: 1px solid #ccc;
  border-radius: 6px;
  margin-top: 1rem;
  display: block;
  width: 200px;
  margin-inline: auto;
}
\`,
        type: "text/css",
      },
      '/main.js': {
        content: \`
function sayHi() {
  alert("Hello from ${appName}!");
}

document.querySelector('#userForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = e.target.name.value;
  const res = await fetch('/api/submit', {
    method: 'POST',
    body: name,
  });
  const data = await res.json();
  document.querySelector('#responseMsg').textContent = data.message;
});
\`,
        type: "application/javascript",
      }
    };

    const file = files[path] || files['/'];
    return new Response(file.content, {
      headers: { 'Content-Type': file.type },
    });
  },
};
`;

  const wranglerToml = generateWranglerToml(projectName, kvNamespaceId);

  const deployYaml = `name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`;

  return {
    'index.html': '', // keep for GitHub visibility only
    'style.css': '',
    'main.js': '',
    'functions/index.ts': workerIndexTs,
    'wrangler.toml': wranglerToml,
    '.github/workflows/deploy.yml': deployYaml,
  };
}