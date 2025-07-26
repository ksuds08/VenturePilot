import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';
import {
  decomposePlanToComponents,
  generateComponentWithRetry,
  generateRouterFile,
  generateFrontendFiles
} from '../utils/mvpUtils.js';

/**
 * Generate basic stub handlers for any backend endpoints defined in the plan.
 * Each stub returns a simple JSON response indicating the endpoint is not yet implemented.
 *
 * @param {Object} plan – the parsed MVP plan with an optional backendEndpoints array
 * @returns {Object} – map of file paths to TypeScript code strings
 */
function generateBackendStubs(plan) {
  const stubs = {};
  const endpoints = Array.isArray(plan?.backendEndpoints) ? plan.backendEndpoints : [];
  for (const ep of endpoints) {
    // Create a safe filename from the path (e.g. "/users" -> "users")
    const name = (ep.path || '/').replace(/^\//, '').replace(/[^A-Za-z0-9]/g, '') || 'index';
    const fileName = `functions/api/${name}.ts`;
    const handlerName = `${name}Handler`;
    const description = ep.description || 'Not implemented';
    stubs[fileName] = `export async function ${handlerName}(req: Request): Promise<Response> {
  return new Response(JSON.stringify({ message: "${description}" }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}`;
  }
  return stubs;
}

/**
 * Handler for the `/mvp` endpoint. This function orchestrates the
 * generation of an MVP site based on the chat history and branding
 * information provided by the frontend. It wraps all logic in a
 * top‑level try/catch so that unexpected exceptions always surface
 * useful error messages instead of resulting in opaque 500 errors.
 *
 * The handler performs the following steps:
 * 1. Validate the request body contains `ideaId`, `branding` and `messages`.
 * 2. Ask OpenAI to extract a structured MVP plan from the chat history.
 *    We instruct the model to return JSON only (no code fences or commentary).
 *    The response is cleaned of backticks and sliced from the first `{` to
 *    the last `}`.  If parsing fails or required fields are missing, one
 *    retry is attempted.  Additional logging is added to surface the plan
 *    content when parsing fails or mandatory keys are missing.
 * 3. Decompose the plan into backend components and generate code for each.
 * 4. Generate frontend files using the supplied branding and plan.
 * 5. Combine the generated backend and frontend files and upload them to
 *    a new GitHub repository.  Each call to the GitHub API is checked
 *    for success.
 * 6. Provision a Cloudflare Pages project and trigger a deployment.
 * 7. Return the ideaId, repository URL and Pages URL upon success.
 *
 * @param {Request} request The incoming HTTP request.
 * @param {Record<string, any>} env The Worker environment bindings.
 */
export async function mvpHandler(request, env) {
  try {
    // Parse and validate the request body
    const body = await safeJson(request);
    const { ideaId, branding, messages } = body;
    const logoUrl = branding?.logoUrl || null;
    if (!ideaId || !branding || !messages) {
      return jsonResponse({ error: 'Missing ideaId, branding, or messages' }, 400);
    }

    // Compose a plan extraction prompt.  We instruct the model to
    // return pure JSON and include all required fields.  If the model
    // embeds code fences or commentary, we'll strip them out before parsing.
    const planPrompt = [
      {
        role: 'system',
        content: `You are a startup cofounder assistant AI. From the following chat history, extract a complete MVP plan.
Return JSON only—no markdown, no code fences, no commentary.
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

    // Helper to clean and parse the plan response.  It strips backticks,
    // extracts the JSON portion, and attempts to parse.  If parsing
    // fails, the error will be caught in the calling context.
    const parsePlan = (raw) => {
      let text = raw.trim();
      // Remove any code fences (```json ...```) that might wrap the JSON
      text = text.replace(/```.*?\n|```/gs, '');
      // Extract from first '{' to last '}'
      const a = text.indexOf('{');
      const b = text.lastIndexOf('}');
      if (a !== -1 && b !== -1 && b > a) {
        text = text.slice(a, b + 1);
      }
      return JSON.parse(text);
    };

    // Attempt to fetch and parse the plan, with one retry on failure
    let plan;
    let attempt = 0;
    while (attempt < 2) {
      const planRes = await openaiChat(env.OPENAI_API_KEY, planPrompt);
      const planTextRaw = planRes.choices?.[0]?.message?.content?.trim();
      // Ensure we actually received some content back
      if (!planTextRaw) {
        console.error('❌ No plan content returned by OpenAI', planRes);
        return jsonResponse({ error: 'OpenAI did not return a plan.' }, 500);
      }
      try {
        plan = parsePlan(planTextRaw);
        // Validate required fields
        if (
          plan?.mvp?.name &&
          plan?.mvp?.description &&
          plan?.mvp?.technology &&
          Array.isArray(plan.mvp.features) &&
          plan.mvp.features.length > 0
        ) {
          break;
        }
        // If mandatory fields are missing, log and throw to trigger retry/return
        console.error('❌ Parsed plan is missing required fields', plan);
        throw new Error('Incomplete plan');
      } catch (err) {
        attempt++;
        if (attempt >= 2) {
          console.error('❌ Failed to parse plan JSON', planTextRaw);
          return jsonResponse(
            { error: 'Failed to parse plan from thread', raw: planTextRaw },
            500,
          );
        }
        // retry by continuing the loop
      }
    }

    // At this point, we should have a valid plan. If not, return error.
    if (!plan?.mvp) {
      console.error('❌ MVP plan missing required fields after parsing', plan);
      return jsonResponse({ error: 'MVP plan missing required fields', plan }, 500);
    }

    // Decompose plan into components
    const components = await decomposePlanToComponents(plan, env);
    const allComponentFiles = {};
    // Generate backend component files (no subfiles to reduce subrequests)
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
    // Add router file for backend
    const { indexFile } = generateRouterFile(allComponentFiles);
    allComponentFiles['functions/api/index.ts'] = indexFile;

    // Generate frontend
    let frontendFiles;
    try {
      frontendFiles = await generateFrontendFiles(plan, branding, logoUrl, env);
    } catch (err) {
      console.error('❌ Failed to generate frontend', err);
      return jsonResponse({ error: 'Failed to generate frontend', details: err.message }, 500);
    }
    // Generate backend stubs
    const backendStubs = generateBackendStubs(plan);
    // Combine all site files
    const siteFiles = { ...frontendFiles, ...backendStubs, ...allComponentFiles };

    // Prepare repository name
    const baseRepoName = `${ideaId}-app`;
    const token = env.GITHUB_PAT;

    // Attempt to create the repository.  If a repository with the same name
    // already exists (GitHub returns 422), append a timestamp suffix and retry
    let finalRepoName = baseRepoName;
    let repoRes = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'VenturePilot-CFWorker',
      },
      body: JSON.stringify({ name: finalRepoName, private: false }),
    });
    if (!repoRes.ok) {
      const errorText = await repoRes.text();
      // If the repo already exists, retry once with a unique name
      if (repoRes.status === 422 && /name already exists/i.test(errorText)) {
        finalRepoName = `${baseRepoName}-${Date.now()}`;
        repoRes = await fetch('https://api.github.com/user/repos', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VenturePilot-CFWorker',
          },
          body: JSON.stringify({ name: finalRepoName, private: false }),
        });
        if (!repoRes.ok) {
          const retryText = await repoRes.text();
          console.error('❌ Failed to create repo on second attempt', retryText);
          return jsonResponse(
            { error: 'Failed to create repo after retry', details: retryText },
            repoRes.status,
          );
        }
      } else {
        console.error('❌ Failed to create repo', errorText);
        return jsonResponse(
          { error: 'Failed to create repo', details: errorText },
          repoRes.status,
        );
      }
    }

    // Upload each file
    for (const [path, content] of Object.entries(siteFiles)) {
      const encoded = btoa(unescape(encodeURIComponent(content)));
      const uploadRes = await fetch(
        `https://api.github.com/repos/${env.GITHUB_USERNAME}/${finalRepoName}/contents/${path}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VenturePilot-CFWorker',
          },
          body: JSON.stringify({ message: `Add ${path}`, content: encoded, branch: 'main' }),
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

    // Create a Pages project
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
              owner: env.GITHUB_USERNAME,
              repo_name: finalRepoName,
              production_branch: 'main',
              deployments_enabled: true,
            },
          },
        }),
      },
    );
    if (!cfProjectRes.ok) {
      const errorText = await cfProjectRes.text();
      console.error('❌ Failed to create Pages project', errorText);
      return jsonResponse(
        { error: 'Failed to create Pages project', details: errorText },
        cfProjectRes.status,
      );
    }

    // Trigger a deployment
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
      return jsonResponse(
        { error: 'Failed to trigger deployment', details: errorText },
        deployRes.status,
      );
    }

    // Return success
    return jsonResponse({
      ideaId,
      repoUrl: `https://github.com/${env.GITHUB_USERNAME}/${finalRepoName}`,
      pagesUrl: `https://${projectName}.pages.dev`,
    });
  } catch (err) {
    // Catch any unexpected errors that weren't handled above
    console.error('❌ Unhandled error in mvpHandler', err);
    return jsonResponse({ error: 'Unhandled error', details: err.message }, 500);
  }
}