// lib/build/sanitizeGeneratedFiles.ts
import type { BuildPayload } from './types';

export interface FileSpec {
  path: string;
  content: string;
}

/**
 * Maps agent-generated file chunks into their final deploy-ready structure.
 * Also skips package.json entirely for now to avoid build failures.
 */
export function sanitizeGeneratedFiles(files: FileSpec[], projectName = 'launchwing-app'): FileSpec[] {
  const rewritten: FileSpec[] = [];

  for (const file of files) {
    const { path, content } = file;
    const lower = path.toLowerCase();

    // ⛔ Skip dangerous or broken files
    if (lower.endsWith('package.json')) continue;
    if (!content || typeof content !== 'string' || content.trim().length === 0) continue;

    // ✅ Handle config files
    if (lower.includes('wrangler') && content.includes('compatibility_date')) {
      rewritten.push({ path: 'wrangler.toml', content });
      continue;
    }

    if (lower.includes('deploy') && content.includes('cloudflare/wrangler-action')) {
      rewritten.push({ path: '.github/workflows/deploy.yml', content });
      continue;
    }

    // ✅ Handle backend functions
    if (lower.startsWith('backend/')) {
      rewritten.push({ path: `functions/index.ts`, content }); // 🧠 Use last one wins
      continue;
    }

    // ✅ Handle frontend HTML/CSS/JS
    if (lower.startsWith('frontend/')) {
      if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
        rewritten.push({ path: 'public/index.html', content });
        continue;
      }

      if (content.includes('body {') || content.includes('font-family') || content.includes('background-color')) {
        rewritten.push({ path: 'public/styles.css', content });
        continue;
      }

      if (content.includes('document.getElementById') || content.includes('addEventListener')) {
        rewritten.push({ path: 'public/app.js', content });
        continue;
      }
    }

    // ✅ Handle assets like manifest or XML
    if (lower.startsWith('assets/')) {
      if (content.includes('short_name') || content.includes('"theme_color"')) {
        rewritten.push({ path: 'public/manifest.json', content });
        continue;
      }

      if (content.includes('<browserconfig>')) {
        rewritten.push({ path: 'public/browserconfig.xml', content });
        continue;
      }
    }

    // ❓ Default fallback if unrecognized
    rewritten.push({ path, content });
  }

  // ✅ Ensure a fallback Worker exists
  const hasWorker = rewritten.some(f => f.path === 'functions/index.ts');
  if (!hasWorker) {
    rewritten.push({
      path: 'functions/index.ts',
      content: `export default {
  async fetch(request, env) {
    return new Response("Hello from LaunchWing!", {
      headers: { "Content-Type": "text/plain" }
    });
  }
};`,
    });
  }

  return rewritten;
}