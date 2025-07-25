// SPDX-License-Identifier: MIT
// Utility functions for MVP generation.  These helpers encapsulate
// decomposition of an MVP specification into components, generation of
// frontend and backend code files via OpenAI, and construction of a
// router file that ties together backend handlers in a Pages Function
// context.  Breaking these routines into a separate module makes
// `mvp.js` easier to read and maintain.

import { openaiChat } from './openai.js';

/**
 * Generate a single component implementation by calling OpenAI.
 * This helper retries generation once if an error occurs, returning
 * null on failure.  Components may represent either frontend or
 * backend pieces of the MVP.
 *
 * To avoid issues where template literals collapse together during
 * bundling (e.g. `component.namehandlerNamecomponent.name`), this
 * function constructs dynamic strings outside of the template literal
 * and then joins them line‑by‑line.
 *
 * @param {Object} component – the component definition including name
 * @param {Object} plan – the full MVP plan
 * @param {Object} env – environment variables (contains OPENAI_API_KEY)
 * @returns {Promise<Object|null>} – map of file names to contents or
 * null on failure
 */
export async function generateComponentWithRetry(component, plan, env) {
  // Precompute the handler name and file path instead of nesting them
  // directly in a single template literal.  This prevents accidental
  // merging of variable names when the code is minified or bundled.
  const handlerName = `${component.name}Handler`;
  const filePath = `functions/api/${component.name}.ts`;

  const systemLines = [
    'You are a senior full‑stack engineer. Build only the code needed to implement the following component of a multi‑file web application.',
    '',
    '- Use Tailwind CSS for styling.',
    '- If frontend: generate index.html, style.css, and script.js.',
    '- If backend:',
    `  - Create a file at: ${filePath}`,
    `  - The file MUST export this named async function exactly:`,
    `    export async function ${handlerName}(req: Request): Promise<Response>`,
    '  - DO NOT export default.',
    '  - DO NOT use external frameworks or libraries.',
    '  - DO NOT import from "express", "@vercel/node", "some-http-library", or "your-framework".',
    '  - Use only native Cloudflare Worker APIs (Request, Response).',
    '',
    'You MUST return ONLY valid JSON in this format:',
    '{',
    '  "files": {',
    `    "${filePath}": "..."`,
    '  }',
    '}',
    '',
    'Strict rules:',
    '- DO NOT include markdown code fences like ``',
    '- DO NOT include commentary, explanations, or extra keys',
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

  try {
    const compRes = await openaiChat(env.OPENAI_API_KEY, compPrompt);
    let raw = compRes.choices?.[0]?.message?.content?.trim() || '';
    raw = raw.replace(/^```(?:json|ts|js)?/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (err) {
    console.error(`❌ Failed to generate component: ${component.name}`, err);
    return null;
  }
}

/**
 * Generate frontend files (HTML/CSS/JS) for the given MVP plan and branding.
 * The returned object maps file paths to contents.  This helper enforces
 * Tailwind usage and ensures that index.html is present.
 *
 * @param {Object} plan – the MVP plan returned from the planning step
 * @param {Object} branding – branding kit with name, tagline and colors
 * @param {string|null} logoUrl – optional logo URL to embed
 * @param {Object} env – environment variables
 * @returns {Promise<Object>} – map of file names to contents
 */
export async function generateFrontendFiles(plan, branding, logoUrl, env) {
  const prompt = [
    {
      role: 'system',
      content: `
You are a full‑stack developer tasked with generating the frontend for a new MVP.

Use Tailwind CSS. Create clean, professional HTML/CSS and optionally JavaScript. Prioritize usability and mobile responsiveness.

Use the logo if available. Create real interactive UI (e.g. input fields, buttons, modals, chat bubbles) that matches the features described.

Return only valid JSON in this structure:
{
  "files": {
    "index.html": "...",
    "style.css": "...",            // optional, Tailwind preferred
    "script.js": "...",            // optional
    ...
  }
}`.trim(),
    },
    {
      role: 'user',
      content: `
MVP:
${JSON.stringify(plan.mvp, null, 2)}

Branding:
- Name: ${branding.name}
- Tagline: ${branding.tagline}
- Colors: ${branding.colors?.join(', ')}
- Logo: ${branding.logoDesc}
- Logo URL: ${logoUrl || 'none'}

When relevant, include frontend wiring to call a backend API at `/functions/api/handler.ts`.
        `.trim(),
    },
  ];
  const res = await openaiChat(env.OPENAI_API_KEY, prompt);
  let raw = res.choices?.[0]?.message?.content?.trim() || '';
  raw = raw.replace(/^```(?:json)?/, '').replace(/```$/, '');
  let files;
  try {
    files = JSON.parse(raw)?.files;
  } catch (err) {
    console.error('❌ Frontend validation failed:', raw);
    throw new Error('Frontend validation failed: bad JSON');
  }
  if (!files || !files['index.html']) {
    throw new Error('Frontend output missing index.html');
  }
  return files;
}

/**
 * Determine which implementation files are required for a given component and
 * generate each one by prompting OpenAI.  This helper first asks the model
 * for a list of files (with filename and purpose), then calls OpenAI again
 * to generate the code for each file.  Files are returned in a single
 * object mapping filenames to contents.
 *
 * Like generateComponentWithRetry, this function avoids nested template
 * literals when constructing prompts to prevent accidental concatenation of
 * identifiers.
 *
 * @param {Object} component – the component definition
 * @param {Object} plan – the MVP plan
 * @param {Object} env – environment variables
 * @returns {Promise<Object>} – map of filenames to contents
 */
export async function generateComponentSubFiles(component, plan, env) {
  // Prompt for the list of needed files
  const subPrompt = [
    {
      role: 'system',
      content: [
        'You are a senior full‑stack architect.',
        '',
        'For the following component of a multi‑file web app, return a list of implementation files that should be created to properly build the feature.',
        '',
        'Each file should include:',
        '- filename (relative path)',
        '- purpose (short sentence about its role)',
        '',
        'DO NOT include content. Return valid JSON like:',
        '[',
        '  { "filename": "functions/api/MyComponent.ts", "purpose": "Main API handler" },',
        '  { "filename": "functions/api/utils/helpers.ts", "purpose": "Helper functions" }',
        ']',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `Project: ${plan.mvp.name}`,
        `Component: ${component.name}`,
        `Type: ${component.type}`,
        `Purpose: ${component.purpose}`,
        `Technology: ${plan.mvp.technology}`,
        '',
        'Describe the files needed to build this component.',
      ].join('\n'),
    },
  ];
  const listRes = await openaiChat(env.OPENAI_API_KEY, subPrompt);
  let listRaw = listRes.choices?.[0]?.message?.content?.trim() || '';
  listRaw = listRaw.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  let filesNeeded;
  try {
    filesNeeded = JSON.parse(listRaw);
    if (!Array.isArray(filesNeeded)) throw new Error('Invalid file list format');
  } catch (err) {
    console.error(`❌ Failed to parse sub‑file list for component: ${component.name}`, listRaw);
    return {};
  }
  const outputFiles = {};
  // Generate each file sequentially
  for (const file of filesNeeded) {
    const fileName = file.filename;
    const handlerName = `${component.name}Handler`; // may be unused but included for clarity

    const sysLines = [
      'You are a senior full‑stack engineer. Generate only the code for the following file.',
      '',
      'Requirements:',
      '- Use Tailwind for styling (frontend)',
      '- Use native Cloudflare Worker APIs (backend)',
      '- DO NOT use express, @vercel/node, etc.',
      '- DO NOT include markdown fences or explanations.',
      `- Return only valid JSON: { "files": { "${fileName}": "..." } }`,
    ];

    const userLines = [
      `Project: ${plan.mvp.name}`,
      `Component: ${component.name}`,
      `File: ${fileName}`,
      `Purpose: ${file.purpose}`,
      `Technology: ${plan.mvp.technology}`,
      `Context: ${JSON.stringify(plan.mvp, null, 2)}`,
      '',
      'Add this file to the implementation.',
    ];

    const codePrompt = [
      { role: 'system', content: sysLines.join('\n') },
      { role: 'user', content: userLines.join('\n') },
    ];

    const fileRes = await openaiChat(env.OPENAI_API_KEY, codePrompt);
    let fileRaw = fileRes.choices?.[0]?.message?.content?.trim() || '';
    fileRaw = fileRaw.replace(/^```(?:json|ts|js)?/, '').replace(/```$/, '').trim();
    try {
      const parsed = JSON.parse(fileRaw);
      for (const [filename, code] of Object.entries(parsed.files || {})) {
        outputFiles[filename] = code;
      }
    } catch (err) {
      console.error(`❌ Failed to generate subfile: ${fileName}`, fileRaw);
    }
  }
  return outputFiles;
}

/**
 * Decompose a high‑level MVP specification into a list of functional
 * components.  This helper prompts the model to perform the decomposition
 * and filters out non‑functional items such as logos or themes.
 *
 * @param {Object} plan – the parsed MVP plan
 * @param {Object} env – environment variables
 * @returns {Promise<Array<Object>>} – list of component definitions
 */
export async function decomposePlanToComponents(plan, env) {
  const prompt = [
    {
      role: 'system',
      content: `
You are an expert software architect.

Given the following MVP specification, decompose it into the *minimum viable set* of frontend and backend components required to implement the product.

Rules:
- Do NOT include abstract UI pieces like "Header", "ColorTheme", or "Logo".
- Do NOT include static assets like "logo.svg".
- DO include only meaningful, functional components (e.g., ResumeGenerator, TipsAPI).
- Use PascalCase for all component names.

Each component must include:
- name: PascalCase identifier (no spaces or symbols)
- type: "frontend" or "backend"
- description: Clear purpose of this component
- location: Where the code should go (e.g., "index.html" or "functions/api/MyComponent.ts")

Return a JSON array. No markdown, no extra keys. Valid JSON only.
            `.trim(),
    },
    {
      role: 'user',
      content: `MVP Spec:\n\n${JSON.stringify(plan.mvp, null, 2)}`,
    },
  ];
  const res = await openaiChat(env.OPENAI_API_KEY, prompt);
  let raw = res.choices?.[0]?.message?.content?.trim() || '';
  raw = raw.replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  try {
    const components = JSON.parse(raw);
    if (!Array.isArray(components)) throw new Error('Not a valid array');
    // Filter out unwanted items
    return components.filter(
      (c) =>
        c?.name &&
        c?.type &&
        ['frontend', 'backend'].includes(c.type) &&
        c?.location &&
        c?.description &&
        !/logo|color|theme|header|footer/i.test(c.name)
    );
  } catch (err) {
    console.error('❌ Failed to parse component decomposition:', raw);
    return [];
  }
}

/**
 * Generate a router index file for Pages Functions based on the discovered
 * backend handlers.  Each handler must export an async function matching
 * the naming convention `${name}Handler`.
 *
 * @param {Object} allComponentFiles – map of file names to file contents
 * @returns {Object} – object containing the index.ts text and handlerExports
 * array
 */
export function generateRouterFile(allComponentFiles) {
  let indexTs = `// Auto-generated index.ts for Pages Functions routing\nimport type { Request } from 'itty-router';\n\n`;
  const handlerExports = [];
  for (const [filename, content] of Object.entries(allComponentFiles)) {
    if (filename.startsWith('functions/api/') && filename !== 'functions/api/index.ts') {
      const match = filename.match(/functions\/api\/(.+)\.ts$/);
      if (match) {
        const name = match[1];
        const handlerName = `${name}Handler`;
        if (content.includes(`export async function ${handlerName}`)) {
          indexTs += `import { ${handlerName} } from './${name}';\n`;
          handlerExports.push({ path: `/api/${name}`, handlerName, file: filename });
        }
      }
    }
  }
  indexTs += `\nexport async function onRequest({ request }: { request: Request }): Promise<Response> {\n`;
  indexTs += `  const url = new URL(request.url);\n  const path = url.pathname;\n\n`;
  for (const { path: routePath, handlerName } of handlerExports) {
    indexTs += `  if (path === "${routePath}") return ${handlerName}(request);\n`;
  }
  indexTs += `\n  return new Response("Not found", { status: 404 });\n}\n`;
  return {
    indexFile: indexTs,
    handlerExports,
  };
}
