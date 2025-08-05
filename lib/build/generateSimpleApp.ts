// src/lib/generateSimpleApp.ts
import type { BuildPayload } from './types';

function escapeHTML(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function generateSimpleApp(
  plan: string,
  branding: BuildPayload['branding'],
  projectName: string
): Record<string, string> {
  const appName = branding?.name || 'My AI App';
  const tagline = branding?.tagline || 'An AI-powered experience';
  const primaryColor = branding?.palette?.primary || '#2563eb';
  const escapedPlan = escapeHTML(typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2));

  const indexHtml = `<!DOCTYPE html>
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
    <button onclick="sayHi()">Try Me</button>
  </main>
  <script src="/main.js"></script>
</body>
</html>`;

  const styleCss = `
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
`;

  const mainJs = `
function sayHi() {
  alert("Hello from ${appName}!");
}
`;

  const workerIndexTs = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    const files = {
      '/': { content: html, type: 'text/html' },
      '/style.css': { content: css, type: 'text/css' },
      '/main.js': { content: js, type: 'application/javascript' },
    };

    const file = files[path] || files['/'];
    return new Response(file.content, {
      headers: { 'Content-Type': file.type },
    });
  },
};

const html = \`${indexHtml}\`;
const css = \`${styleCss}\`;
const js = \`${mainJs}\`;
`;

  const wranglerToml = `name = "${projectName || 'launchwing-app'}"
main = "functions/index.ts"
compatibility_date = "2024-08-01"
`;

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

      - name: Install Wrangler
        run: npm install -g wrangler@4

      - name: Deploy to Cloudflare
        run: wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CF_API_TOKEN }}
`;

  return {
    'functions/index.ts': workerIndexTs,
    'wrangler.toml': wranglerToml,
    '.github/workflows/deploy.yml': deployYaml,
  };
}