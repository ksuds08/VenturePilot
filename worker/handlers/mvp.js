// SPDX-License-Identifier: MIT
//
// Main handler for the `/mvp` endpoint.  This module orchestrates the
// generation of MVP code by invoking the planning, decomposition and
// component generation helpers found in `utils/`.  It performs input
// validation, error handling, GitHub repo creation, Cloudflare Pages
// deployment and returns URLs on success.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';
import { openaiChatJson } from '../utils/openaiJson.js';
import {
  generateComponentWithRetry,
  generateFrontendFiles,
  generateComponentSubFiles,
  decomposePlanToComponents,
  generateRouterFile,
  generateBackendComponentFiles,
} from '../utils/mvpUtils.js';

/**
 * Handler for the `/mvp` endpoint.  It receives the idea specification and
 * branding from the client, extracts a plan via OpenAI, decomposes the plan
 * into components, generates frontend and backend code, creates a GitHub
 * repository, and triggers a Cloudflare Pages deployment.
 *
 * @param {Request} request â incoming request
 * @param {Object} env â environment variables (API keys and tokens)
 * @returns {Promise<Response>} â JSON response with repoUrl and pagesUrl
 */
export async function mvpHandler(request, env) {
  try {
    const body = await safeJson(request);
    const { ideaId, branding, messages } = body;
    const logoUrl = branding?.logoUrl || null;
    if (!ideaId || !branding || !messages) {
      return jsonResponse({ error: 'Missing ideaId, branding, or messages' }, 400);
    }
    // Compose a prompt to extract the MVP plan from chat history
    const planPrompt = [
      {
        role: 'system',
        content: `You are a startup cofounder assistant AI. From the following chat history, extract a complete MVP plan.
Return JSON onlyâno markdown, no code fences, no commentary.
The "features" array must contain at least one object with "feature" and "description" keys.
If a field isn't obvious, infer a reasonable value.
Format:
{
  "mvp": {
    "name": string,
    "description": string,
    "features": [{ "feature": string, "description": string }],
    "technology": string,
    "targetAudience": string,
    "businessModel": string,
    "launchPlan": string,
    "visualStyle": string,
    "userFlow": string,
    "dataFlow": string,
    "keyComponents": [string],
    "exampleInteractions": [string]
  },
  "backendEndpoints": [
    { "path": string, "method": string, "description": string }
  ]
}`.trim(),
      },
      {
        role: 'user',
        content: messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
      },
    ];
    // Extract the plan using our JSON wrapper.  This helper ensures any
    // malformed JSON returned by the model is repaired or parsed via a
    // fallback.  If parsing fails, it will throw, which triggers the
    // catch block.
    let plan;
    try {
      plan = await openaiChatJson(env.OPENAI_API_KEY, planPrompt);
    } catch (e) {
      console.error('â Failed to parse plan JSON', e.message);
      return jsonResponse({ error: 'Failed to parse plan from thread', details: e.message }, 500);
    }
    if (!plan?.mvp ||
        !plan.mvp.name ||
        !plan.mvp.description ||
        !plan.mvp.technology ||
        !Array.isArray(plan.mvp.features) ||
        plan.mvp.features.length === 0) {
      console.error('â MVP plan missing required fields after parsing', plan);
      return jsonResponse({ error: 'MVP plan missing required fields', plan }, 500);
    }
    // Decompose plan into components
    const components = await decomposePlanToComponents(plan, env);
    const allComponentFiles = {};
    // Generate backend components using single-call generator to reduce subrequests
    for (const component of components) {
      if (component.type === 'backend') {
        const files = await generateBackendComponentFiles(component, plan, env);
        if (files) {
          Object.assign(allComponentFiles, files);
        }
      }
    }
    // Generate router file
    const { indexFile } = generateRouterFile(allComponentFiles);
    allComponentFiles['functions/api/index.ts'] = indexFile;
    // Generate frontend
    let frontendFiles;
    try {
      frontendFiles = await generateFrontendFiles(plan, branding, logoUrl, env);
    } catch (err) {
      console.error('â Failed to generate frontend', err);
      return jsonResponse({ error: 'Failed to generate frontend', details: err.message }, 500);
    }
    // Combine frontend and backend files
    const siteFiles = { ...frontendFiles, ...allComponentFiles };
    // Create repo on GitHub
    const repoNameBase = `${ideaId}-app`;
    let repoName = repoNameBase;
    let suffix = 0;
    const token = env.PAT_GITHUB || env.GITHUB_PAT;
    const ghUser = env.GITHUB_USERNAME;
    let repoCreated = false;
    while (!repoCreated) {
      const repoRes = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'VenturePilot-CFWorker',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: repoName, private: false }),
      });
      if (repoRes.ok) {
        repoCreated = true;
        break;
      }
      if (repoRes.status === 422) {
        suffix++;
        repoName = `${repoNameBase}-${Date.now()}`;
        continue;
      }
      const errorText = await repoRes.text();
      console.error('â Failed to create repo', errorText);
      return jsonResponse(
        { error: 'Failed to create repo', details: errorText },
        repoRes.status,
      );
    }
    // Upload files
    for (const [path, content] of Object.entries(siteFiles)) {
      const encoded = btoa(unescape(encodeURIComponent(content)));
      const uploadRes = await fetch(
        `https://api.github.com/repos/${ghUser}/${repoName}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            'User-Agent': 'VenturePilot-CFWorker',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: `Add ${path}`, content: encoded, branch: 'main' }),
        },
      );
      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error(`â Failed to upload ${path}`, errorText);
        return jsonResponse(
          { error: `Failed to upload ${path}`, details: errorText },
          uploadRes.status,
        );
      }
    }
    // Create Cloudflare Pages project
    const projectName = `app-${ideaId}`;
    const cfProjectRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`,
      {
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
              owner: ghUser,
              repo_name: repoName,
              production_branch: 'main',
              deployments_enabled: true,
            },
          },
        }),
      },
    );
    if (!cfProjectRes.ok) {
      const errorText = await cfProjectRes.text();
      console.error('â Failed to create Pages project', errorText);
      return jsonResponse(
        { error: 'Failed to create Pages project', details: errorText },
        cfProjectRes.status,
      );
    }
    // Trigger deployment
    const formData = new FormData();
    formData.append('branch', 'main');
    const deployRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects/${projectName}/deployments`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.CF_API_TOKEN}` },
        body: formData,
      },
    );
    if (!deployRes.ok) {
      const errorText = await deployRes.text();
      console.error('â Failed to trigger deployment', errorText);
      return jsonResponse(
        { error: 'Failed to trigger deployment', details: errorText },
        deployRes.status,
      );
    }
    return jsonResponse({
      ideaId,
      repoUrl: `https://github.com/${ghUser}/${repoName}`,
      pagesUrl: `https://${projectName}.pages.dev`,
    });
  } catch (err) {
    console.error('â Unhandled error in mvpHandler', err);
    return jsonResponse({ error: 'Unhandled error', details: err.message }, 500);
  }
}
