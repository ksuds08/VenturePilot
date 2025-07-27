// mvpUtils.js provides helper functions for decomposing an MVP spec into
// frontend and backend components and for generating code files from those
// components.  It instructs the model to include an `onRequest` export in
// each backend handler so Cloudflare Pages can recognise it【552761521993816†L300-L313】.  The
// file also contains utilities for generating frontend files and assembling
// a router to dispatch requests to the appropriate handler.  Comments at
// the top of the file were converted to line comments to avoid build
// parsers misinterpreting multi‑line comment blocks.

import { openaiChat } from './openai.js';
import { openaiChatJson } from './openaiJson.js';
import { componentListSchema } from './schemas.js';

// Remove disallowed imports from backend code
function sanitizeImports(code) {
  return code.replace(
    /import\s+\{[^}]+\}\s+from\s+['\"](cloudflare-worker-types|some-cloudflare-package|undici|worktop)['\"];?\n?/g,
    '',
  );
}

/**
 * Generate all backend files for a component in a single OpenAI call.
 * This helper is unchanged from the original implementation.
 */
export async function generateBackendComponentFiles(component, plan, env) {
  // For Worker deployments, write backend handlers into worker/api rather than
  // functions/api.  Each handler file exports a named async function
  // `${component.name}Handler` that takes a Request and returns a Response.  We
  // intentionally omit the onRequest alias because the Worker entrypoint will
  // import and invoke these handlers directly.
  const filePath = `worker/api/${component.name}.ts`;
  const sysLines = [
    'You are a senior full‑stack engineer. Generate all necessary backend files for the given component in a single response.',
    '',
    'Requirements:',
    '- Use only native Cloudflare Worker APIs (Request, Response, fetch).',
    '- DO NOT import any modules or packages other than built‑in APIs. Do not import from "cloudflare-worker-types", "some-cloudflare-package", "undici", "worktop", or any other external library.',
    `- The primary handler file must be located at: ${filePath}`,
    `- The file must export an async function named ${component.name}Handler(req: Request): Promise<Response>`,
    // In a Worker deployment we import and call this handler manually from the entrypoint,
    // so there is no need to export an onRequest alias.
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
      if (fname.startsWith('functions/api/') && typeof code === 'string') {
        output[fname] = sanitizeImports(code);
      } else {
        output[fname] = code;
      }
    }
    // For Worker deployments we do not automatically append an onRequest alias.
    return output;
  } catch (err) {
    console.error('❌ Failed to generate backend files for component', component.name, err.message);
    return null;
  }
}

/**
 * Generate a single component implementation by calling OpenAI.  The helper
 * retries up to two times if the result is missing the expected file.
 */
export async function generateComponentWithRetry(component, plan, env) {
  const handlerName = `${component.name}Handler`;
  // Write backend handler under worker/api for Worker deployments
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
    // Added instruction: export onRequest alias referencing the handler
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
    '- In your JSON response, use double quotes (\") for all keys and string values.',
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
      if (!parsed?.files || !parsed.files[filePath]) {
        throw new Error('Missing expected file in response');
      }
      const sanitized = { files: { ...parsed.files } };
      const code = sanitized.files[filePath];
      if (typeof code === 'string') {
        sanitized.files[filePath] = sanitizeImports(code);
      }
      // For Worker deployments we do not append an onRequest alias.  The entrypoint
      // will import and invoke the handler directly.
      return sanitized;
    } catch (err) {
      attempt++;
      console.error(`❌ Failed to generate component: ${component.name}, attempt ${attempt}`, err);
      if (attempt >= 2) {
        return null;
      }
    }
  }
}

/**
 * Generate frontend files (HTML/CSS/JS) for the given MVP plan and branding.
 * This helper enforces Tailwind, accessibility and progressive elaboration.
 */
export async function generateFrontendFiles(plan, branding, logoUrl, env) {
  const prompt = [
    {
      role: 'system',
      content: `
    You are a full‑stack developer tasked with generating the frontend for a new MVP.

    Use Tailwind CSS. Create clean, professional HTML/CSS and optionally JavaScript. Prioritise usability, accessibility and mobile responsiveness.

    Write production‑ready, maintainable code: use semantic HTML5 tags, a clear component structure, descriptive class and id names, and modular scripts. Avoid inline styles unless absolutely necessary. Provide interactive UI elements (forms, buttons, modals, chat bubbles) that match the described features.

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
    }
    `.trim(),
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
  const json = await openaiChatJson(env.OPENAI_API_KEY, prompt);
  const files = json?.files;
  if (!files || typeof files !== 'object' || !files['index.html']) {
    console.error('❌ Frontend output missing index.html or invalid files object', json);
    throw new Error('Frontend output missing index.html');
  }
  return files;
}

/**
 * Determine which implementation files are required for a given component and
 * generate each one by prompting OpenAI.  This helper first asks for a list
 * of files with their purposes and then generates them all at once.
 */
export async function generateComponentSubFiles(component, plan, env) {
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
  let filesNeeded;
  try {
    filesNeeded = await openaiChatJson(env.OPENAI_API_KEY, subPrompt);
    if (!Array.isArray(filesNeeded)) throw new Error('Invalid file list format');
  } catch (err) {
    // Fallback: call openaiChat directly and attempt to parse manually
    try {
      const res = await openaiChat(env.OPENAI_API_KEY, subPrompt);
      let raw = res.choices?.[0]?.message?.content?.trim() || '';
      raw = raw.replace(/```.*?\n|```/gs, '').trim();
      const s = raw.indexOf('[');
      const e = raw.lastIndexOf(']');
      let jsonText = raw;
      if (s !== -1 && e !== -1 && e >= s) {
        jsonText = raw.slice(s, e + 1);
      }
      try {
        filesNeeded = JSON.parse(jsonText);
      } catch (parseErr) {
        const fixed = jsonText
          .replace(/'([^']+)'(?=\s*:)/g, '"$1"')
          .replace(/:\s*'([^']+)'/g, ': "$1"');
        filesNeeded = JSON.parse(fixed);
      }
      if (!Array.isArray(filesNeeded)) throw new Error('Invalid file list format');
    } catch (err2) {
      console.error(`❌ Failed to parse sub‑file list for component: ${component.name}`, err2.message);
      return {};
    }
  }
  const outputFiles = {};
  if (filesNeeded.length === 0) {
    return outputFiles;
  }
  const allSysLines = [
    'You are a senior full‑stack engineer. Generate code for multiple files required for a component.',
    '',
    'Requirements:',
    '- Use Tailwind for styling (frontend)',
    '- Use native Cloudflare Worker APIs (backend)',
    '- DO NOT use express, @vercel/node, etc.',
    '- Write production‑quality, maintainable TypeScript code.',
    '- Use clear, descriptive variable and function names.',
    '- Validate inputs and handle errors gracefully.',
    '- Structure logic to be modular and easy to extend.',
    '- For frontend: use semantic HTML and accessible markup.',
    '- Before coding, think through the implementation step by step (progressive elaboration) but output only the final code.',
    '',
    '- DO NOT include markdown fences or explanations.',
    '- In your JSON response, use double quotes (\") for all keys and string values. Single quotes (\') are not valid in JSON.',
    '- Return only valid JSON of the form: { "files": { "filename1": "code1", "filename2": "code2", ... } }',
    '- DO NOT import any modules or packages other than the built‑in Cloudflare Worker APIs (Request, Response).',
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
        if (typeof code === 'string' && filename.startsWith('functions/api/')) {
          outputFiles[filename] = sanitizeImports(code);
        } else {
          outputFiles[filename] = code;
        }
      }
    } else {
      console.error('❌ Multi-file generation returned invalid structure', parsed);
    }
  } catch (err) {
    console.error('❌ Failed to generate subfiles for component', component.name, err.message);
  }
  return outputFiles;
}

/**
 * Decompose a high‑level MVP specification into a list of functional components.
 *
 * This version bypasses OpenAI function‑calling and instead instructs the model
 * to return a JSON array (or object with a `components` property).  The
 * result is validated and filtered to remove non-functional items.
 */
export async function decomposePlanToComponents(plan, env) {
  const messages = [
    {
      role: 'system',
      content: [
        'You are an expert software architect.',
        '',
        'Given the following MVP specification, decompose it into the *minimum viable set* of frontend and backend components required to implement the product.',
        '',
        'Guidelines:',
        '- Identify each meaningful feature described in the plan and break it down into discrete components. If a feature requires both frontend and backend logic, create separate components for each aspect (e.g. ResumeGeneratorFrontend and ResumeGeneratorBackend).',
        '- Do NOT include abstract UI pieces like "Header", "ColorTheme", or "Logo".',
        '- Do NOT include static assets like "logo.svg".',
        '- DO include only meaningful, functional components (e.g., ResumeGenerator, TipsAPI).',
        '- Use PascalCase for all component names.',
        '- Think through the architecture and interactions step by step (progressive elaboration) before listing components, but output only the final JSON.',
        '',
        'Return the list of components as a JSON array (or an object with a "components" array). Each component must include name, type, description, and location.',
        'Do not include code fences or commentary; valid JSON only.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `MVP Spec:\n\n${JSON.stringify(plan.mvp, null, 2)}`,
    },
  ];
  try {
    const parsed = await openaiChatJson(env.OPENAI_API_KEY, messages);
    const components = parsed?.components ?? parsed;
    if (!Array.isArray(components)) throw new Error('Not a valid array');
    return components.filter(
      (c) =>
        c?.name &&
        c?.type &&
        ['frontend', 'backend'].includes(c.type) &&
        c?.location &&
        c?.description &&
        !/logo|color|theme|header|footer/i.test(c.name),
    );
  } catch (err) {
    console.error('❌ Failed to parse component decomposition:', err.message);
    return [];
  }
}

/**
 * Generate a router index file for Pages Functions based on the discovered
 * backend handlers.  Each handler must export an async function matching
 * the naming convention `${name}Handler`.
 */
export function generateRouterFile(allComponentFiles) {
  // Begin the router file without importing external modules.  Cloudflare
  // Pages provides Request and Response globals, so we avoid any imports
  // here to prevent missing dependency errors.
  let indexTs = `// Auto-generated index.ts for Pages Functions routing\n`;
  const handlerExports = [];
  for (const [filename, content] of Object.entries(allComponentFiles)) {
    if (filename.startsWith('functions/api/') && filename !== 'functions/api/index.ts') {
      const match = filename.match(/functions\/api\/(.+)\.ts$/);
      if (match) {
        const name = match[1];
        const handlerName = `${name}Handler`;
        if (typeof content === 'string' && content.includes(`export async function ${handlerName}`)) {
          indexTs += `import { ${handlerName} } from './${name}';\n`;
          handlerExports.push({ path: `/api/${name}`, handlerName, file: filename });
        }
      }
    }
  }
  indexTs += `\nexport async function onRequest({ request }) {\n`;
  indexTs += `  const url = new URL(request.url);\n`;
  indexTs += `  const path = url.pathname;\n\n`;
  for (const { path: routePath, handlerName } of handlerExports) {
    indexTs += `  if (path === "${routePath}") return ${handlerName}(request);\n`;
  }
  indexTs += `\n  return new Response("Not found", { status: 404 });\n}\n`;
  return {
    indexFile: indexTs,
    handlerExports,
  };
}

/**
 * Generate a Worker entrypoint file that serves the static frontend and routes
 * API requests to backend handlers.  The resulting file is written to
 * worker/index.ts and can be used as the main entry for a Cloudflare
 * Worker deployment.
 *
 * The entrypoint imports each backend handler from the worker/api directory
 * and embeds the contents of index.html, style.css and script.js directly
 * into the script.  Requests to `/` return the HTML, `/style.css` the CSS,
 * `/script.js` the JS, and `/api/<name>` will invoke the corresponding
 * `<name>Handler` function.  Any other path yields a 404.
 *
 * @param {Object} allComponentFiles Map of filename → file content for backend handlers
 * @param {Object} frontendFiles Map of filename → file content for the frontend
 * @returns {{ entryFile: string, handlerImports: Array<{ name: string, handlerName: string }> }}
 */
export function generateWorkerEntryFile(allComponentFiles, frontendFiles) {
  let entryTs = `// Auto-generated entrypoint for Cloudflare Worker\n\n`;
  // Collect backend handlers
  const handlers = [];
  for (const [filename, content] of Object.entries(allComponentFiles)) {
    if (filename.startsWith('worker/api/') && filename.endsWith('.ts')) {
      const match = filename.match(/worker\/api\/(.+)\.ts$/);
      if (match) {
        const name = match[1];
        const handlerName = `${name}Handler`;
        if (typeof content === 'string' && content.includes(`export async function ${handlerName}`)) {
          entryTs += `import { ${handlerName} } from './api/${name}';\n`;
          handlers.push({ name, handlerName });
        }
      }
    }
  }
  // Inline static assets.  Escape backticks and `${` sequences to avoid
  // breaking template literals.  Undefined files default to empty strings.
  const escapeContent = (text) =>
    (text || '')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
  const indexHtml = escapeContent(frontendFiles['index.html']);
  const styleCss = escapeContent(frontendFiles['style.css']);
  const scriptJs = escapeContent(frontendFiles['script.js']);
  entryTs += `\nconst INDEX_HTML = \`${indexHtml}\`;\n`;
  entryTs += `const STYLE_CSS = \`${styleCss}\`;\n`;
  entryTs += `const SCRIPT_JS = \`${scriptJs}\`;\n\n`;
  // Build fetch handler
  entryTs += `export default {\n`;
  entryTs += `  async fetch(request) {\n`;
  entryTs += `    const url = new URL(request.url);\n`;
  entryTs += `    const path = url.pathname;\n`;
  entryTs += `    if (path === '/') return new Response(INDEX_HTML, { headers: { 'Content-Type': 'text/html' } });\n`;
  entryTs += `    if (path === '/style.css') return new Response(STYLE_CSS, { headers: { 'Content-Type': 'text/css' } });\n`;
  entryTs += `    if (path === '/script.js') return new Response(SCRIPT_JS, { headers: { 'Content-Type': 'application/javascript' } });\n`;
  // Add API routes
  for (const { name, handlerName } of handlers) {
    entryTs += `    if (path === '/api/${name}') return ${handlerName}(request);\n`;
  }
  entryTs += `    return new Response('Not found', { status: 404 });\n`;
  entryTs += `  }\n`;
  entryTs += `};\n`;
  return { entryFile: entryTs, handlerImports: handlers };
}