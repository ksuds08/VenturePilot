// SPDX-License-Identifier: MIT
// Handler for the `/mvp` endpoint.  This handler takes an idea
// identifier, a branding kit and a list of chat messages representing
// the product discussion, and synthesises a minimum viable product
// (MVP) specification.  It then scaffolds a basic frontend using
// Tailwind CSS, stubs out backend API handlers based on the plan's
// backend endpoints, generates a router file for Cloudflare Pages
// Functions and pushes all files into a new GitHub repository.  Finally
// it provisions a Cloudflare Pages project backed by that repository
// and triggers a deployment.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';
import {
  decomposePlanToComponents,
  generateComponentWithRetry,
  generateFrontendFiles,
  // generateComponentSubFiles, // removed to reduce subrequests
  generateRouterFile,
} from '../utils/mvpUtils.js';

/**
 * Helper to generate stub backend files for each API endpoint described
 * in the MVP plan.  Because the original Cloudflare Worker code
 * referenced a `generateBackend` function that was not defined, this
 * implementation creates a simple handler for each endpoint that
 * returns a JSON payload stating that the endpoint is not yet
 * implemented.  The file names are derived from the endpoint path by
 * removing leading slashes and replacing additional slashes with
 * hyphens.  All handlers are placed under `functions/api`.
 *
 * @param {Object} plan â the parsed MVP plan containing a `backendEndpoints` array
 * @returns {Object} â map of filenames to file contents
 */
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
  // Step 1: synthesise the MVP plan from the chat history
  const planPrompt = [
    {
      role: 'system',
      content:
        `You are a startup cofounder assistant AI. From the following chat history, extract:\n\n` +
        `1. A complete and structured MVP plan\n` +
        `2. A list of backend API endpoints required to implement the MVP\n\n` +
        `Guidelines:\n` +
        `- Be concise and specific\n` +
        `- Avoid vague names like "MyApp" or "CoolTool" â infer a meaningful product name if not given\n` +
        `- Infer technology stack (e.g., React, TypeScript, Cloudflare Workers) if not stated\n` +
        `- backendEndpoints should cover all dynamic functionality the MVP requires\n\n` +
        `Output valid JSON ONLY in this exact structure:\n\n` +
        `{\n` +
        `  "mvp": {\n` +
        `    "name": string,\n` +
        `    "description": string,\n` +
        `    "features": [{ "feature": string, "description": string }],\n` +
        `    "technology": string,\n` +
        `    "targetAudience": string,\n` +
        `    "businessModel": string,\n` +
        `    "launchPlan": string,\n` +
        `    "visualStyle": string,\n` +
        `    "userFlow": string,\n` +
        `    "dataFlow": string,\n` +
        `    "keyComponents": [string],\n` +
        `    "exampleInteractions": [string]\n` +
        `  },\n` +
        `  "backendEndpoints": [\n` +
        `    { "path": string, "method": string, "description": string }\n` +
        `  ]\n` +
        `}\n\n` +
        `DO NOT include markdown. Output only pure JSON.`,
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
    console.error('â Could not parse MVP from planText:', planText);
    return jsonResponse({ error: 'Failed to parse plan from thread', raw: planText }, 500);
  }
  if (!plan?.mvp?.name || !plan?.mvp?.description || !plan?.mvp?.technology || !Array.isArray(plan.mvp.features) || plan.mvp.features.length === 0) {
    console.error('â Invalid MVP plan structure:', plan);
    return jsonResponse({ error: 'MVP plan missing required fields', plan }, 500);
  }
  // Step 2: decompose the plan into components
  const components = await decomposePlanToComponents(plan, env);
  const allComponentFiles = {};
  // Step 3: generate backend component files using the helper
  for (const component of components) {
    if (component.type === 'backend') {
      const result = await generateComponentWithRetry(component, plan, env);
      if (result?.files) {
        for (const [filename, content] of Object.entries(result.files)) {
          allComponentFiles[filename] = content;
        }
      }
      // Skipping generateComponentSubFiles to reduce subrequests per request
    }
  }
  // Step 4: generate router index.ts for the backend components
  const { indexFile } = generateRouterFile(allComponentFiles);
  allComponentFiles['functions/api/index.ts'] = indexFile;
  // Step 5: generate frontend files
  const frontendFiles = await generateFrontendFiles(plan, branding, logoUrl, env);
  // Step 6: generate backend stubs for endpoints
  const backendStubFiles = generateBackendStubs(plan);
  const siteFiles = { ...frontendFiles, ...backendStubFiles, ...allComponentFiles };
  // Step 7: create a new GitHub repository
  const repoName = `${ideaId}-app`;
  const token = env.GITHUB_PAT;
  await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: repoName, private: false }),
  });
  // Step 8: push files to the repository
  for (const [path, content] of Object.entries(siteFiles)) {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    await fetch(`https://api.github.com/repos/${env.GITHUB_USERNAME}/${repoName}/contents/${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: `Add ${path}`, content: encoded, branch: 'main' }),
    });
  }
  // Step 9: create the Cloudflare Pages project
  const projectName = `app-${ideaId}`;
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`, {
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
  // Step 10: trigger deployment
  const formData = new FormData();
  formData.append('branch', 'main');
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: formData,
  });
  return jsonResponse({
    ideaId,
    repoUrl: `https://github.com/${env.GITHUB_USERNAME}/${repoName}`,
    pagesUrl: `https://${projectName}.pages.dev`,
  });
}
