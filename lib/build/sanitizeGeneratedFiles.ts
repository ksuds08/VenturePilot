export function sanitizeGeneratedFiles(
  files: { path: string; content: string }[]
): { path: string; content: string }[] {
  return files.map((file) => {
    const lower = file.path.toLowerCase();

    // Normalize wrangler.toml
    if (lower.includes('wrangler') && lower.endsWith('.toml')) {
      return { ...file, path: 'wrangler.toml' };
    }

    // Normalize deploy workflow
    if (
      lower.includes('deploy') &&
      (lower.endsWith('.yml') || lower.endsWith('.yaml'))
    ) {
      return { ...file, path: '.github/workflows/deploy.yml' };
    }

    // Normalize entry HTML
    if (lower.includes('index') && lower.endsWith('.html')) {
      return { ...file, path: 'index.html' };
    }

    // Normalize JS
    if (lower.endsWith('.js') && lower.includes('main') || lower.includes('app')) {
      return { ...file, path: 'main.js' };
    }

    // Normalize styles
    if (lower.endsWith('.css') && lower.includes('style')) {
      return { ...file, path: 'style.css' };
    }

    return file;
  });
}