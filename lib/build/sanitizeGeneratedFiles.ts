// lib/build/sanitizeGeneratedFiles.ts

import type { BuildPayload } from './types';

export interface FileSpec {
  path: string;
  content: string;
}

/**
 * Normalizes and rewrites the file paths of agent-generated files to match
 * the expected directory structure for Cloudflare Workers.
 */
export function sanitizeGeneratedFiles(files: FileSpec[], payload: BuildPayload): FileSpec[] {
  const rewritten: FileSpec[] = [];

  for (const file of files) {
    let path = file.path.trim().replace(/\\/g, '/');

    // Remove leading "./" if present
    if (path.startsWith('./')) {
      path = path.slice(2);
    }

    // Strip surrounding quotes or whitespace
    path = path.replace(/^['"]|['"]$/g, '').trim();

    // Map top-level flat files
    if (path === 'wrangler.toml') {
      rewritten.push({ path: 'wrangler.toml', content: file.content });
      continue;
    }

    if (path === '.github/workflows/deploy.yml') {
      rewritten.push({ path: '.github/workflows/deploy.yml', content: file.content });
      continue;
    }

    // Route known folder types
    if (path.startsWith('frontend/') || path.startsWith('public/')) {
      const name = path.split('/').pop();
      if (name?.endsWith('.html')) {
        rewritten.push({ path: 'index.html', content: file.content });
      } else if (name?.endsWith('.css')) {
        rewritten.push({ path: 'style.css', content: file.content });
      } else if (name?.endsWith('.js')) {
        rewritten.push({ path: 'main.js', content: file.content });
      } else {
        rewritten.push({ path: name || 'asset.txt', content: file.content });
      }
      continue;
    }

    if (path.startsWith('backend/')) {
      const baseName = path.split('/').pop()!.replace('.txt', '.ts');

      // Keep all backend chunks for inspection (optional)
      rewritten.push({ path: `functions/${baseName}`, content: file.content });

      // Promote the first valid handler to index.ts
      if (
        file.content.includes('export async function onRequest') ||
        file.content.includes('export default') && file.content.includes('fetch')
      ) {
        rewritten.push({ path: 'functions/index.ts', content: file.content });
      }

      continue;
    }

    if (path.startsWith('config/')) {
      const baseName = path.split('/').pop();
      if (baseName === 'chunk_0.txt') {
        rewritten.push({ path: 'wrangler.toml', content: file.content });
      } else if (baseName === 'chunk_1.txt') {
        rewritten.push({ path: 'package.json', content: file.content });
      } else if (baseName === 'chunk_2.txt') {
        rewritten.push({ path: 'README.md', content: file.content });
      } else if (baseName === 'chunk_3.txt') {
        rewritten.push({ path: '.gitignore', content: file.content });
      }
      continue;
    }

    if (path.startsWith('assets/')) {
      const name = path.split('/').pop();
      rewritten.push({ path: name || 'asset.txt', content: file.content });
      continue;
    }

    // Fallback catch-all
    rewritten.push({ path, content: file.content });
  }

  return rewritten;
}