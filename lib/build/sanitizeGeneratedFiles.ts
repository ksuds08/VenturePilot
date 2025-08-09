// lib/build/sanitizeGeneratedFiles.ts

export type FileInput = { path: string; content: string };
export type FileOutput = { path: string; content: string };

type Meta = {
  ideaId: string;
  env?: {
    CLOUDFLARE_ACCOUNT_ID?: string;
    CLOUDFLARE_API_TOKEN?: string; // do NOT inline; just detect/preserve behavior
    CODEGEN_MIN_HTML_BYTES?: string;
    CODEGEN_MIN_CSS_BYTES?: string;
    CODEGEN_MIN_JS_BYTES?: string;
  };
};

/**
 * Deterministic compatibility date for Wrangler.
 * Must be YYYY-MM-DD; don't use "today".
 */
function getDefaultCompatibilityDate(): string {
  // Pick a recent, fixed date to avoid CI drift.
  return "2024-11-06";
}

/**
 * Canonical deploy workflow that uses Node 20 + Wrangler v4 with `deploy`,
 * and reads CLOUDFLARE_API_TOKEN from repo secrets.
 */
function getCanonicalDeployWorkflowYml(): string {
  return [
`name: Deploy Worker

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Use Node 20
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install deps
        run: npm ci --ignore-scripts

      - name: Deploy with Wrangler 4
        uses: cloudflare/wrangler-action@v3
        with:
          command: deploy
          wranglerVersion: '4'
        env:
          CLOUDFLARE_API_TOKEN: \${{ secrets.CLOUDFLARE_API_TOKEN }}
`
  ].join("\n");
}

/**
 * Normalize path separators and trim redundant slashes.
 */
function normPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

/**
 * Ensure the repo contains a single correct deploy workflow.
 * - Overwrites any existing `.github/workflows/deploy.yml` with the canonical one.
 */
function upsertDeployWorkflow(files: FileOutput[]): FileOutput[] {
  const targetPath = ".github/workflows/deploy.yml";
  const canonical = getCanonicalDeployWorkflowYml();

  let found = false;
  const next: FileOutput[] = files.map((f) => {
    if (normPath(f.path) === targetPath) {
      found = true;
      return { path: targetPath, content: canonical };
    }
    return f;
  });

  if (!found) {
    next.push({ path: targetPath, content: canonical });
  }

  return next;
}

/**
 * Patch wrangler.toml:
 * - Ensure a real ISO date (no "today")
 * - Leave user bindings alone
 */
function patchWranglerToml(content: string): string {
  let out = content;

  // Replace compatibility_date = "today" (any quotes / spacing)
  out = out.replace(
    /compatibility_date\s*=\s*["']\s*today\s*["']/gi,
    `compatibility_date = "${getDefaultCompatibilityDate()}"`
  );

  // If no compatibility_date present at all, add one near top.
  if (!/^\s*compatibility_date\s*=.*/m.test(out)) {
    // If file is basically empty or minimal, seed a basic header
    if (!out.trim()) {
      out = `name = "worker"\nmain = "dist/worker.js"\ncompatibility_date = "${getDefaultCompatibilityDate()}"\n`;
    } else {
      out = `compatibility_date = "${getDefaultCompatibilityDate()}"\n` + out;
    }
  }

  return out;
}

/**
 * Ensure wrangler.toml exists and is valid.
 */
function upsertWranglerToml(files: FileOutput[]): FileOutput[] {
  const target = "wrangler.toml";
  let exists = false;

  const next = files.map((f) => {
    if (normPath(f.path) === target) {
      exists = true;
      return { path: target, content: patchWranglerToml(f.content || "") };
    }
    return f;
  });

  if (!exists) {
    next.push({
      path: target,
      content: patchWranglerToml(""),
    });
  }

  return next;
}

/**
 * Basic HTML/CSS/JS byte thresholds (existing behavior preserved).
 */
function getMinBytes(env?: Meta["env"]) {
  const toInt = (s?: string) => {
    const n = s ? parseInt(s, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return {
    minHtml: toInt(env?.CODEGEN_MIN_HTML_BYTES) ?? 100,
    minCss: toInt(env?.CODEGEN_MIN_CSS_BYTES) ?? 60,
    minJs: toInt(env?.CODEGEN_MIN_JS_BYTES) ?? 60,
  };
}

/**
 * Lightweight content guards (same as before).
 */
function enforceSizeMinimums(file: FileOutput, meta: Meta): FileOutput {
  const p = normPath(file.path);
  const { minHtml, minCss, minJs } = getMinBytes(meta.env);

  if (p.endsWith(".html") && file.content && file.content.length < minHtml) {
    const body = file.content.includes("<body") ? "" : "<body></body>";
    const head = file.content.includes("<head") ? "" : "<head></head>";
    file.content = `<!doctype html>\n<html>\n${head}\n${body}\n</html>\n`;
  }

  if (p.endsWith(".css") && file.content.length < minCss) {
    file.content += `\n/* minimal */\n`;
  }

  if (p.endsWith(".js") && file.content.length < minJs) {
    file.content += `\n// minimal\n`;
  }

  return file;
}

/**
 * DO NOT inline secrets. The only "Cloudflare token fix" we preserve is:
 * - The workflow references \${{ secrets.CLOUDFLARE_API_TOKEN }}
 * - We do NOT write the token into repo files.
 * We *optionally* keep account_id if it was already present in env/meta and file wants it.
 */
function maybeInjectAccountIdIntoToml(content: string, accountId?: string): string {
  if (!accountId) return content;

  // If wrangler.toml has no account_id, insert it.
  if (!/^\s*account_id\s*=.*/m.test(content)) {
    return content.replace(/^(compatibility_date.*\n)?/m, (m) => m + `account_id = "${accountId}"\n`);
  }
  return content;
}

/**
 * Public API: sanitize files for display/commit.
 * Keeps prior behavior, adds the CI/Wrangler hardening above, and avoids
 * duplicate variable declarations.
 */
export function sanitizeGeneratedFiles(
  filesIn: FileInput[],
  meta: Meta
): FileOutput[] {
  const seenPaths = new Set<string>();
  const out: FileOutput[] = [];

  // 1) Normalize list, drop dupes (first write wins)
  for (const f of filesIn || []) {
    const p = normPath(f.path);
    if (!p || seenPaths.has(p)) continue;
    seenPaths.add(p);
    out.push({ path: p, content: f.content ?? "" });
  }

  // 2) Size minimums (preserve previous behavior)
  for (let i = 0; i < out.length; i++) {
    out[i] = enforceSizeMinimums(out[i], meta);
  }

  // 3) Ensure/patch wrangler.toml (compatibility_date, optional account_id)
  let staged = upsertWranglerToml(out).map((f) => {
    if (normPath(f.path) === "wrangler.toml") {
      const accId = meta.env?.CLOUDFLARE_ACCOUNT_ID; // avoid duplicate const names
      const patched = maybeInjectAccountIdIntoToml(f.content, accId);
      return { ...f, content: patched };
    }
    return f;
  });

  // 4) Ensure canonical deploy workflow (Node 20 + Wrangler 4 + deploy + token via secrets)
  staged = upsertDeployWorkflow(staged);

  // 5) Final pass: never inline CLOUDFLARE_API_TOKEN anywhere
  staged = staged.map((f) => {
    if (/CLOUDFLARE_API_TOKEN\s*=\s*["'][^"']+["']/.test(f.content)) {
      // Scrub any accidental literal tokens
      f.content = f.content.replace(
        /CLOUDFLARE_API_TOKEN\s*=\s*["'][^"']+["']/g,
        `CLOUDFLARE_API_TOKEN = "\${{ secrets.CLOUDFLARE_API_TOKEN }}"`
      );
    }
    return f;
  });

  return staged;
}

export default sanitizeGeneratedFiles;