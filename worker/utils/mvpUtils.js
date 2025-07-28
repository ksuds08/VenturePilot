// mvpUtils.js provides helper functions for decomposing an MVP spec into
// frontend and backend components and for generating code files from those
// components.  It instructs the model to include an `onRequest` export in
// each backend handler so Cloudflare Pages can recognise it.  The file also
// contains utilities for generating frontend files and assembling a router
// to dispatch requests to the appropriate handler.  Comments at the top of
// the file were converted to line comments to avoid build parsers
// misinterpreting multi‑line comment blocks.

import { openaiChat } from './openai.js';
import { openaiChatJson } from './openaiJson.js';
import { componentListSchema } from './schemas.js';

// Remove disallowed imports from backend code
function sanitizeImports(code) {
  return code.replace(
    /import\s+\{[^}]+\}\s+from\s+['"](cloudflare-worker-types|some-cloudflare-package|undici|worktop)['"];?\n?/g,
    '',
  );
}

/**
 * Generate all backend files for a component in a single OpenAI call.
 * For Worker deployments, backend handlers live under worker/api and
 * helper modules live under functions/api.
 */
export async function generateBackendComponentFiles(component, plan, env) {
  const filePath = `worker/api/${component.name}.ts`;
  const sysLines = [
    'You are a senior full‑stack engineer. Generate all necessary backend files for the given component in a single response.',
    '',
    'Requirements:',
    '- Use only native Cloudflare Worker APIs (Request, Response, fetch).',
    '- DO NOT import any modules or packages other than built‑in APIs. Do not import from "cloudflare-worker-types", "some-cloudflare-package", "undici", "worktop", or any other external library.',
    `- The primary handler file must be located at: ${filePath}`,
    `- The file must export an async function named ${component.name}Handler(req: Request): Promise<Response>`,
    '- DO NOT export default.',
    '- If additional helper files are needed, include them under functions/api/, with appropriate filenames.',
    '',
    '- Validate inputs, handle errors gracefully, and use clear TypeScript types.',
    '- Return only valid JSON: { "files": { "<path>": "<code>", ... } }',
    '- Use double quotes for all keys and string values in your JSON output.',
    '',
    'Do not include markdown fences or explanations.',
  ];
  const userLines = [
    `Project: ${plan.mvp.name}`,
    `Component: ${component.name}`,
    `Purpose: ${component.purpose}`,
    `Technology: ${plan.mvp.technology}`,
    `Context: ${JSON.stringify(plan.mvp, null, 2)}`,
  ];
  const prompt = [
    { role: 'system', content: sysLines.join('\n') },
    { role: 'user', content: userLines.join('\n') },
  ];
  try {
    const parsed = await openaiChatJson(env.OPENAI_API_KEY, prompt);
    const files = parsed?.files;
    if (!files || typeof files !== 'object' || !files[filePath]) {
      throw new Error('Missing main backend file in response');
    }
    const output = {};
    for (const [fname, code] of Object.entries(files)) {
      let adjustedCode = code;
      // If this is a backend file under worker/api, fix relative imports to functions/api.
      if (fname.startsWith('worker/api/') && typeof adjustedCode === 'string') {
        adjustedCode = adjustedCode.replace(/\\.\\.\\/functions\\/api\\//g, '../../functions/api/');
      }
      // If this is a helper file under functions/api, strip disallowed imports.
      if (fname.startsWith('functions/api/') && typeof adjustedCode === 'string') {
        adjustedCode = sanitizeImports(adjustedCode);
      }
      output[fname] = adjustedCode;
    }
    return output;
  } catch (err) {
    console.error('❌ Failed to generate backend files for component', component.name, err.message);
    return null;
  }
}

/**
 * Generate a single component implementation by calling OpenAI.
 * Retries up to two times if the result is missing the expected file.
 */
export async function generateComponentWithRetry(component, plan, env) {
  const handlerName = `${component.name}Handler`;
  const filePath = `worker/api/${component.name}.ts`;
  const systemLines = [
    'You are a senior full‑stack engineer. Build only the code needed to implement the following component of a multi‑file web application.',
    '',
    '- Use Tailwind CSS for styling.',
    '- If frontend: generate index.html, style.css, and script.js.',
    '- If backend:',
    `  - Create a file at: ${filePath}`,
    `  - The file MUST export this named async function exactly:`,
    `    export async function ${handlerName}(req: Request): Promise<Response>`,
    `    // And also export a variable named onRequest pointing to this handler:`,
    `    export const onRequest = ${handlerName};`,
    '  - DO NOT export default.',
    '  - DO NOT use external frameworks or libraries.',
    '  - DO NOT import from "express", "@vercel/node", "some-http-library", or "your-framework".',
    '  - Use only native Cloudflare Worker APIs (Request, Response).',
    '',
    '- Write production‑quality, maintainable TypeScript code.',
    '- Use clear, descriptive variable and function names.',
    '- Validate inputs and handle errors gracefully, returning appropriate HTTP status codes.',
    '- Structure logic to be modular and easy to extend.',
    '- For frontend code: use semantic HTML5 tags, accessible markup and responsive design.',
    '- For backend code: properly parse the request body, validate expected fields, and never assume well‑formed input.',
    '',
    '- DO NOT include markdown code fences or commentary.',
    '- In your JSON response, use double quotes (") for all keys and string values.',
    '- DO NOT import any modules or packages other than the built‑in Cloudflare Worker APIs (Request, Response).',
  ];
  const userLines = [
    `Project: ${plan.mvp.name}`,
    `Component: ${component.name}`,
    `Purpose: ${component.purpose}`,
    `Data: ${component.data || 'N/A'}`,
    `Technology: ${plan.mvp.technology}`,
    `UI/UX Notes: ${plan.mvp.visualStyle}`,
    '',
    'Add this feature to the existing site.',
  ];
  const compPrompt = [
    { role: 'system', content: systemLines.join('\n') },
    { role: 'user', content: userLines.join('\n') },
  ];
  let attempt = 0;
  while (attempt < 2) {
    try {
      const parsed = await openaiChatJson(env.OPENAI_API_KEY, compPrompt);
      const files = parsed?.files;
      if (files && files[filePath]) {
        const result = {};
        for (const [fname, code] of Object.entries(files)) {
          let adjustedCode = code;
          if (fname.startsWith('worker/api/') && typeof adjustedCode === 'string') {
            adjustedCode = adjustedCode.replace(/\\.\\.\\/functions\\/api\\//g, '../../functions/api/');
          }
          if (fname.startsWith('functions/api/') && typeof adjustedCode === 'string') {
            adjustedCode = sanitizeImports(adjustedCode);
          }
          result[fname] = adjustedCode;
        }
        return result;
      }
    } catch (err) {
      console.error('❌ Failed to generate component', component.name, err.message);
    }
    attempt++;
  }
  throw new Error(`Failed to generate implementation for component: ${component.name}`);
}

// … the rest of mvpUtils.js (functions for frontend generation, router assembly, etc.) remains unchanged …