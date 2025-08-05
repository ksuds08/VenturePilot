export function sanitizeGeneratedFiles(
  files: { path: string; content: string }[]
): { path: string; content: string }[] {
  return files.map((file) => {
    const lower = file.path.toLowerCase();

    // Normalize wrangler.toml
    if (lower.includes('wrangler') && lower.endsWith('.toml')) {
      console.log(`🔄 Rewriting ${file.path} → wrangler.toml`);
      return { ...file, path: 'wrangler.toml' };
    }

    // Normalize GitHub Actions workflow
    if (
      (lower.includes('deploy') || lower.includes('workflow') || lower.includes('cloudflare')) &&
      (lower.endsWith('.yml') || lower.endsWith('.yaml'))
    ) {
      console.log(`🔄 Rewriting ${file.path} → .github/workflows/deploy.yml`);
      return { ...file, path: '.github/workflows/deploy.yml' };
    }

    // Normalize entry HTML file
    if (lower.endsWith('.html') && lower.includes('index')) {
      console.log(`🔄 Rewriting ${file.path} → index.html`);
      return { ...file, path: 'index.html' };
    }

    // Normalize main JS entry
    if (lower.endsWith('.js') && (lower.includes('main') || lower.includes('app'))) {
      console.log(`🔄 Rewriting ${file.path} → main.js`);
      return { ...file, path: 'main.js' };
    }

    // Normalize main CSS
    if (lower.endsWith('.css') && lower.includes('style')) {
      console.log(`🔄 Rewriting ${file.path} → style.css`);
      return { ...file, path: 'style.css' };
    }

    return file;
  });
}