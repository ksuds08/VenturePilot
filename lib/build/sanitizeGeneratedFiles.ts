// lib/build/sanitizeGeneratedFiles.ts

import { generateWranglerToml } from "../generate/generateWranglerToml";

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

/* ------------------- wrangler.toml patch helpers ------------------- */

function upsertTomlScalar(toml: string, key: string, value: string): string {
  const line = `${key} = "${value}"`;
  const keyRe = new RegExp(`^\\s*${key}\\s*=.*$`, "m");

  if (keyRe.test(toml)) {
    // Replace the first occurrence
    toml = toml.replace(keyRe, line);
    // Deduplicate stray repeats
    const rows = toml.split("\n");
    const out: string[] = [];
    let seen = false;
    for (const r of rows) {
      if (new RegExp(`^\\s*${key}\\s*=`).test(r)) {
        if (seen) continue;
        seen = true;
      }
      out.push(r);
    }
    return out.join("\n");
  }

  // Insert after name="…" if present; else append
  const nameRe = /^\s*name\s*=\s*".*?"\s*$/m;
  if (nameRe.test(toml)) {
    return toml.replace(nameRe, (m) => `${m}\n${line}`);
  }
  return toml.trimEnd() + `\n${line}\n`;
}

function ensureSiteBucket(toml: string): string {
  if (/\[site\][\s\S]*bucket\s*=/.test(toml)) return toml;
  return toml.trimEnd() + `

[site]
bucket = "./public"
`;
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

/* ----------------------------- main API ----------------------------- */

export function sanitizeGeneratedFiles(
  files: FileInput[],
  meta: Meta
): FileOutput[] {
  const out: FileOutput[] = [];
  const seen = new Set<string>();

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
      // eslint-disable-next-line no-console
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
    seen.add(f.path);
  }

  // 6) Ensure workflow exists and is correct (export token + Node 20 + deploy)
  if (!out.some(f => f.path === ".github/workflows/deploy.yml")) {
    out.push({
      path: ".github/workflows/deploy.yml",
      content: `name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      deployments: write
      id-token: write
    env:
      CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Use Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install deps (best-effort)
        run: npm ci || true

      - name: Deploy with Wrangler
        uses: cloudflare/wrangler-action@v3
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
`.trim(),
    });
  }

  // 7) Ensure wrangler.toml exists and is usable (prefer calling generator)
  const hasPublic = out.some(f => /^public\//i.test(f.path));
  if (!out.some(f => f.path === "wrangler.toml")) {
    out.push({
      path: "wrangler.toml",
      content: generateWranglerToml(`mvp-${meta.ideaId}`, accountId, undefined, hasPublic),
    });
  } else {
    const idx = out.findIndex(f => f.path === "wrangler.toml");
    let toml = out[idx].content;

    // Keep patchers for robustness when agent produced a partial toml
    if (accountId) {
      toml = upsertTomlScalar(toml, "account_id", accountId);
    }
    if (hasPublic) {
      toml = ensureSiteBucket(toml);
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

  return out;
}