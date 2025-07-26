import { jsonResponse, safeJson } from '../utils/response.js';
import { openaiChat } from '../utils/openai.js';
import {
  decomposePlanToComponents,
  generateComponentWithRetry,
  generateRouterFile,
  generateFrontendFiles,
  generateBackendStubs
} from '../utils/mvpUtils.js';

/**
 * Handler for the `/mvp` endpoint. This function orchestrates the
 * generation of an MVP site based on the chat history and branding
 * information provided by the frontend. It wraps all logic in a
 * top-level try/catch so that unexpected exceptions always surface
 * useful error messages instead of resulting in opaque 500 errors.
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

    // Compose a plan extraction prompt.
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

    // Helper to clean and parse the plan response.
    const parsePlan = (raw) => {
      let text = raw.trim();
      text = text.replace(/```.*?\n|```/gs, '');
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
      if (!planTextRaw) {
        console.error('❌ No plan content returned by OpenAI', planRes);
        return jsonResponse({ error: 'OpenAI did not return a plan.' }, 500);
      }
      try {
        plan = parsePlan(planTextRaw);
        if (
          plan?.mvp?.name &&
          plan?.mvp?.description &&
          plan?.mvp?.technology &&
          Array.isArray(plan.mvp.features) &&
          plan.mvp.features.length > 0
        ) {
          break;
        }
        console.error('❌ Parsed plan is missing required fields', plan);
        throw new Error('Incomplete plan');
      } catch (err) {
        attempt++;
        if (attempt >= 2) {
          console.error('❌ Failed to parse plan JSON', planTextRaw);
          return jsonResponse(
            { error: 'Failed to parse plan from thread', raw: planTextRaw },
            500
          );
        }
      }
    }

    if (!plan?.mvp) {
      console.error('❌ MVP plan missing required fields after parsing', plan);
      return jsonResponse({ error: 'MVP plan missing required fields', plan }, 500);
    }

    // Decompose plan into components and generate backend files
    const components = await decomposePlanToComponents(plan, env);
    const allComponentFiles = {};
    for (const component of components) {
      if (component.type === 'backend') {
        const result = await generateComponentWithRetry(component, plan, env);
        if (result?.files) {
          Object.assign(allComponentFiles, result.files);
        }
      }
    }
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

    // Generate backend stubs and combine files
    const backendStubs = generateBackendStubs(plan);
    const siteFiles = { ...frontendFiles, ...backendStubs, ...allComponentFiles };

    // Create and populate GitHub repo
    const repoName = `${ideaId}-app`;
    const token = env.GITHUB_PAT;
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
      console.error('❌ Failed to create repo', errorText);
      return jsonResponse({ error: 'Failed to create repo', details: errorText }, repoRes.status);
    }
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
        console.error(`❌ Failed to upload ${path}`, errorText);
        return jsonResponse(
          { error: `Failed to upload ${path}`, details: errorText },
          uploadRes.status,
        );
      }
    }

    // Create Cloudflare Pages project and trigger deployment
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
      console.error('❌ Failed to create Pages project', errorText);
      return jsonResponse(
        { error: 'Failed to create Pages project', details: errorText },
        cfProjectRes.status,
      );
    }
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

    return jsonResponse({
      ideaId,
      repoUrl: `https://github.com/${env.GITHUB_USERNAME}/${repoName}`,
      pagesUrl: `https://${projectName}.pages.dev`,
    });
  } catch (err) {
    console.error('❌ Unhandled error in mvpHandler', err);
    return jsonResponse({ error: 'Unhandled error', details: err.message }, 500);
  }
}