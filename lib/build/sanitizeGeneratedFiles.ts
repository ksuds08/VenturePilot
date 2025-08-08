// lib/build/sanitizeGeneratedFiles.ts

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
  return /<!DOCTYPE html>|<html[\s>]/i.test(t) || /<\/?(head|body|div|main|section|script)\b/i.test(t);
}
function isLikelyCSS(s: string) {
  const t = s.trim();
  return (!/</.test(t) && /[{}]/.test(t)) || /^\/\*[\s\S]*\*\/\s*$/.test(t);
}
function isLikelyJS(s: string) {
  const t = s.trim();
  return /(export|import|function|const|let|var|=>)\s/.test(t);
}
function isLikelyTS(s: string) {
  const t = s.trim();
  return isLikelyJS(t) || /:\s*(string|number|boolean|any|unknown|Record<|Promise<)/.test(t);
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
  // Remove markdown/prose bullets, headings, and lines that explain "This file/handler ..."
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

    // Typical “To manage …” prose. Allow if it ends with semicolon (code), else drop.
    if (/^To\s+/i.test(trimmed) && !/[;{]$/.test(trimmed)) continue;

    filtered.push(line);
  }
  return filtered.join("\n").trim();
}

function normalizePath(p: string): string {
  return (p || "").replace(/^\.?\/+/, "").replace(/\\/g, "/");
}

// Heuristic “is this basically empty code?” check per type
function isEffectivelyEmptyCode(content: string, kind: "html" | "css" | "js" | "ts"): boolean {
  const t = (content || "").trim();
  if (!t) return true;

  if (kind === "html") {
    // require some HTML tags
    return !(/<\/?(html|head|body|div|main|section|script|link|meta)\b/i.test(t));
  }
  if (kind === "css") {
    // require at least one rule block
    return !(/[^{]+\{[^}]*\}/.test(t));
  }
  // js/ts — require some structural tokens
  return !(/(export|import|function|const|let|var|=>|return\s+)/.test(t));
}

function ensurePublicPaths(path: string, content: string): string {
  const p = normalizePath(path);
  const lower = p.toLowerCase();

  const looksHTML = isLikelyHTML(content) || /\.(html?)$/i.test(lower);
  const looksCSS  = isLikelyCSS(content)  || /\.(css)$/i.test(lower);
  const looksJS   = isLikelyJS(content)   || /\.(m?jsx?)$/i.test(lower) || isLikelyTS(content);

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

function defaultIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>LaunchWing MVP</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main class="container">
    <h1>LaunchWing MVP</h1>
    <p>App scaffold generated.</p>
  </main>
  <script src="/app.js"></script>
</body>
</html>`.trim();
}

function defaultStylesCss(): string {
  return `:root { --fg:#222; --bg:#f7f7f7; --brand:#0066cc; }
*{box-sizing:border-box} body{margin:0;font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;color:var(--fg);background:var(--bg)}
.container{max-width:840px;margin:3rem auto;padding:0 1rem}
h1{color:var(--brand)}`.trim();
}

function defaultAppJs(): string {
  return `window.addEventListener("DOMContentLoaded",()=>{ console.log("LaunchWing MVP ready"); });`.trim();
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

function defaultDeployYaml(): string {
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

function makeWranglerToml(projectName: string, accountId?: string, hasPublic = true): string {
  const today = new Date().toISOString().slice(0, 10);
  let toml = `name = "${projectName}"
main = "functions/index.ts"
compatibility_date = "${today}"`;
  if (accountId) toml += `\naccount_id = "${accountId}"`;
  if (hasPublic) {
    toml += `

[site]
bucket = "./public"`;
  }
  return toml;
}

/* ---------------------- backend merge (Worker) ---------------------- */

function extractDefaultWorker(content: string): string | null {
  const m = content.match(/export\s+default\s+\{[\s\S]*?\}\s*;?/m);
  return m ? m[0] : null;
}

function mergeBackend(chunks: string[]): string {
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
  const seen = new Set<string>();

  const accountId = meta.env.CLOUDFLARE_ACCOUNT_ID;

  // 1) Normalize & clean each incoming file; drop effectively-empty code
  const staged: FileOutput[] = [];
  for (const { path, content } of files) {
    const p0 = normalizePath(path || "");
    const c0 = TRIM_BOM(content || "");

    // package.json special-case
    if (/\/?package\.json$/i.test(p0)) {
      const valid = isJSON(c0) ? c0 : minimalPackageJson();
      staged.push({ path: "package.json", content: valid });
      continue;
    }

    const looksCodeLike =
      /\.(m?jsx?|tsx?|css|html?)$/i.test(p0) ||
      isLikelyJS(c0) ||
      isLikelyTS(c0) ||
      isLikelyHTML(c0) ||
      isLikelyCSS(c0);

    const cleaned = looksCodeLike ? cleanProseFromCode(c0) : c0;

    let finalPath = ensurePublicPaths(p0, cleaned);

    // Decide type for emptiness check
    let kind: "html" | "css" | "js" | "ts" | null = null;
    const lower = finalPath.toLowerCase();
    if (/\.(html?)$/.test(lower) || isLikelyHTML(cleaned)) kind = "html";
    else if (/\.(css)$/.test(lower) || isLikelyCSS(cleaned)) kind = "css";
    else if (/\.(tsx?)$/.test(lower) || isLikelyTS(cleaned)) kind = "ts";
    else if (/\.(m?jsx?)$/.test(lower) || isLikelyJS(cleaned)) kind = "js";

    if (kind && isEffectivelyEmptyCode(cleaned, kind)) {
      console.warn(`⚠️ Skipping empty ${kind.toUpperCase()} after cleanup: ${finalPath}`);
      continue; // 🚫 drop effectively-empty code files
    }

    staged.push({ path: finalPath, content: cleaned });
  }

  // 2) Split/collect
  const backendChunks: string[] = [];
  const keepers: FileOutput[] = [];

  for (const f of staged) {
    if (/^functions\//i.test(f.path)) {
      // Clean any prose in worker files too
      const cleaned = cleanProseFromCode(f.content);
      backendChunks.push(cleaned);
      keepers.push({ path: f.path, content: cleaned });
      continue;
    }

    if (/chunk_/i.test(f.path) || /backend\//i.test(f.path)) {
      backendChunks.push(f.content);
      continue;
    }

    keepers.push(f);
  }

  // 3) Ensure one proper Worker entry
  const hasWorker = keepers.some(f => f.path === "functions/index.ts");
  if (!hasWorker) {
    const merged = mergeBackend(backendChunks);
    keepers.push({ path: "functions/index.ts", content: merged });
  }

  // 4) If any HTML/CSS/JS at repo root, move to public/
  const moved: FileOutput[] = [];
  for (const f of keepers) {
    let p = f.path;
    if (!/^public\//i.test(p) && !/^functions\//i.test(p)) {
      const lower = p.toLowerCase();
      if (/\.(html?|css|m?jsx?|tsx?)$/.test(lower)) {
        p = ensurePublicPaths(p, f.content);
      }
    }
    moved.push({ path: p, content: f.content });
  }

  // 5) Deduplicate (last write wins)
  for (const f of moved) {
    const idx = out.findIndex(x => x.path === f.path);
    if (idx >= 0) out.splice(idx, 1);
    out.push(f);
    seen.add(f.path);
  }

  // 6) Ensure workflow exists (uses correct secret/action)
  if (!out.some(f => f.path === ".github/workflows/deploy.yml")) {
    out.push({
      path: ".github/workflows/deploy.yml",
      content: defaultDeployYaml(),
    });
  }

  // 7) Ensure wrangler.toml exists and is usable
  const hasPublic = out.some(f => /^public\//i.test(f.path));
  if (!out.some(f => f.path === "wrangler.toml")) {
    out.push({
      path: "wrangler.toml",
      content: makeWranglerToml(`mvp-${meta.ideaId}`, accountId, hasPublic),
    });
  } else {
    // Patch existing wrangler.toml: add [site] if public/, add account_id if provided
    const idx = out.findIndex(f => f.path === "wrangler.toml");
    let toml = out[idx].content;

    if (accountId && !/^\s*account_id\s*=/.test(toml)) {
      toml = toml.replace(/\bname\s*=\s*".*?"/, (m) => `${m}\naccount_id = "${accountId}"`);
    }
    if (hasPublic && !/\[site\][\s\S]*bucket\s*=/.test(toml)) {
      toml += `

[site]
bucket = "./public"`;
    }
    out[idx] = { path: "wrangler.toml", content: toml };
  }

  // 8) Guarantee non‑empty public assets
  const ensureAsset = (path: string, fallback: string) => {
    const idx = out.findIndex(f => f.path === path);
    if (idx === -1) {
      out.push({ path, content: fallback });
    } else {
      const cleaned = out[idx].content.trim();
      if (!cleaned) {
        console.warn(`⚠️ Replacing empty asset: ${path}`);
        out[idx] = { path, content: fallback };
      }
    }
  };

  ensureAsset("public/index.html", defaultIndexHtml());
  ensureAsset("public/styles.css", defaultStylesCss());
  ensureAsset("public/app.js", defaultAppJs());

  return out;
}