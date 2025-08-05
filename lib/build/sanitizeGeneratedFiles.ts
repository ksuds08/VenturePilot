// lib/build/sanitizeGeneratedFiles.ts
import type { BuildPayload } from './types';

interface FileSpec {
  path: string;
  content: string;
}

function cleanCode(code: string): string {
  return code.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim();
}

function inferFrontendFiles(chunks: FileSpec[]): FileSpec[] {
  return chunks.map((chunk, i) => {
    const content = cleanCode(chunk.content);
    const lower = content.toLowerCase();
    let ext = 'txt';
    if (lower.includes('<html')) ext = 'html';
    else if (lower.includes('tailwind') || lower.includes('body {')) ext = 'css';
    else if (lower.includes('document.') || lower.includes('addEventListener')) ext = 'js';
    return {
      path: `public/${['index', 'styles', 'app'][i] || `file${i}`}.${ext}`,
      content,
    };
  });
}

function mergeBackendChunks(chunks: FileSpec[]): FileSpec {
  const handlers = chunks.map((chunk, i) => {
    const name = `handler${i}`;
    const cleaned = cleanCode(chunk.content)
      .replace(/export\s+async\s+function\s+onRequest/g, `const ${name} = async`)
      .replace(/export\s+default\s+async\s+function\s+onRequest/g, `const ${name} = async`);
    return { name, cleaned };
  });

  const merged =
    handlers.map(h => `// ${h.name}\n${h.cleaned}`).join('\n\n') +
    `\n\nexport default {\n  ${handlers.map(h => h.name).join(',\n  ')}\n};`;

  return {
    path: 'functions/index.ts',
    content: merged,
  };
}

export function sanitizeGeneratedFiles(
  files: FileSpec[],
  payload: { ideaId: string }
): FileSpec[] {
  const sanitized: FileSpec[] = [];

  // Infer and add frontend files
  const frontendChunks = files.filter(f => f.path.startsWith('frontend/'));
  sanitized.push(...inferFrontendFiles(frontendChunks));

  // Merge and add backend handler
  const backendChunks = files.filter(f => f.path.startsWith('backend/'));
  if (backendChunks.length > 0) {
    sanitized.push(mergeBackendChunks(backendChunks));
  }

  // Pass through valid files
  for (const file of files) {
    if (
      file.path.endsWith('.toml') ||
      file.path.endsWith('.json') ||
      file.path.endsWith('.yml') ||
      file.path.startsWith('.github/')
    ) {
      sanitized.push(file);
    }
  }

  return sanitized;
}