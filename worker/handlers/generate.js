// SPDX-License-Identifier: MIT
// Patched generate handler for VenturePilot
// NOTE: This file includes verification logic to ensure that all backend
// components are generated and registered before deployment.

import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';
import { openaiChatJson } from '../utils/openaiJson.js';
import { planSchema } from '../utils/schemas.js';
import {
  generateComponentWithRetry,
  generateFrontendFiles,
  generateComponentSubFiles,
  decomposePlanToComponents,
  generateRouterFile,
  generateBackendComponentFiles,
} from '../utils/mvpUtils.js';

/**
 * Verify that every backend component has a corresponding file in the generated files
 * and that the router index file wires up each handler.  Throws an error if any
 * component is missing or not registered.
 *
 * @param {Array} components – list of components returned by decomposePlanToComponents
 * @param {Object} allFiles – map of filename → file contents
 * @param {string} indexTs – contents of the generated index.ts file
 */
function verifyGeneratedBackendFiles(components, allFiles, indexTs) {
  for (const comp of components) {
    if (comp.type === 'backend') {
      const filePath = `functions/api/${comp.name}.ts`;
      if (!Object.prototype.hasOwnProperty.call(allFiles, filePath)) {
        throw new Error(`Missing handler file: ${filePath}`);
      }
      const handlerName = `${comp.name}Handler`;
      if (typeof indexTs !== 'string' || !indexTs.includes(handlerName)) {
        throw new Error(`Missing handler registration: ${handlerName}`);
      }
    }
  }
}

/**
 * Handler that performs all steps needed to generate an MVP from a user
 * specification.  It extracts a plan via OpenAI, decomposes it into
 * components, generates backend and frontend code, creates a GitHub repo,
 * provisions a Cloudflare Pages project and triggers a deployment.  On
 * success it returns the ideaId, GitHub repo URL and Pages URL.
 *
 * @param {Request} request – incoming request
 * @param {Object} env – environment variables (API keys and tokens)
 * @returns {Promise<Response>} – JSON response with repoUrl and pagesUrl
 */
export async function generateHandler(request, env) {
  try {
    const body = await safeJson(request);
    const { ideaId, branding, messages } = body;
    const logoUrl = branding?.logoUrl || null;
    if (!ideaId || !branding || !messages) {
      return jsonResponse({ error: 'Missing ideaId, branding, or messages' }, 400);
    }
    /*
     * Compose a prompt to extract the MVP plan from chat history.  We instruct
     * the model to call a function named "extract_mvp_plan" that follows
     * our planSchema.  Using OpenAI's function‑calling mode yields a clean
     * arguments object that we can parse directly without worrying about
     * markdown fences or commentary.  If function calling is not
     * successful, we fall back to the JSON wrapper.
     */
    const planMessages = [
      {
        role: 'system',
        content: [
          'You are a startup cofounder assistant AI. From the following chat history, extract a complete MVP plan.',
          'When possible, call the function extract_mvp_plan with your answer as arguments.',
          "If a field isn't obvious, infer a reasonable value.",
          'Do not include code fences or commentary; return only arguments for the function.',
        ].join('\n'),
      },
      {
        role: 'user',
        content: messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
      },
    ];
    const functions = [
      {
        name: 'extract_mvp_plan',
        description: 'Extract an MVP plan from conversation history',
        parameters: planSchema,
      },
    ];
    let plan;
    try {
      // Attempt to use function calling to extract the plan
      const res = await openaiChat(env.OPENAI_API_KEY, planMessages, 'gpt-4o', 0.7, functions);
      const msg = res.choices?.[0]?.message;
      if (msg?.function_call && msg.function_call.name === 'extract_mvp_plan') {
        const args = msg.function_call.arguments || '{}';
        plan = JSON.parse(args);
      } else {
        // Fall back to our JSON wrapper if no function call is returned
        plan = await openaiChatJson(env.OPENAI_API_KEY, planMessages);
      }
    } catch (e) {
      console.error('❌ Failed to parse plan via function calling', e.message);
      try {
        // Fall back to JSON parsing of the same messages
        plan = await openaiChatJson(env.OPENAI_API_KEY, planMessages);
      } catch (e2) {
        console.error('❌ Failed to parse plan JSON', e2.message);
        return jsonResponse({ error: 'Failed to parse plan from thread', details: e2.message }, 500);
      }
    }
    if (!plan?.mvp || !plan.mvp.name || !plan.mvp.description || !plan.mvp.technology || !Array.isArray(plan.mvp.features) || plan.mvp.features.length === 0) {
      console.error('❌ MVP plan missing required fields after parsing', plan);
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
    // Verify that all backend handlers were generated and registered
    try {
      verifyGeneratedBackendFiles(components, allComponentFiles, indexFile);
    } catch (err) {
      console.error('❌ Verification failed', err.message);
      return jsonResponse({ error: err.message }, 500);
    }
    // Generate frontend
    let frontendFiles;
    try {
      frontendFiles = await generateFrontendFiles(plan, branding, logoUrl, env);
    } catch (err) {
      console.error('❌ Failed to generate frontend', err);
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
      console.error('❌ Failed to create repo', errorText);
      return jsonResponse({ error: 'Failed to create repo', details: errorText }, repoRes.status);
    }
    // Upload files
    for (const [path, content] of Object.entries(siteFiles)) {
      const encoded = btoa(unescape(encodeURIComponent(content)));
      const uploadRes = await fetch(`https://api.github.com/repos/${ghUser}/${repoName}/contents/${path}`, {
        method: 'PUT',
        headers: {
          Authorization: `token ${token}`,
          'User-Agent': 'VenturePilot-CFWorker',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: `Add ${path}`, content: encoded, branch: 'main' }),
      });
      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error(`❌ Failed to upload ${path}`, errorText);
        return jsonResponse({ error: `Failed to upload ${path}`, details: errorText }, uploadRes.status);
      }
    }
    // Create Cloudflare Pages project
    const projectName = `app-${ideaId}`;
    const cfProjectRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/pages/projects`, {
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
    });
    if (!cfProjectRes.ok) {
      const errorText = await cfProjectRes.text();
      console.error('❌ Failed to create Pages project', errorText);
      return jsonResponse({ error: 'Failed to create Pages project', details: errorText }, cfProjectRes.status);
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
      console.error('❌ Failed to trigger deployment', errorText);
      return jsonResponse({ error: 'Failed to trigger deployment', details: errorText }, deployRes.status);
    }
    return jsonResponse({ ideaId, repoUrl: `https://github.com/${ghUser}/${repoName}`, pagesUrl: `https://${projectName}.pages.dev` });
  } catch (err) {
    console.error('❌ Unhandled error in generateHandler', err);
    return jsonResponse({ error: 'Unhandled error', details: err.message }, 500);
  }
}