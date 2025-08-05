export function sanitizeGeneratedFiles(
  files: { path: string; content: string }[]
): { path: string; content: string }[] {
  return files.map((file) => {
    const lower = file.path.toLowerCase();

    // Wrangler config
    if (lower.includes('wrangler') && lower.endsWith('.toml')) {
      console.log(`🔄 Rewriting ${file.path} → wrangler.toml`);
      return { ...file, path: 'wrangler.toml' };
    }

    // GitHub Actions deploy
    if (
      (lower.includes('deploy') || lower.includes('workflow') || lower.includes('cloudflare')) &&
      (lower.endsWith('.yml') || lower.endsWith('.yaml'))
    ) {
      console.log(`🔄 Rewriting ${file.path} → .github/workflows/deploy.yml`);
      return { ...file, path: '.github/workflows/deploy.yml' };
    }

    // HTML
    if (lower.endsWith('.html') && lower.includes('index')) {
      return { ...file, path: 'index.html' };
    }

    // JS
    if (lower.endsWith('.js') && (lower.includes('main') || lower.includes('app'))) {
      return { ...file, path: 'main.js' };
    }

    // CSS
    if (lower.endsWith('.css') && lower.includes('style')) {
      return { ...file, path: 'style.css' };
    }

    // Backend route handler (Cloudflare Worker entry)
    if (
      lower.endsWith('.ts') &&
      lower.includes('index') &&
      (lower.includes('function') || lower.includes('backend') || lower.includes('api'))
    ) {
      console.log(`🔄 Rewriting ${file.path} → functions/index.ts`);
      return { ...file, path: 'functions/index.ts' };
    }

    return file;
  });
}