// lib/build/sanitizeGeneratedFiles.ts

import { generateWranglerToml } from "./generateWranglerToml";

type FileInput = { path: string; content: string };
type FileOutput = { path: string; content: string };

type Meta = {
  ideaId: string;
  env: Record<string, string | undefined>;
};

/* -------------------------- tiny helpers -------------------------- */

const TRIM_BOM = (s: string) => s.replace(/^\uFEFF/, "");

function isLikelyHTML(s: string) {
  const t = s.trim().slice(0, 2000);
  return /<!DOCTYPE html>|<html[\s>]/i.test(t);
}
function isLikelyCSS(s: string) {
  const t = s.trim();
  return (
    (!/</.test(t) && /[{};]/.test(t) && /[:;]/.test(t)) ||
    /^\/\*[\s\S]*\*\/\s*$/.test(t)
  );
}
function isLikelyJS(s: string) {
  const t = s.trim();
  return /(export|import|function|const|let|var)\s/.test(t) || /=>/.test(t);
}
function isLikelyTS(s: string) {
  const t = s.trim();
  return isLikelyJS(t) || /:\s*(string|number|boolean|any|unknown|Record<)/.test(t);
}
function isJSON(s: string) {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

function cleanProseFromCode(content: string): string {
  // Remove markdown/prose bullets, headings, and lines that explain “This file/handler …”
  const lines = TRIM_BOM(content).split("\n");
  const filtered: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();

    if (!trimmed) continue; // drop empty

    // Obvious markdown / prose
    if (/^#{1,6}\s+/.test(trimmed)) continue;
    if (/^[-*+]\s+/.test(trimmed)) continue;
    if (/^\d+[\.\)]\s+/.test(trimmed)) continue;
    if (/^>/.test(trimmed)) continue;
    if (/^\*\*[^\*]+\*\*$/.test(trimmed)) continue;
    if (/^(This|The|It)\s+(file|handler|function|component)\b/i.test(trimmed)) continue;
    if (/^(Purpose|Description|Notes?):/i.test(trimmed)) continue;

    // “To manage …”, “To configure …” etc (not code)
    if (/^To\s+[A-Z]/.test(trimmed) && !/[;{}()=]$/.test(trimmed)) continue;

    filtered.push(line);
  }
  return filtered.join("\n").trim();
}

function normalizePath(p: string): string {
  return (p || "").replace(/^\.?\/+/, "").replace(/\\/g, "/");
}

function ensurePublicPaths(path: string, content: string): string {
  const p = normalizePath(path);
  const lower = p.toLowerCase();

  const looksHTML = isLikelyHTML(content) || /\.(html?)$/i.test(lower);
  const looksCSS = isLikelyCSS(content) || /\.(css)$/i.test(lower);
  const looksJS  = isLikelyJS(content)  || /\.(m?jsx?)$/i.test(lower);

  // Already under public/ or backend folder (leave backend alone)
  if (/^public\//i.test(p) || /^functions\//i.test(p)) return p;

  if (looksHTML) return "public/index.html";
  if (looksCSS)  return "public/styles.css";
  if (looksJS)   return "public/app.js";

  return p;
}

function minimalPackageJson(): string {
  return JSON.stringify(
    {
      name: "launchwing-mvp",
      private: true,
      type: "module",
      scripts: {
        build: "echo 'No build step required'",
      },
    },
    null,
    2
  );
}

function defaultDeployYaml(): string {
  // Official action; no wranglerVersion pin. Expects secret CLOUDFLARE_API_TOKEN.
  return `name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`.trim();
}

function defaultWorker(): string {
  return `export default {
  async fetch(request: Request, env: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const path = url.pathname === "/" ? "/index.html" : url.pathname;

      if (env.ASSETS) {
        const key = path.startsWith("/") ? path.slice(1) : path;
        const content = await env.ASSETS.get(key, { type: "text" });
        if (content) {
          return new Response(content, {
            headers: { "Content-Type": getContentType(key) },
          });
        }
      }
      return new Response("Hello from LaunchWing!", {
        headers: { "Content-Type": "text/plain" }
      });
    } catch (err) {
      return new Response("Internal Error", { status: 500 });
    }
  }
};

function getContentType(file: string): string {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".js")) return "application/javascript";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  return "text/plain";
}
`.trim();
}

function makeIndexHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>LaunchWing MVP</title>
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="container">
    <h1>LaunchWing MVP</h1>
    <p>App scaffold generated.</p>
  </main>
  <script src="/app.js"></script>
</body>
</html>`;
}

function minimalStylesCss(): string {
  return `.container{max-width:800px;margin:2rem auto;padding:0 1rem;font-family:sans-serif}
h1{font-size:1.9rem;margin-bottom:.5rem}
p{color:#444}`;
}

function minimalAppJs(): string {
  return `(function(){console.log("LaunchWing MVP scaffold loaded");})();`;
}

/* ---------------------- backend merge (Worker) ---------------------- */

function extractDefaultWorker(content: string): string | null {
  // If there's already an `export default { fetch(..` block, keep the first one.
  const m = content.match(/export\s+default\s+\{[\s\S]*?\}\s*;?/m);
  return m ? m[0] : null;
}

function mergeBackend(chunks: string[]): string {
  // Try to find a valid default worker among chunks; otherwise fall back.
  for (const raw of chunks) {
    const cleaned = cleanProseFromCode(raw);
    const existing = extractDefaultWorker(cleaned);
    if (existing) return existing.trim();
  }
  return defaultWorker();
}

/* ----------------------------- main API ----------------------------- */

export function sanitizeGeneratedFiles(
  files: FileInput[],
  meta: Meta
): FileOutput[] {
  const out: FileOutput[] = [];

  const accountId = meta.env.CLOUDFLARE_ACCOUNT_ID;

  // 1) Normalize & clean each incoming file
  const staged: FileOutput[] = [];
  for (const { path, content } of files) {
    const p0 = normalizePath(path || "");
    const c0 = TRIM_BOM(content || "");

    // package.json gets special handling (must be valid JSON)
    if (/\/?package\.json$/i.test(p0)) {
      const valid = isJSON(c0) ? c0 : minimalPackageJson();
      staged.push({ path: "package.json", content: valid });
      continue;
    }

    const codeLike =
      /\.(m?jsx?|tsx?|css|html?)$/i.test(p0) ||
      isLikelyJS(c0) ||
      isLikelyTS(c0) ||
      isLikelyHTML(c0) ||
      isLikelyCSS(c0);

    const cleaned = codeLike ? cleanProseFromCode(c0) : c0;

    // ⛔️ Skip files that are effectively empty after cleanup (prevents blank public/*)
    if (codeLike && cleaned.trim().length === 0) {
      console.warn(`Skipping empty file after cleanup: ${p0}`);
      continue;
    }

    // Normalize frontend assets into public/
    const p1 = ensurePublicPaths(p0, cleaned);

    staged.push({ path: p1, content: cleaned });
  }

  // 2) Split into buckets
  const backendChunks: string[] = [];
  const keepers: FileOutput[] = [];

  for (const f of staged) {
    // Anything under functions/ stays as-is (assume it's backend code)
    if (/^functions\//i.test(f.path)) {
      backendChunks.push(f.content);
      keepers.push(f);
      continue;
    }

    // Chunky names (like backend/chunk_*, components/chunk_*) → bucket by content
    if (/chunk_/i.test(f.path) || /backend\//i.test(f.path)) {
      backendChunks.push(f.content);
      continue;
    }

    // Frontend & others
    keepers.push(f);
  }

  // 3) Ensure a proper Worker entry: functions/index.ts (merge backend chunks)
  const hasWorker = keepers.some(f => f.path === "functions/index.ts");
  if (!hasWorker) {
    const merged = mergeBackend(backendChunks);
    keepers.push({ path: "functions/index.ts", content: merged });
  } else {
    // Even if present, clean it to remove prose
    for (let i = 0; i < keepers.length; i++) {
      if (keepers[i].path === "functions/index.ts") {
        keepers[i] = {
          path: "functions/index.ts",
          content: cleanProseFromCode(keepers[i].content),
        };
        break;
      }
    }
  }

  // 4) If any HTML/CSS/JS landed at repo root, move to public/
  const moved: FileOutput[] = [];
  for (const f of keepers) {
    let p = f.path;
    if (!/^public\//i.test(p) && !/^functions\//i.test(p)) {
      const lower = p.toLowerCase();
      if (/\.(html?|css|m?jsx?)$/.test(lower)) {
        p = ensurePublicPaths(p, f.content);
      }
    }
    moved.push({ path: p, content: f.content });
  }

  // 5) Deduplicate by last write wins
  for (const f of moved) {
    const idx = out.findIndex((x) => x.path === f.path);
    if (idx >= 0) out.splice(idx, 1);
    out.push(f);
  }

  // 6) Ensure workflow exists and is correct
  if (!out.some(f => f.path === ".github/workflows/deploy.yml")) {
    out.push({
      path: ".github/workflows/deploy.yml",
      content: defaultDeployYaml(),
    });
  }

  // 7) Ensure wrangler.toml exists and is normalized.
  //    We fully replace any AI-provided file to keep it consistent with buildService.
  const hasPublic = out.some(f => /^public\//i.test(f.path));
  const wranglerContent = generateWranglerToml({
    projectName: `mvp-${meta.ideaId}`,
    accountId,
    // Don't pass kvId here; buildService will ensure/create ASSETS KV and append the [[kv_namespaces]] block.
    hasPublic
  });

  const wranglerIdx = out.findIndex(f => f.path === "wrangler.toml");
  if (wranglerIdx === -1) {
    out.push({ path: "wrangler.toml", content: wranglerContent });
  } else {
    out[wranglerIdx] = { path: "wrangler.toml", content: wranglerContent };
  }

  // 8) Guarantee at least one HTML asset (index) so Workers Sites doesn’t fail
  let hasIndexHtml = out.some(f => f.path === "public/index.html");
  if (!hasIndexHtml) {
    out.push({ path: "public/index.html", content: makeIndexHtml() });
    hasIndexHtml = true;
  }

  // 9) If index.html references styles.js/app.js, ensure they exist with minimal content
  const hasStyles = out.some(f => f.path === "public/styles.css");
  const hasAppJs = out.some(f => f.path === "public/app.js");

  if (hasIndexHtml && !hasStyles) {
    out.push({ path: "public/styles.css", content: minimalStylesCss() });
  }
  if (hasIndexHtml && !hasAppJs) {
    out.push({ path: "public/app.js", content: minimalAppJs() });
  }

  return out;
}