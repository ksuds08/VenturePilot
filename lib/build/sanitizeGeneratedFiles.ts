// lib/build/sanitizeGeneratedFiles.ts

export interface FileSpec {
  path: string;
  content: string;
}

/**
 * Sanitizes and transforms raw agent-generated file chunks into a valid
 * deployable file structure (e.g., index.html, functions/index.ts).
 */
export function sanitizeGeneratedFiles(
  files: FileSpec[],
  meta: { ideaId: string }
): FileSpec[] {
  const sanitized: FileSpec[] = [];

  const cleanCode = (code: string): string => {
    return code
      .replace(/^```[a-z]*\s*/gim, '') // strip code fences
      .replace(/```/g, '')             // close fences
      .replace(/^#+\s.*$/gm, '')       // markdown headings
      .replace(/^\/\/.*$/gm, '')       // comment clutter
      .trim();
  };

  // ──────────────────────────────────────────────
  // FRONTEND: Convert frontend/chunk_X.txt → public/index.html, etc.
  // ──────────────────────────────────────────────
  const frontendChunks = files.filter(f => f.path.startsWith('frontend/'));

  frontendChunks.forEach((f, i) => {
    const content = cleanCode(f.content);

    let target = 'public/index.html';
    if (content.includes('<script') || content.includes('function') || content.includes('console.')) {
      target = 'public/app.js';
    } else if (content.includes('body {') || content.includes('font-family') || content.includes('color:')) {
      target = 'public/styles.css';
    } else if (content.includes('<html') || content.includes('<!DOCTYPE html>')) {
      target = 'public/index.html';
    }

    // Avoid duplicates
    if (!sanitized.find(s => s.path === target)) {
      sanitized.push({ path: target, content });
    }
  });

  // ──────────────────────────────────────────────
  // BACKEND: Merge backend/chunk_X.txt → functions/index.ts
  // ──────────────────────────────────────────────
  const backendChunks = files.filter(f => f.path.startsWith('backend/'));

  const mergedBackend = backendChunks
    .map((f, i) => {
      const cleaned = cleanCode(f.content);
      return `// Handler ${i}\n${cleaned}`;
    })
    .join('\n\n');

  if (mergedBackend) {
    sanitized.push({
      path: 'functions/index.ts',
      content: mergedBackend,
    });
  }

  // ──────────────────────────────────────────────
  // CONFIG: Copy through config chunk files (leave as-is)
  // ──────────────────────────────────────────────
  const configChunks = files.filter(f => f.path.startsWith('config/'));
  configChunks.forEach((f, i) => {
    sanitized.push({
      path: `config/chunk_${i}.txt`,
      content: f.content.trim(),
    });
  });

  // ──────────────────────────────────────────────
  // OTHER: Manually included files like wrangler.toml, deploy.yml
  // ──────────────────────────────────────────────
  const passthrough = files.filter(f =>
    f.path === 'wrangler.toml' ||
    f.path === '.github/workflows/deploy.yml' ||
    f.path === 'functions/index.ts' // fallback
  );
  sanitized.push(...passthrough);

  // ──────────────────────────────────────────────
  // FILTER OUT ALL RAW CHUNK FILES
  // ──────────────────────────────────────────────
  return sanitized.filter(
    f => !f.path.includes('chunk_') || f.path.startsWith('config/')
  );
}