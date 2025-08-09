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
  const lines = TRIM_BOM(content).split("\n");
  const filtered: string[] = [];
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^#{1,6}\s+/.test(trimmed)) continue;
    if (/^[-*+]\s+/.test(trimmed)) continue;
    if (/^\d+[\.\)]\s+/.test(trimmed)) continue;
    if (/^>/.test(trimmed)) continue;
    if (/^\*\*[^\*]+\*\*$/.test(trimmed)) continue;
    if (/^(This|The|It)\s+(file|handler|function|component)\b/i.test(trimmed)) continue;
    if (/^(Purpose|Description|Notes?):/i.test(trimmed)) continue;
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
      scripts: { build: "echo 'No build step required'" },
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
    toml = toml.replace(keyRe, line);
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

  const nameRe = /^\s*name\s*=\s*".*?"\s*$/m;
  if (nameRe.test(toml)) return toml.replace(nameRe, (m) => `${m}\n${line}`);
  return toml.trimEnd() + `\n${line}\n`;
}

function ensureSiteBucket(toml: string): string {
  if (/\[site\][\s\S]*bucket\s*=/.test(toml)) return toml;
  return toml.trimEnd() + `

[site]
bucket = "./public"
`;
}

function todayISO(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
    } catch {
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

/* ---------------------- workflow patch helpers ---------------------- */

function ensureDeployWorkflow(body: string): string {
  let out = body;

  // Ensure it's wrangler-action@v3
  out = out.replace(
    /uses:\s*cloudflare\/wrangler-action@v[0-9.]+/g,
    "uses: cloudflare/wrangler-action@v3"
  );

  // Force Node 20 setup (add if missing)
  if (!/uses:\s*actions\/setup-node@v4/.test(out)) {
    out = out.replace(
      /- name:\s*Checkout[\s\S]*?uses:\s*actions\/checkout@v4\s*\n/,
      (m) => `${m}\n      - name: Use Node 20\n        uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n`
    );
  } else {
    out = out.replace(
      /uses:\s*actions\/setup-node@v4[\s\S]*?node-version:\s*['"]?\d+['"]?/,
      "uses: actions/setup-node@v4\n        with:\n          node-version: '20'"
    );
  }

  // Replace publish with deploy in the action input
  // 1) If the action uses "with: command: <...>", normalize to deploy
  out = out.replace(/command:\s*publish/g, "command: deploy");

  // 2) If the action is called without "with", inject it
  if (!/with:\s*[\s\S]*command:\s*(deploy|publish)/.test(out)) {
    out = out.replace(
      /uses:\s*cloudflare\/wrangler-action@v3[^\n]*\n/,
      (m) => `${m}        with:\n          command: deploy\n`
    );
  }

  // Ensure the token is passed via input (more reliable than only env)
  if (!/with:\s*[\s\S]*apiToken:/.test(out)) {
    out = out.replace(
      /with:\s*\n(\s*)/,
      (_m, indent) =>
        `with:\n${indent}  apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}\n${indent}`
    );
  } else {
    out = out.replace(
      /apiToken:\s*.+/g,
      "apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}"
    );
  }

  // Keep job-level env (doesn't hurt), add if missing
  if (!/CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/.test(out)) {
    out = out.replace(
      /permissions:\s*[\s\S]*?\n\s*steps:/m,
      (m) =>
        `${m}\n      env:\n        CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}\n`
    );
  }

  return out;
}

/* ----------------------------- main API ----------------------------- */

export function sanitizeGeneratedFiles(
  files: FileInput[],
  meta: Meta
): FileOutput[] {
  const out: FileOutput[] = [];
  const seen = new Set<string>();

  const accountId = meta.env.CLOUDFLARE_ACCOUNT_ID;

  // 1) Normalize & clean
  const staged: FileOutput[] = [];
  for (const { path, content } of files) {
    const p0 = normalizePath(path || "");
    const c0 = TRIM_BOM(content || "");

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

    if (codeLike && cleaned.trim().length === 0) continue;

    const p1 = ensurePublicPaths(p0, cleaned);
    staged.push({ path: p1, content: cleaned });
  }

  // 2) Buckets
  const backendChunks: string[] = [];
  const keepers: FileOutput[] = [];

  for (const f of staged) {
    if (/^functions\//i.test(f.path)) {
      backendChunks.push(f.content);
      keepers.push(f);
      continue;
    }
    if (/chunk_/i.test(f.path) || /backend\//i.test(f.path)) {
      backendChunks.push(f.content);
      continue;
    }
    keepers.push(f);
  }

  // 3) Ensure Worker entry
  const hasWorker = keepers.some(f => f.path === "functions/index.ts");
  if (!hasWorker) {
    const merged = mergeBackend(backendChunks);
    keepers.push({ path: "functions/index.ts", content: merged });
  } else {
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

  // 4) Move stray assets into public/
  const moved: FileOutput[] = [];
  for (const f of keepers) {
    let p = f.path;
    if (!/^public\//i.test(p) && !/^functions\//i.test(p)) {
      const lower = p.toLowerCase();
      if (/\.(html?|css|m?jsx?)$/.test(lower)) p = ensurePublicPaths(p, f.content);
    }
    moved.push({ path: p, content: f.content });
  }

  // 5) Dedup
  for (const f of moved) {
    const idx = out.findIndex((x) => x.path === f.path);
    if (idx >= 0) out.splice(idx, 1);
    out.push(f);
    seen.add(f.path);
  }

  // 6) Ensure/patch workflow (Node 20, deploy, apiToken)
  const workflowPath = ".github/workflows/deploy.yml";
  const existingIdx = out.findIndex(f => f.path === workflowPath);
  if (existingIdx === -1) {
    out.push({
      path: workflowPath,
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

      - name: Deploy (Wrangler v4)
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: \${{ secrets.CLOUDFLARE_API_TOKEN }}
          command: deploy
`.trim(),
    });
  } else {
    out[existingIdx] = {
      path: workflowPath,
      content: ensureDeployWorkflow(out[existingIdx].content),
    };
  }

  // 7) Ensure wrangler.toml (account/site/compat date)
  const hasPublic = out.some(f => /^public\//i.test(f.path));
  const compat = todayISO();

  if (!out.some(f => f.path === "wrangler.toml")) {
    let toml = generateWranglerToml(`mvp-${meta.ideaId}`, accountId, undefined, hasPublic);
    if (accountId) toml = upsertTomlScalar(toml, "account_id", String(accountId));
    if (hasPublic) toml = ensureSiteBucket(toml);
    toml = upsertTomlScalar(toml, "compatibility_date", compat);
    out.push({ path: "wrangler.toml", content: toml });
  } else {
    const idx = out.findIndex(f => f.path === "wrangler.toml");
    let toml = out[idx].content;
    if (accountId) toml = upsertTomlScalar(toml, "account_id", String(accountId));
    if (hasPublic) toml = ensureSiteBucket(toml);
    toml = upsertTomlScalar(toml, "compatibility_date", compat);
    out[idx] = { path: "wrangler.toml", content: toml };
  }

  // 8) Ensure index.html exists
  if (!out.some(f => f.path === "public/index.html")) {
    out.push({
      path: "public/index.html",
      content: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>LaunchWing MVP</title></head>
<body><h1>LaunchWing MVP</h1><p>App scaffold generated.</p></body></html>`,
    });
  }

  return out;
}