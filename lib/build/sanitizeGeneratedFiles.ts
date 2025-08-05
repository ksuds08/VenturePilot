// lib/build/sanitizeGeneratedFiles.ts

import type { FileSpec } from './types';

/**
 * Normalizes and rewrites the file paths of agent-generated files to match
 * the expected structure for Cloudflare Workers deployment.
 *
 * - Promotes one backend file to functions/index.ts
 * - Promotes wrangler.toml and deploy.yml to root
 * - Ignores duplicates and trims whitespace
 */
export function sanitizeGeneratedFiles(files: FileSpec[]): FileSpec[] {
  const seen = new Set<string>();
  let foundBackend = false;
  let foundWrangler = false;
  let foundDeploy = false;

  const cleaned = files
    .map((file) => {
      const path = file.path.trim().replace(/^\.\/+/, '').replace(/\\/g, '/');
      const lower = path.toLowerCase();

      // Promote first backend chunk (JS or TS) to functions/index.ts
      if (
        !foundBackend &&
        (lower.endsWith('.ts') || lower.endsWith('.js')) &&
        (lower.includes('backend') || lower.includes('function')) &&
        lower.includes('chunk')
      ) {
        foundBackend = true;
        console.log(`🔄 Rewriting ${file.path} → functions/index.ts`);
        return { ...file, path: 'functions/index.ts' };
      }

      // Promote wrangler.toml to root
      if (!foundWrangler && lower.includes('wrangler.toml')) {
        foundWrangler = true;
        console.log(`🔄 Rewriting ${file.path} → wrangler.toml`);
        return { ...file, path: 'wrangler.toml' };
      }

      // Promote deploy.yml to .github/workflows/deploy.yml
      if (!foundDeploy && lower.includes('deploy.yml')) {
        foundDeploy = true;
        console.log(`🔄 Rewriting ${file.path} → .github/workflows/deploy.yml`);
        return { ...file, path: '.github/workflows/deploy.yml' };
      }

      return { ...file, path };
    })
    .filter((file) => {
      const key = file.path;
      if (seen.has(key)) {
        console.log(`⚠️ Skipping duplicate: ${key}`);
        return false;
      }
      seen.add(key);
      return true;
    });

  return cleaned;
}