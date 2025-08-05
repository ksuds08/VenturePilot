import path from 'path';

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

    const ext = path.extname(rawPath);
    const base = path.basename(rawPath);
    const segments = rawPath.split('/');

    // Parse backend files
    if (segments[0] === 'backend') {
      if (ext === '.ts' || ext === '.js') {
        backendHandlers.push(file.content);
      }
      continue;
    }

    // Move frontend files to /public
    if (segments[0] === 'frontend') {
      const filename = segments.slice(1).join('/');
      publicFiles.push({
        path: `public/${filename}`,
        content: file.content,
      });
      continue;
    }

    // Normalize other folders
    sanitized.push({
      path: rawPath,
      content: file.content,
    });
  }

  // Include parsed public assets
  sanitized.push(...publicFiles);

  // Merge backend handlers if any exist
  if (backendHandlers.length > 0) {
    const joined = backendHandlers
      .map((code, i) => `// chunk_${i}\n${code}`)
      .join('\n\n');

    const merged = `
${joined}

// Merge logic if needed
export default {
  async fetch(request, env, ctx) {
    return new Response("Backend handlers merged successfully!", {
      headers: { "Content-Type": "text/plain" }
    });
  }
}
    `.trim();

    sanitized.push({
      path: 'functions/index.ts',
      content: merged,
    });
  }

  return sanitized;
}