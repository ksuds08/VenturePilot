// build/sanitizeGeneratedFiles.ts

type FileInput = { path: string; content: string };
type FileOutput = { path: string; content: string };

function isJSONLike(text: string) {
  const t = text.trim();
  return t.startsWith("{") || t.startsWith("[");
}

/**
 * Cleans up raw backend chunks and removes markdown, explanations, prose,
 * and duplicate onRequest() function blocks.
 */
function cleanBackendChunk(content: string): string {
  const lines = content.split("\n");
  const filteredLines: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();

    // remove empty lines & obvious prose/markdown
    if (!trimmed) continue;
    if (/^\/\//.test(trimmed)) continue;                   // // comments
    if (/^#+\s/.test(trimmed)) continue;                   // # headings
    if (/^\d+[\.\)]\s/.test(trimmed)) continue;            // 1. lists
    if (/^\*\*.*\*\*$/.test(trimmed)) continue;            // **bold**
    if (/^(This|The)\s.+(handler|function|file)/i.test(trimmed)) continue; // “This file …”
    if (/^[A-Z][\w\s]+[\.!?]$/.test(trimmed)) continue;    // Sentence-like single line

    filteredLines.push(line);
  }

  let cleaned = filteredLines.join("\n");

  // De-duplicate onRequest() blocks (keep first)
  const re = /export\s+async\s+function\s+onRequest[^{]*\{[\s\S]*?\n\}/gm;
  const matches = [...cleaned.matchAll(re)];
  if (matches.length > 1) {
    console.warn(`⚠️ Found ${matches.length} onRequest() blocks — removing duplicates.`);
    let kept = false;
    cleaned = cleaned.replace(re, (match) => {
      if (!kept) {
        kept = true;
        return match;
      }
      return "";
    });
  }

  return cleaned.trim();
}

function ensureValidPackageJSON(content: string): string {
  const trimmed = (content || "").trim();
  if (isJSONLike(trimmed)) return trimmed;

  // If the model wrote prose like "To manage project dependencies..."
  // replace with a minimal, valid package.json
  return JSON.stringify(
    {
      name: "launchwing-app",
      private: true,
      version: "0.0.1",
      scripts: {
        build: "echo 'no build step'",
        start: "echo 'no start script'",
      },
    },
    null,
    2
  );
}

/**
 * If the model produced frontend chunk files, map them to public/*.*
 * (best‑effort inference).
 */
function inferFrontendFiles(chunks: FileInput[]): FileOutput[] {
  return chunks.map((chunk, index) => {
    const raw = (chunk.content || "").trim();
    let ext = "js";

    if (raw.startsWith("<!DOCTYPE") || raw.startsWith("<html")) {
      ext = "html";
    } else if (
      // crude CSS detection
      (/^\s*(@import|:root|html|body|[.#][A-Za-z0-9_-]+\s*\{)/m.test(raw) &&
        /{[\s\S]*}/.test(raw)) ||
      raw.endsWith("}")
    ) {
      ext = "css";
    }

    const base = ["index", "styles", "app"][index] || `file${index}`;
    const path = `public/${base}.${ext}`;
    return { path, content: raw };
  });
}

function hasFile(files: FileOutput[], filename: string): boolean {
  return files.some((f) => f.path === filename);
}

// If a deploy.yml exists but uses the wrong secret or old v3 flow, patch it.
function patchDeployWorkflow(path: string, content: string): { path: string; content: string } {
  const fixedSecret = content.replace(/CF_API_TOKEN/g, "CLOUDFLARE_API_TOKEN");

  // If it already uses cloudflare/wrangler-action, make sure we pin Wrangler v4
  if (/cloudflare\/wrangler-action@/i.test(fixedSecret)) {
    if (!/wranglerVersion:/i.test(fixedSecret)) {
      return {
        path,
        content: fixedSecret.replace(
          /with:\s*\n([\s\S]*?)apiToken:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/i,
          (m) => `${m}\n          wranglerVersion: '4'`
        ),
      };
    }
    return { path, content: fixedSecret };
  }

  // Otherwise replace with a minimal, known‑good v4 workflow
  return {
    path,
    content: `name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy with Wrangler v4
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          wranglerVersion: '4'
`.trim(),
  };
}

export function sanitizeGeneratedFiles(
  files: FileInput[],
  meta: { ideaId: string; env: Record<string, string | undefined> }
): FileOutput[] {
  const sanitized: FileOutput[] = [];

  const env = meta.env || {};
  const projectName = meta.ideaId || "app";
  const apiToken = env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;

  console.log("DEBUG: CLOUDFLARE_ACCOUNT_ID =", accountId);
  console.log("DEBUG: CLOUDFLARE_API_TOKEN =", apiToken ? "[REDACTED]" : "undefined");

  // Partition content
  const frontendChunks = files.filter((f) => f.path.startsWith("frontend/"));
  const backendChunks = files.filter((f) => f.path.startsWith("backend/"));
  const otherFiles = files.filter((f) => !f.path.startsWith("frontend/") && !f.path.startsWith("backend/"));

  // Convert frontend chunks → public/*.*
  const frontendFiles = inferFrontendFiles(frontendChunks);
  sanitized.push(...frontendFiles);

  // Merge backend chunks → functions/index.ts (module worker or pages functions)
  const mergedBackend = backendChunks.map((f) => cleanBackendChunk(f.content)).filter(Boolean).join("\n\n");
  if (mergedBackend) {
    sanitized.push({
      path: "functions/index.ts",
      content: `// Auto-generated by sanitizeGeneratedFiles\n${mergedBackend}\n`,
    });
  }

  // Bring across the rest, but patch unsafe configs
  for (const f of otherFiles) {
    // Fix deploy workflow if present
    if (f.path === ".github/workflows/deploy.yml") {
      const patched = patchDeployWorkflow(f.path, f.content || "");
      sanitized.push(patched);
      continue;
    }

    // Fix obviously invalid package.json
    if (f.path === "package.json") {
      sanitized.push({ path: f.path, content: ensureValidPackageJSON(f.content || "") });
      continue;
    }

    sanitized.push({ path: f.path, content: (f.content || "").trim() });
  }

  // Ensure a landing page exists
  if (!hasFile(sanitized, "public/index.html")) {
    console.warn("⚠️ Missing public/index.html — injecting baseline index");
    sanitized.push({
      path: "public/index.html",
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>LaunchWing App</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; margin: 2rem; }
      .muted { color: #666; }
    </style>
  </head>
  <body>
    <h1>👋 Your app is live</h1>
    <p class="muted">This placeholder was injected by the sanitizer. Replace it with real frontend files.</p>
  </body>
</html>`.trim(),
    });
  }

  // Ensure a Worker entry exists
  if (!hasFile(sanitized, "functions/index.ts")) {
    console.warn("⚠️ Missing functions/index.ts — injecting fallback Worker (module syntax)");
    sanitized.push({
      path: "functions/index.ts",
      content: `export default {
  async fetch(_req: Request, _env: any) {
    return new Response("Hello from LaunchWing!", { headers: { "Content-Type": "text/plain" } });
  }
};`,
    });
  }

  // Inject Wrangler v4 config (assets) if missing
  if (!hasFile(sanitized, "wrangler.toml")) {
    console.warn("⚠️ Missing wrangler.toml — injecting fallback");
    sanitized.push({
      path: "wrangler.toml",
      content: `
name = "mvp-${projectName}"
${accountId ? `account_id = "${accountId}"` : `# account_id = "YOUR_ACCOUNT_ID_HERE"`}
main = "functions/index.ts"
compatibility_date = "2024-08-01"

[assets]
directory = "./public"
`.trim(),
    });
  } else {
    // If a wrangler.toml exists but still uses deprecated `[site]` or `usage_model`, do a light cleanup.
    const wrangler = sanitized.find((f) => f.path === "wrangler.toml")!;
    let c = wrangler.content;

    // Remove deprecated usage_model if present
    c = c.replace(/^\s*usage_model\s*=.*$/gim, "").trim();

    // Convert old [site] to [assets]
    if (/\[site\]/i.test(c)) {
      c = c
        .replace(/\[site\][\s\S]*?bucket\s*=\s*["']\.\/public["'][\s\S]*?(?=\n\[|$)/gi, "")
        .trim();
      if (!/\[assets\]/i.test(c)) {
        c += `

[assets]
directory = "./public"`;
      }
      wrangler.content = c.trim();
    } else {
      wrangler.content = c;
    }
  }

  // Ensure a deploy workflow exists (v4) if missing
  if (!hasFile(sanitized, ".github/workflows/deploy.yml")) {
    console.warn("⚠️ Missing deploy.yml — injecting fallback (Wrangler v4)");
    sanitized.push({
      path: ".github/workflows/deploy.yml",
      content: `name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy with Wrangler v4
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          wranglerVersion: '4'
`.trim(),
    });
  }

  if (!apiToken) {
    console.error("❌ Missing Cloudflare API token — deployment will require a repo secret named CLOUDFLARE_API_TOKEN.");
  }

  return sanitized;
}