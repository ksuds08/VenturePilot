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
  generateComponentSubFiles,
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
 * @param {Object} plan – the parsed MVP plan containing a `backendEndpoints` array
 * @returns {Object} – map of filenames to file contents
 */
function generateBackendStubs(plan) {
  const files = {};
  const endpoints = Array.isArray(plan.backendEndpoints) ? plan.backendEndpoints : [];
  for (const ep of endpoints) {
    if (!ep?.path) continue;
    // Derive a safe filename from the path: remove leading slashes and replace
    // remaining slashes with hyphens.  E.g. `/api/user/login` → `api-user-login`.
    const safeName = ep.path.replace(/^\/+/,'').replace(/\//g,'-').replace(/[^A-Za-z0-9_-]/g,'');
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
      content: `You are a startup cofounder assistant AI. From the following chat history, extract:\n\n` +
        `1. A complete and structured MVP plan\n` +
        `2. A list of backend API endpoints required to implement the MVP\n\n` +
        `Guidelines:\n` +
        `- Be concise and specific\n` +
        `- Avoid vague names like "MyApp" or "CoolTool" — infer a meaningful product name if not given\n` +
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
  planText = planText.replace(/^```json/,'').replace(/```$/,'');
  let plan;
  try {
    plan = JSON.parse(planText);
  } catch (err) {
    console.error('❌ Could not parse MVP from planText:', planText);
    return jsonResponse({ error: 'Failed to parse plan from thread', raw: planText }, 500);
  }
  // Sanity check the plan
  if (!plan?.mvp?.name || !plan?.mvp?.description || !plan?.mvp?.technology || !Array.isArray(plan.mvp.features) || plan.mvp.features.length === 0) {
    console.error('❌ Invalid MVP plan structure:', plan);
    return jsonResponse({ error: 'MVP plan missing required fields', plan }, 500);
  }
  // Step 2: decompose plan into components.  Backend components will be
  // generated individually; frontend generation happens separately.
  const components = await decomposePlanToComponents(plan, env);
  const allComponentFiles = {};
  // Generate backend component files using the helper; frontend components
  // are not individually generated as the full frontend is scaffolded
  // later by generateFrontendFiles.
  for (const component of components) {
    if (component.type === 'backend') {
      const result = await generateComponentWithRetry(component, plan, env);
      if (result?.files) {
        for (const [filename, content] of Object.entries(result.files)) {
          allComponentFiles[filename] = content;
        }
      }
    }
    // For backend components that require sub‑files, generate them via
    // generateComponentSubFiles (optional).  This ensures that any
    // additional helper files are included.
    if (component.type === 'backend') {
      const subFiles = await generateComponentSubFiles(component, plan, env);
      for (const [filename, content] of Object.entries(subFiles)) {
        allComponentFiles[filename] = content;
      }
    }
  }
  // Step 3: generate router index.ts for the backend components
  const { indexFile } = generateRouterFile(allComponentFiles);
  allComponentFiles['functions/api/index.ts'] = indexFile;
  // Step 4: generate frontend files using branding and logo
  const frontendFiles = await generateFrontendFiles(plan, branding, logoUrl, env);
  // Step 5: generate backend stubs for plan.backendEndpoints
  const backendStubFiles = generateBackendStubs(plan);
  // Assemble all files into a single object
  const siteFiles = { ...frontendFiles, ...backendStubFiles, ...allComponentFiles };
  // Step 6: create a new GitHub repository for this MVP
  const repoName = `${ideaId}-app`;
  const token = env.GITHUB_PAT;
  // Create repository
  await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: repoName, private: false }),
  });
  // Step 7: push files to the new repository
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
  // Step 8: create a Cloudflare Pages project backing the repository
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
  // Step 9: trigger a deployment of the pages project
  const formData = new FormData();
  formData.append('branch', 'main');
  await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
    body: formData,
  });
  // Return the repository and pages URLs
  return jsonResponse({
    ideaId,
    repoUrl: `https://github.com/${env.GITHUB_USERNAME}/${repoName}`,
    pagesUrl: `https://${projectName}.pages.dev`,
  });
}
