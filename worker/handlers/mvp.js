// SPDX-License-Identifier: MIT
// Improved handler for the `/mvp` endpoint.  This version includes
// error checking on all external API calls (GitHub and Cloudflare).
// It returns an error response if any step fails rather than
// unconditionally claiming success.  It also avoids generating
// sub-files to keep the number of subrequests under Cloudflare’s
// per-request limit.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';
import {
  decomposePlanToComponents,
  generateComponentWithRetry,
  generateFrontendFiles,
  // generateComponentSubFiles,
  generateRouterFile,
} from '../utils/mvpUtils.js';

function generateBackendStubs(plan) {
  const files = {};
  const endpoints = Array.isArray(plan.backendEndpoints) ? plan.backendEndpoints : [];
  for (const ep of endpoints) {
    if (!ep?.path) continue;
    const safeName = ep.path
      .replace(/^\/+/, '')
      .replace(/\//g, '-')
      .replace(/[^A-Za-z0-9_-]/g, '');
    const handlerName = `${safeName}Handler`;
    const description = ep.description || 'Not implemented';
    const code = `export async function ${handlerName}(req: Request): Promise<Response> {\n` +
      `  return new Response(JSON.stringify({ message: '${description}' }), { status: 200, headers: { 'Content-Type': 'application/json' } });\n` +
      `}\n`;
    files[`functions/api/${safeName}.ts`] = code;
  }
  return files;
}

export async function mvpHandler(request, env) {
  const body = await safeJson(request);
  const { ideaId, branding, messages } = body;
  const logoUrl = branding?.logoUrl || null;
  if (!ideaId || !branding || !messages) {
    return jsonResponse({ error: 'Missing ideaId, branding, or messages' }, 400);
  }
  // Build MVP plan
  const planPrompt = [
    {
      role: 'system',
      content:
        `You are a startup cofounder assistant AI. From the following chat history, extract:\n\n` +
        `1. A complete and structured MVP plan\n` +
        `2. A list of backend API endpoints required to implement the MVP\n\n` +
        `Guidelines:\n` +
        `- Be concise and specific\n` +
        `- Avoid vague names like "MyApp" or "CoolTool" — infer a meaningful product name if not given\n` +
        `- Infer technology stack (e.g., React, TypeScript, Cloudflare Workers) if not stated\n` +
        `- backendEndpoints should cover all dynamic functionality the MVP requires\n\n` +
        `Output valid JSON ONLY in this exact structure:\n\n` +
        `{\n` +
        `  "mvp": { ... },\n  "backendEndpoints": [ ... ]\n}` +
        `\n\nDO NOT include markdown. Output only pure JSON.`,
    },
    {
      role: 'user',
      content: messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
    },
  ];
  const planRes = await openaiChat(env.OPENAI_API_KEY, planPrompt);
  let planText = planRes.choices?.[0]?.message?.content?.trim() || '';
  planText = planText.replace(/^```json/, '').replace(/```$/, '');
  let plan;
  try {
    plan = JSON.parse(planText);
  } catch (err) {
    return jsonResponse({ error: 'Failed to parse plan from thread', raw: planText }, 500);
  }
  if (!plan?.mvp?.name || !plan?.mvp?.description || !plan?.mvp?.technology || !Array.isArray(plan.mvp.features) || plan.mvp.features.length === 0) {
    return jsonResponse({ error: 'MVP plan missing required fields', plan }, 500);
  }
  // Decompose plan
  const components = await decomposePlanToComponents(plan, env);
  const allComponentFiles = {};
  for (const component of components) {
    if (component.type === 'backend') {
      const result = await generateComponentWithRetry(component, plan, env);
      if (result?.files) {
        for (const [filename, content] of Object.entries(result.files)) {
          allComponentFiles[filename] = content;
        }
      }
    }
  }
  // Router
  const { indexFile } = generateRouterFile(allComponentFiles);
  allComponentFiles['functions/api/index.ts'] = indexFile;
  // Frontend
  const frontendFiles = await generateFrontendFiles(plan, branding, logoUrl, env);
  // Backend stubs
  const backendStubFiles = generateBackendStubs(plan);
  const siteFiles = { ...frontendFiles, ...backendStubFiles, ...allComponentFiles };
  // Create repo
  const repoName = `${ideaId}-app`;
  const createRepoRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_PAT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: repoName, private: false }),
  });
  if (!createRepoRes.ok) {
    const errMsg = await createRepoRes.text();
    return jsonResponse({ error: 'Failed to create GitHub repo', details: errMsg }, 500);
  }
  // Upload files one by one and bail on first failure
  for (const [path, content] of Object.entries(siteFiles)) {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const uploadRes = await fetch(`https://api.github.com/repos/${env.GITHUB_USERNAME}/${repoName}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: `Add ${path}`, content: encoded, branch: 'main' }),
    });
    if (!uploadRes.ok) {
      const errMsg = await uploadRes.text();
      return jsonResponse({ error: `Failed to upload ${path} to GitHub`, details: errMsg }, 500);
    }
  }
  // Create Cloudflare Pages project
  const projectName = `app-${ideaId}`;
  const createProjectRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      production_branch: 'main',
      source: {
        type: 'github',
        config: {
          owner: env.GITHUB_USERNAME,
          repo_name: repoName,
          production_branch: 'main',
          deployments_enabled: true,
        },
      },
    }),
  });
  if (!createProjectRes.ok) {
    const errMsg = await createProjectRes.text();
    return jsonResponse({ error: 'Failed to create Cloudflare Pages project', details: errMsg }, 500);
  }
  // Trigger deployment
  const formData = new FormData();
  formData.append('branch', 'main');
  const deployRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: formData,
  });
  if (!deployRes.ok) {
    const errMsg = await deployRes.text();
    return jsonResponse({ error: 'Failed to trigger deployment', details: errMsg }, 500);
  }
  // Return final URLs
  return jsonResponse({
    ideaId,
    repoUrl: `https://github.com/${env.GITHUB_USERNAME}/${repoName}`,
    pagesUrl: `https://${projectName}.pages.dev`,
  });
}
