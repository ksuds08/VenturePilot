import { jsonResponse } from './utils/response.js';
import { safeJson } from './utils/response.js';
import { openaiChat } from './utils/openai.js';
import { decomposePlanToComponents } from './utils/mvpUtils.js';
import { generateComponentWithRetry, generateRouterFile, generateFrontendFiles, generateBackendStubs } from './utils/mvpUtils.js';

/**
 * Handler for the `/mvp` endpoint.  This function orchestrates the
 * generation of an MVP site based on the chat history and branding
 * information provided by the frontend.  It performs the following
 * steps:
 *
 * 1. Validate the request body contains `ideaId`, `branding` and
 *    `messages`.
 * 2. Ask OpenAI to extract a structured MVP plan from the chat
 *    history.  The prompt explicitly instructs the model to return
 *    JSON without markdown fences or commentary.  The code then
 *    strips any remaining backtick fences and slices out the JSON
 *    from the first `{` to the last `}` before attempting to parse.
 *    If parsing fails or the required fields are missing, the
 *    request is retried once.  If it still fails, an error is
 *    returned to the client.
 * 3. Decompose the plan into backend components and generate code
 *    for each using `generateComponentWithRetry`.  The optional
 *    `generateComponentSubFiles` call has been removed to stay
 *    within Cloudflare's 50âsubrequest limit.  Basic backend stubs
 *    are generated for any additional endpoints.
 * 4. Combine the generated backend and frontend files and upload
 *    them to a new GitHub repository.  Each call to the GitHub API
 *    is checked for success; if any call fails the error details
 *    are returned to the client.
 * 5. Provision a Cloudflare Pages project and trigger a deployment
 *    using the generated repository.  The responses from Cloudflare
 *    are also checked for success.
 * 6. Return the ideaId, repository URL and Pages URL upon success.
 *
 * @param {Request} request The incoming HTTP request.
 * @param {Record<string, any>} env The Worker environment bindings.
 */
export async function mvpHandler(request, env) {
  // Parse and validate the request body
  const body = await safeJson(request);
  const { ideaId, branding, messages } = body;
  const logoUrl = branding?.logoUrl || null;
  if (!ideaId || !branding || !messages) {
    return jsonResponse({ error: 'Missing ideaId, branding, or messages' }, 400);
  }

  // Compose a plan extraction prompt.  We instruct the model to
  // return pure JSON and include all required fields.  If the model
  // embeds code fences or commentary, we'll strip them out before
  // parsing.
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

  // Helper to clean and parse the plan response.  It strips
  // backticks, extracts the JSON portion, and attempts to parse.
  const parsePlan = (raw) => {
    let text = raw.trim();
    // Remove any code fences (```json ...```) that might wrap the JSON
    text = text.replace(/```.*?\n|```/g, '');
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
    let planText = planRes.choices?.[0]?.message?.content || '';
    try {
      plan = parsePlan(planText);
      // Validate required fields
      if (
        plan?.mvp?.name &&
        plan?.mvp?.technology &&
        Array.isArray(plan.mvp.features) &&
        plan.mvp.features.length > 0
      ) {
        break;
      }
      throw new Error('Incomplete plan');
    } catch (err) {
      attempt++;
      if (attempt >= 2) {
        return jsonResponse({ error: 'Failed to parse plan from thread', raw: planText }, 500);
      }
      // Retry: continue the loop
    }
  }

  // At this point, we should have a valid plan.  If not, return error.
  if (!plan?.mvp) {
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
    return jsonResponse({ error: 'Failed to generate frontend', details: err.message }, 500);
  }
  // Generate backend stubs
  const backendStubs = generateBackendStubs(plan);
  // Combine all site files
  const siteFiles = { ...frontendFiles, ...backendStubs, ...allComponentFiles };

  // Prepare repository name
  const repoName = `${ideaId}-app`;
  const token = env.GITHUB_PAT;

  // Create the repository
  const repoRes = await fetch('https://api.github.com/user/repos', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: repoName, private: false }),
  });
  if (!repoRes.ok) {
    const errorText = await repoRes.text();
    return jsonResponse({ error: 'Failed to create repo', details: errorText }, repoRes.status);
  }

  // Upload each file
  for (const [path, content] of Object.entries(siteFiles)) {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const uploadRes = await fetch(
      `https://api.github.com/repos/${env.GITHUB_USERNAME}/${repoName}/contents/${path}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: `Add ${path}`, content: encoded, branch: 'main' }),
      },
    );
    if (!uploadRes.ok) {
      const errorText = await uploadRes.text();
      return jsonResponse({ error: `Failed to upload ${path}`, details: errorText }, uploadRes.status);
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
    return jsonResponse({ error: 'Failed to create Pages project', details: errorText }, cfProjectRes.status);
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
    return jsonResponse({ error: 'Failed to trigger deployment', details: errorText }, deployRes.status);
  }

  // Return success
  return jsonResponse({
    ideaId,
    repoUrl: `https://github.com/${env.GITHUB_USERNAME}/${repoName}`,
    pagesUrl: `https://${projectName}.pages.dev`,
  });
}