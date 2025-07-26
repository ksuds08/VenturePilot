// SPDX-License-Identifier: MIT
//
// Helper utilities for MVP generation.  These routines encapsulate the core logic
// for decomposing a product specification into granular components, generating
// frontend and backend code via OpenAI, and assembling a router file for
// Cloudflare Pages Functions.  Centralising this functionality in one module
// makes the primary worker easier to maintain and allows us to update prompt
// templates in a single place.

import { openaiChat } from './openai.js';
import { openaiChatJson } from './openaiJson.js';

/**
 * Generate a single component implementation by calling OpenAI.
 *
 * Components may represent either frontend or backend pieces of the MVP.  We
 * construct the system prompt with detailed instructions about code quality,
 * error handling, accessibility and progressive elaboration.  To avoid issues
 * where template literals collapse together during bundling (e.g. concatenating
 * variable names), this function builds dynamic strings outside of a single
 * template literal.
 *
 * The helper will retry generation up to two times if an error occurs or if
 * the response does not include the expected file.  On ultimate failure it
 * returns null so callers can decide how to proceed.
 *
 * @param {Object} component â the component definition including name
 * @param {Object} plan â the full MVP plan
 * @param {Object} env â environment variables (contains OPENAI_API_KEY)
 * @returns {Promise<Object|null>} â map of file names to contents or null on failure
 */
export async function generateComponentWithRetry(component, plan, env) {
  // Precompute names to prevent unintended concatenation during bundling.
  const handlerName = `${component.name}Handler`;
  const filePath = `functions/api/${component.name}.ts`;

  // Define the system prompt as an array of lines for clarity.  These lines are
  // joined with newlines before sending to OpenAI.  We include detailed
  // instructions about quality standards and a progressive elaboration approach.
  const systemLines = [
    'You are a senior fullâstack engineer. Build only the code needed to implement the following component of a multiâfile web application.',
    '',
    // Styling and file expectations
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
    // Quality guidelines
    '- Write productionâquality, maintainable TypeScript code.',
    '- Use clear, descriptive variable and function names.',
    '- Validate inputs and handle errors gracefully, returning appropriate HTTP status codes.',
    '- Structure logic to be modular and easy to extend.',
    '- For frontend code: use semantic HTML5 tags, accessible markup (add ARIA attributes where applicable) and ensure responsive design.',
    '- For backend code: properly parse the request body, validate expected fields, and never assume wellâformed input.',
    '- Include inline comments only to clarify complex logic, not as extra commentary.',
    '- Before writing code, think through the requirements and architecture step by step.  This is a progressive elaboration approach: reason internally about what is needed and then produce a polished implementation without exposing your reasoning.',
    '',
    // Response format requirements
    'You MUST return ONLY valid JSON in this format:',
    '{',
    '  "files": {',
    `    "${filePath}": "..."`,
    '  }',
    '}',
    '',
    // Strict rules
    'Strict rules:',
    '- DO NOT include markdown code fences like ``',
    '- DO NOT include commentary, explanations, or extra keys',
    '- In your JSON response, use double quotes (") for all keys and string values. Single quotes (\') are not valid in JSON.',
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
      // Validate that the expected file is present in the response
      if (!parsed?.files || !parsed.files[filePath]) {
        throw new Error('Missing expected file in response');
      }
      return parsed;
    } catch (err) {
      attempt++;
      console.error(`â Failed to generate component: ${component.name}, attempt ${attempt}`, err);
      if (attempt >= 2) {
        return null;
      }
    }
  }
}

/**
 * Generate frontend files (HTML/CSS/JS) for the given MVP plan and branding.
 *
 * The returned object maps file paths to contents.  This helper enforces
 * Tailwind usage, prioritises accessibility and responsiveness, and ensures
 * that index.html is present.  The prompt emphasises production quality and
 * instructs the model to think through the page structure before coding.
 *
 * @param {Object} plan â the MVP plan returned from the planning step
 * @param {Object} branding â branding kit with name, tagline and colors
 * @param {string|null} logoUrl â optional logo URL to embed
 * @param {Object} env â environment variables
 * @returns {Promise<Object>} â map of file names to contents
 */
export async function generateFrontendFiles(plan, branding, logoUrl, env) {
  const prompt = [
    {
      role: 'system',
      content: `
You are a fullâstack developer tasked with generating the frontend for a new MVP.

Use Tailwind CSS. Create clean, professional HTML/CSS and optionally JavaScript. Prioritise usability, accessibility and mobile responsiveness.

Write productionâready, maintainable code: use semantic HTML5 tags, a clear component structure, descriptive class and id names, and modular scripts. Avoid inline styles unless absolutely necessary. Provide interactive UI elements (forms, buttons, modals, chat bubbles) that match the described features.

Before writing code, think through the user journey and page layout step by step. Apply a progressive elaboration approach: plan the structure internally and then output only the final implementation without your reasoning.

If a backend API is needed (e.g., to fetch or submit data), wire the frontend to call the appropriate endpoint under /functions/api/.

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

When relevant, include frontend wiring to call a backend API at /functions/api/handler.ts.
      `.trim(),
    },
  ];
  // Use openaiChatJson to enforce valid JSON output and strip code fences automatically.
  const json = await openaiChatJson(env.OPENAI_API_KEY, prompt);
  // json should contain a "files" key with generated files.  Validate presence of index.html.
  const files = json?.files;
  if (!files || typeof files !== 'object' || !files['index.html']) {
    console.error('â Frontend output missing index.html or invalid files object', json);
    throw new Error('Frontend output missing index.html');
  }
  return files;
}

/**
 * Determine which implementation files are required for a given component and generate each one by prompting OpenAI.
 *
 * This helper first asks the model for a list of files (with filename and purpose), then calls OpenAI again
 * to generate the code for each file.  Files are returned in a single object mapping filenames to contents.
 *
 * Like generateComponentWithRetry, this function avoids nested template literals when constructing prompts to prevent
 * accidental concatenation of identifiers.  We also include quality guidelines and a progressive elaboration approach.
 *
 * @param {Object} component â the component definition
 * @param {Object} plan â the MVP plan
 * @param {Object} env â environment variables
 * @returns {Promise<Object>} â map of filenames to contents
 */
export async function generateComponentSubFiles(component, plan, env) {
  // Prompt for the list of needed files
  const subPrompt = [
    {
      role: 'system',
      content: [
        'You are a senior fullâstack architect.',
        '',
        'For the following component of a multiâfile web app, return a list of implementation files that should be created to properly build the feature.',
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
  // Request the list of files from OpenAI.  The wrapper ensures valid JSON.
  let filesNeeded;
  try {
    filesNeeded = await openaiChatJson(env.OPENAI_API_KEY, subPrompt);
    if (!Array.isArray(filesNeeded)) throw new Error('Invalid file list format');
  } catch (err) {
    console.error(`â Failed to parse subâfile list for component: ${component.name}`, err.message);
    return {};
  }
  const outputFiles = {};
  if (filesNeeded.length === 0) {
    return outputFiles;
  }
  // Build a single prompt to generate all files at once.  This reduces the number of OpenAI calls and
  // avoids exceeding subrequest limits on Cloudflare Workers.  We provide the list of filenames and
  // their purposes and ask for a JSON object mapping each filename to its code.
  const allSysLines = [
    'You are a senior fullâstack engineer. Generate code for multiple files required for a component.',
    '',
    'Requirements:',
    '- Use Tailwind for styling (frontend)',
    '- Use native Cloudflare Worker APIs (backend)',
    '- DO NOT use express, @vercel/node, etc.',
    // Additional quality guidelines
    '- Write productionâquality, maintainable TypeScript code.',
    '- Use clear, descriptive variable and function names.',
    '- Validate inputs and handle errors gracefully.',
    '- Structure logic to be modular and easy to extend.',
    '- For frontend: use semantic HTML and accessible markup.',
    '- Before coding, think through the implementation step by step (progressive elaboration) but output only the final code.',
    '',
    '- DO NOT include markdown fences or explanations.',
    '- In your JSON response, use double quotes (\") for all keys and string values. Single quotes (\') are not valid in JSON.',
    '- Return only valid JSON of the form: { "files": { "filename1": "code1", "filename2": "code2", ... } }',
  ];
  const allUserLines = [
    `Project: ${plan.mvp.name}`,
    `Component: ${component.name}`,
    `Technology: ${plan.mvp.technology}`,
    `Context: ${JSON.stringify(plan.mvp, null, 2)}`,
    '',
    'Files needed (filename: purpose):',
    ...filesNeeded.map((f) => `- ${f.filename}: ${f.purpose}`),
    '',
    'Generate all of these files with the appropriate code. Only include the files specified.',
  ];
  const allPrompt = [
    { role: 'system', content: allSysLines.join('\n') },
    { role: 'user', content: allUserLines.join('\n') },
  ];
  try {
    const parsed = await openaiChatJson(env.OPENAI_API_KEY, allPrompt);
    const fileMap = parsed?.files;
    if (fileMap && typeof fileMap === 'object') {
      for (const [filename, code] of Object.entries(fileMap)) {
        outputFiles[filename] = code;
      }
    } else {
      console.error('â Multi-file generation returned invalid structure', parsed);
    }
  } catch (err) {
    console.error('â Failed to generate subfiles for component', component.name, err.message);
  }
  return outputFiles;
}

/**
 * Decompose a highâlevel MVP specification into a list of functional components.
 *
 * This helper prompts the model to perform the decomposition and filters out nonâfunctional
 * items such as logos or themes.  It emphasises identifying granular features and splitting
 * them into distinct frontend and backend components where appropriate.
 *
 * @param {Object} plan â the parsed MVP plan
 * @param {Object} env â environment variables
 * @returns {Promise<Array<Object>>} â list of component definitions
 */
export async function decomposePlanToComponents(plan, env) {
  const prompt = [
    {
      role: 'system',
      content: `
You are an expert software architect.

Given the following MVP specification, decompose it into the *minimum viable set* of frontend and backend components required to implement the product.

Guidelines:
- Identify each meaningful feature described in the plan and break it down into discrete components. If a feature requires both frontend and backend logic, create separate components for each aspect (e.g. ResumeGeneratorFrontend and ResumeGeneratorBackend).
- Do NOT include abstract UI pieces like "Header", "ColorTheme", or "Logo".
- Do NOT include static assets like "logo.svg".
- DO include only meaningful, functional components (e.g., ResumeGenerator, TipsAPI).
- Use PascalCase for all component names.
- Think through the architecture and interactions step by step (progressive elaboration) before listing components, but output only the final JSON.

Each component must include:
- name: PascalCase identifier (no spaces or symbols)
- type: "frontend" or "backend"
- description: Clear purpose of this component
- location: Where the code should go (e.g., "index.html" or "functions/api/MyComponent.ts")

Return a JSON array. Use double quotes (\") for all keys and string values; single quotes are not valid in JSON. No markdown, no extra keys. Valid JSON only.
        `.trim(),
    },
    {
      role: 'user',
      content: `MVP Spec:\n\n${JSON.stringify(plan.mvp, null, 2)}`,
    },
  ];
  try {
    // Use the JSON wrapper to enforce valid output from OpenAI
    const components = await openaiChatJson(env.OPENAI_API_KEY, prompt);
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
    console.error('â Failed to parse component decomposition:', err.message);
    // Fallback: try a plain OpenAI call and manual parsing
    try {
      const res = await openaiChat(env.OPENAI_API_KEY, prompt);
      let raw = res.choices?.[0]?.message?.content?.trim() || '';
      raw = raw.replace(/```.*?\n|```/gs, '').trim();
      const components = JSON.parse(raw);
      if (!Array.isArray(components)) throw new Error('Not a valid array');
      return components.filter(
        (c) =>
          c?.name &&
          c?.type &&
          ['frontend', 'backend'].includes(c.type) &&
          c?.location &&
          c?.description &&
          !/logo|color|theme|header|footer/i.test(c.name)
      );
    } catch (err2) {
      console.error('â Fallback parse of component decomposition failed', err2.message);
      return [];
    }
  }
}

/**
 * Generate a router index file for Pages Functions based on the discovered backend handlers.
 * Each handler must export an async function matching the naming convention `${name}Handler`.
 *
 * @param {Object} allComponentFiles â map of file names to file contents
 * @returns {Object} â object containing the index.ts text and handlerExports array
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