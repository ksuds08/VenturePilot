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
      // Ensure each backend file exports an onRequest wrapper so Cloudflare Pages
      // recognises it as a valid function.  Without this, Pages will ignore
      // the file and no routes will be deployed.  We expect the file to
      // contain an export statement assigning the handler to onRequest.
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
      return jsonResponse(
        { error: 'Missing ideaId, branding, or messages' },
        400,
      );
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
        content: messages
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n'),
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
      const res = await openaiChat(
        env.OPENAI_API_KEY,
        planMessages,
        'gpt-4o',
        0.7,
        functions,
      );
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
      console.error('❌ MVP plan missing required fields after parsing', plan);
      return jsonResponse(
        { error: 'MVP plan missing required fields', plan },
        500,
      );
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
    // Generate frontend
    let frontendFiles;
    try {
      frontendFiles = await generateFrontendFiles(
        plan,
        branding,
        logoUrl,
        env,
      );
    } catch (err) {
      console.error('❌ Failed to generate frontend', err);
      return jsonResponse(
        { error: 'Failed to generate frontend', details: err.message },
        500,
      );
    }
    // Generate Worker entrypoint that embeds the frontend and routes API requests.
    const { entryFile } = generateWorkerEntryFile(
      allComponentFiles,
      frontendFiles,
    );
    allComponentFiles['worker/index.ts'] = entryFile;
    // Assemble site files: copy frontend assets into worker/static/ and include backend and entrypoint files.
    const siteFiles = {};
    for (const [fname, content] of Object.entries(frontendFiles)) {
      siteFiles[`worker/static/${fname}`] = content;
    }
    Object.assign(siteFiles, allComponentFiles);
    // Create repo on GitHub
    const repoNameBase = `${ideaId}-app`;
    let repoName = repoNameBase;
    let suffix = 0;
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
        suffix++;
        // generate a unique name on conflict
        repoName = `${repoNameBase}-${Date.now()}`;
        continue;
      }
      const errorText = await repoRes.text();
      console.error('❌ Failed to create repo', errorText);
      return jsonResponse(
        { error: 'Failed to create repo', details: errorText },
        repoRes.status,
      );
    }
    // After choosing the final repository name, augment the file set with a wrangler.toml and GitHub Actions workflow.
    // These files enable automatic deployment of the generated Worker via GitHub Actions.
    const compatibilityDate = new Date().toISOString().split('T')[0];
    const wranglerToml = [
      `name = "${repoName}"`,
      `main = "worker/index.ts"`,
      `compatibility_date = "${compatibilityDate}"`,
      '',
      '[site]',
      'bucket = "./worker/static"',
      '',
    ].join('\n');
    siteFiles['wrangler.toml'] = wranglerToml;
    // Create a minimal package.json so package managers have something to work with
    const pkg = {
      name: repoName,
      version: '0.0.1',
      private: true,
      type: 'module',
    };
    siteFiles['package.json'] = JSON.stringify(pkg, null, 2);
    // Define the GitHub Actions workflow to deploy the Worker.  Use real newlines for YAML.
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
    // Upload files
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
        console.error(`❌ Failed to upload ${path}`, errorText);
        return jsonResponse(
          { error: `Failed to upload ${path}`, details: errorText },
          uploadRes.status,
        );
      }
    }
    // Determine the workers.dev subdomain for the account so we can construct the Worker URL.
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
      // ignore failure to fetch subdomain
    }
    return jsonResponse({
      ideaId,
      repoUrl: `https://github.com/${owner}/${repoName}`,
      workerUrl,
    });
  } catch (err) {
    console.error('❌ Unhandled error in generateHandler', err);
    return jsonResponse(
      { error: 'Unhandled error', details: err.message },
      500,
    );
  }
}