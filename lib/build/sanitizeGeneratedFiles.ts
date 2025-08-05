// ✅ DO NOT IMPORT 'path'

// type definition
type FileSpec = { path: string; content: string };

export function sanitizeGeneratedFiles(
  files: FileSpec[],
  payload: any
): FileSpec[] {
  const sanitized: FileSpec[] = [];

  const backendHandlers: string[] = [];
  const publicFiles: FileSpec[] = [];

  for (const file of files) {
    const rawPath = file.path.replace(/^\//, '').trim();

    if (!rawPath || !file.content) continue;

    const ext = rawPath.split('.').pop() || '';
    const segments = rawPath.split('/');
    const filename = segments[segments.length - 1];

    // Move backend files
    if (segments[0] === 'backend') {
      if (ext === 'ts' || ext === 'js') {
        backendHandlers.push(file.content);
      }
      continue;
    }

    // Move frontend files to public/
    if (segments[0] === 'frontend') {
      const relativePath = segments.slice(1).join('/');
      publicFiles.push({
        path: `public/${relativePath}`,
        content: file.content,
      });
      continue;
    }

    // Otherwise preserve
    sanitized.push({ path: rawPath, content: file.content });
  }

  sanitized.push(...publicFiles);

  if (backendHandlers.length > 0) {
    const merged = backendHandlers
      .map((code, i) => `// chunk_${i}\n${code}`)
      .join('\n\n');

    sanitized.push({
      path: 'functions/index.ts',
      content: `
${merged}

export default {
  async fetch(request, env, ctx) {
    return new Response("Backend handlers merged successfully!", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};
`.trim(),
    });
  }

  return sanitized;
}