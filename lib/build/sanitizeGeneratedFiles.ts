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
  const t = s.trim().slice(0, 1000);
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

function extForContent(s: string): "html" | "css" | "js" | "ts" {
  if (isLikelyHTML(s)) return "html";
  if (isLikelyCSS(s)) return "css";
  if (isLikelyTS(s)) return "ts";
  if (isLikelyJS(s)) return "js";
  return "js";
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
    if (/^To\s+/.test(trimmed) && !trimmed.endsWith(";")) continue; // e.g. “To manage …” prose

    filtered.push(line);
  }
  return filtered.join("\n").trim();
}

function normalizePath(p: string): string {
  return p.replace(/^\.?\/+/, "").replace(/\\/g, "/");
}

function ensurePublicPaths(path: string, content: string): string {
  const p = normalizePath(path);
  const lower = p.toLowerCase();

  // If the model put html/css/js in weird places, herd them into public/
  const looksHTML = isLikelyHTML(content) || /\.(html?)$/i.test(lower);
  const looksCSS = isLikelyCSS(content) || /\.(css)$/i.test(lower);
  const looksJS  = isLikelyJS(content)  || /\.(m?jsx?)$/i.test(lower);

  // Already under public/
  if (/^public\//i.test(p)) return p;

  if (looksHTML && !/^functions\//i.test(p)) {
    return "public/index.html";
  }
  if (looksCSS && !/^functions\//i.test(p)) {
    return "public/styles.css";
  }
  if (looksJS && !/^functions\//i.test(p)) {
    return "public/app.js";
  }

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
  const seen = new Set<string>();

  const accountId = meta.env.CLOUDFLARE_ACCOUNT_ID;
  // const apiToken = meta.env.CLOUDFLARE_API_TOKEN; // not used here; creation handled in build service

  // 1) Normalize & clean each incoming file
  const staged: FileOutput[] = files.map(({ path, content }) => {
    const p0 = normalizePath(path || "");
    const c0 = TRIM_BOM(content || "");

    // Package.json gets special handling
    if (/\/?package\.json$/i.test(p0)) {
      const valid = isJSON(c0) ? c0 : minimalPackageJson();
      return { path: "package.json", content: valid };
    }

    // Clean prose from code-y files (js/ts/html/css; leave md untouched)
    const isCodeLike =
      /\.(m?jsx?|tsx?|css|html?)$/i.test(p0) ||
      isLikelyJS(c0) ||
      isLikelyTS(c0) ||
      isLikelyHTML(c0) ||
      isLikelyCSS(c0);

    const cleaned = isCodeLike ? cleanProseFromCode(c0) : c0;

    // Shuffle frontend files into public/
    const p1 = ensurePublicPaths(p0, cleaned);

    return { path: p1, content: cleaned };
  });

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

    // Chunky names (like components/chunk_*, backend/chunk_*) → bucket by content
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
    seen.delete(f.path);
    seen.add(f.path);
    const existingIdx = out.findIndex((x) => x.path === f.path);
    if (existingIdx >= 0) out.splice(existingIdx, 1);
    out.push(f);
  }

  // 6) Ensure workflow exists (and is correct)
  if (!out.some(f => f.path === ".github/workflows/deploy.yml")) {
    out.push({
      path: ".github/workflows/deploy.yml",
      content: defaultDeployYaml(),
    });
  }

  // 7) Ensure wrangler.toml exists and is usable (site bucket, account_id if known)
  const hasPublic = out.some(f => /^public\//i.test(f.path));
  if (!out.some(f => f.path === "wrangler.toml")) {
    out.push({
      path: "wrangler.toml",
      content: makeWranglerToml(`mvp-${meta.ideaId}`, accountId, hasPublic),
    });
  } else {
    // Patch existing: add [site] if serving public, add account_id if provided
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

  // 8) Guarantee at least one HTML asset (index) so Workers Sites doesn’t fail
  const hasIndexHtml = out.some(f => f.path === "public/index.html");
  if (!hasIndexHtml) {
    out.push({
      path: "public/index.html",
      content: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LaunchWing MVP</title></head>
<body><h1>LaunchWing MVP</h1><p>App scaffold generated.</p></body></html>`,
    });
  }

  // 9) Final pass: keep README.md but ensure others aren’t plain-English “descriptions”
  // (We’ve already fixed package.json; other files will just ship as-is if not code.)
  return out;
}