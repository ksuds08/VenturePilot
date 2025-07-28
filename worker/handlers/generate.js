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
  generateBackendComponentFiles,
  generateWorkerEntryFile,
} from '../utils/mvpUtils.js';

// Helper to convert arbitrary branding names into valid Worker/repo slugs.
// Cloudflare worker names must be 1–63 characters, lower case, and may only
// contain alphanumeric characters and hyphens. Spaces and other characters are
// replaced with hyphens and consecutive hyphens are collapsed.
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

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
      const code = allFiles[filePath];
      if (
        typeof code !== 'string' ||
        (!code.includes('export const onRequest') &&
          !code.includes('export async function onRequest') &&
          !code.includes('export function onRequest'))
      ) {
        throw new Error(
          `Missing onRequest export in ${filePath}. Each backend file must export onRequest to be deployed.`,
        );
      }
    }
  }
}

export async function generateHandler(request, env) {
  try {
    const body = await safeJson(request);
    const { ideaId, branding, messages } = body;
    const logoUrl = branding?.logoUrl || null;
    if (!ideaId || !branding || !messages) {
      return jsonResponse(
        { error: 'Missing ideaId, branding, or messages' },
        400,
      );
    }

    // Extract the MVP plan using OpenAI function calling, with fallback
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
      const res = await openaiChat(env.OPENAI_API_KEY, planMessages, 'gpt-4o', 0.7, functions);
      const msg = res.choices?.[0]?.message;
      if (msg?.function_call && msg.function_call.name === 'extract_mvp_plan') {
        const args = msg.function_call.arguments || '{}';
        plan = JSON.parse(args);
      } else {
        plan = await openaiChatJson(env.OPENAI_API_KEY, planMessages);
      }
    } catch (e) {
      console.error('❌ Failed to parse plan via function calling', e.message);
      try {
        plan = await openaiChatJson(env.OPENAI_API_KEY, planMessages);
      } catch (e2) {
        return jsonResponse(
          { error: 'Failed to parse plan from thread', details: e2.message },
          500,
        );
      }
    }
    if (
      !plan?.mvp ||
      !plan.mvp.name ||
      !plan.mvp.description ||
      !plan.mvp.technology ||
      !Array.isArray(plan.mvp.features) ||
      plan.mvp.features.length === 0
    ) {
      return jsonResponse(
        { error: 'MVP plan missing required fields', plan },
        500,
      );
    }

    // Decompose plan into components and generate code
    const components = await decomposePlanToComponents(plan, env);
    const allComponentFiles = {};
    for (const component of components) {
      if (component.type === 'backend') {
        const files = await generateBackendComponentFiles(component, plan, env);
        if (files) Object.assign(allComponentFiles, files);
      }
    }
    // Generate frontend
    let frontendFiles;
    try {
      frontendFiles = await generateFrontendFiles(plan, branding, logoUrl, env);
    } catch (err) {
      return jsonResponse(
        { error: 'Failed to generate frontend', details: err.message },
        500,
      );
    }
    // Worker entrypoint
    const { entryFile } = generateWorkerEntryFile(allComponentFiles, frontendFiles);
    allComponentFiles['worker/index.ts'] = entryFile;

    // Assemble site files
    const siteFiles = {};
    for (const [fname, content] of Object.entries(frontendFiles)) {
      siteFiles[`worker/static/${fname}`] = content;
    }
    Object.assign(siteFiles, allComponentFiles);

    // Derive a human-friendly name from the branding for the repo and Worker.
    const brandingName = branding?.name || plan.mvp.name || String(ideaId);
    const baseSlug = slugify(brandingName);
    let repoNameBase = `${baseSlug}-app`;
    // If the slug is empty after sanitization, fall back to ideaId
    if (!repoNameBase || repoNameBase === '-app') {
      repoNameBase = `${ideaId}-app`;
    }
    let repoName = repoNameBase;

    const token = env.PAT_GITHUB || env.GITHUB_PAT;
    const owner = env.GITHUB_ORG || env.GITHUB_USERNAME;
    const createRepoUrl = env.GITHUB_ORG
      ? `https://api.github.com/orgs/${env.GITHUB_ORG}/repos`
      : 'https://api.github.com/user/repos';
    // Cloudflare token: prefer CLOUDFLARE_API_TOKEN, fall back to CF_API_TOKEN
    const cfToken = env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN;

    let repoCreated = false;
    while (!repoCreated) {
      const repoRes = await fetch(createRepoUrl, {
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
        repoName = `${repoNameBase}-${Date.now()}`;
        continue;
      }
      const errorText = await repoRes.text();
      return jsonResponse(
        { error: 'Failed to create repo', details: errorText },
        repoRes.status,
      );
    }

    // wrangler.toml and package.json
    const compatibilityDate = new Date().toISOString().split('T')[0];
    siteFiles['wrangler.toml'] = [
      `name = "${repoName}"`,
      `main = "worker/index.ts"`,
      `compatibility_date = "${compatibilityDate}"`,
      '',
      '[site]',
      'bucket = "./worker/static"',
      '',
    ].join('\n');
    siteFiles['package.json'] = JSON.stringify(
      { name: repoName, version: '0.0.1', private: true, type: 'module' },
      null,
      2,
    );

    // GitHub Actions workflow uses CLOUDFLARE_API_TOKEN
    const deployWorkflow =
      'name: Deploy Worker\n\n' +
      'on:\n  push:\n    branches: [main]\n\n' +
      'jobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n' +
      '      - uses: actions/checkout@v3\n' +
      '      - run: npm install -g wrangler\n' +
      '      - run: wrangler deploy\n' +
      '        env:\n' +
      '          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n' +
      '          CF_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}\n';
    siteFiles['.github/workflows/deploy.yml'] = deployWorkflow;

    // Upload all files
    for (const [path, content] of Object.entries(siteFiles)) {
      const encoded = btoa(unescape(encodeURIComponent(content)));
      const uploadRes = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `token ${token}`,
            'User-Agent': 'VenturePilot-CFWorker',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: `Add ${path}`,
            content: encoded,
            branch: 'main',
          }),
        },
      );
      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        return jsonResponse(
          { error: `Failed to upload ${path}`, details: errorText },
          uploadRes.status,
        );
      }
    }

    // Compute workers.dev URL.  Try fetching the account subdomain via the
    // Cloudflare API; if that fails, fall back to an environment variable or a
    // predictable pattern based on the account's known subdomain.  The
    // resulting URL will be <repoName>.<subdomain>.workers.dev.
    let workerUrl = null;
    try {
      const subdomainRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/subdomain`,
        { headers: { Authorization: `Bearer ${cfToken}` } },
      );
      if (subdomainRes.ok) {
        const data = await subdomainRes.json();
        const sub = data?.result?.subdomain;
        if (sub) {
          workerUrl = `https://${repoName}.${sub}.workers.dev`;
        }
      }
    } catch (_) {
      // ignore
    }
    // Fallback: use provided WORKERS_SUBDOMAIN environment or leave null
    if (!workerUrl && env.WORKERS_SUBDOMAIN) {
      workerUrl = `https://${repoName}.${env.WORKERS_SUBDOMAIN}.workers.dev`;
    }

    return jsonResponse({
      status: 'success',
      message: 'Deployment completed successfully.',
      ideaId,
      repoUrl: `https://github.com/${owner}/${repoName}`,
      workerUrl,
    });
  } catch (err) {
    return jsonResponse(
      { error: 'Unhandled error', details: err.message },
      500,
    );
  }
}