// lib/build/generateWranglerToml.ts

export type WranglerTomlOptions = {
  projectName: string;
  /** Cloudflare account id to include (optional) */
  accountId?: string;
  /** KV namespace id for static assets; if provided, binds as ASSETS */
  kvId?: string;
  /** Include [site] with bucket="./public" when true */
  hasPublic?: boolean;
  /** Override compatibility_date; defaults to today (YYYY-MM-DD) */
  compatibilityDate?: string;
};

export function generateWranglerToml(opts: WranglerTomlOptions): string {
  const {
    projectName,
    accountId,
    kvId,
    hasPublic = true,
    compatibilityDate = new Date().toISOString().slice(0, 10),
  } = opts;

  const lines: string[] = [];
  lines.push(`name = "${projectName}"`);
  lines.push(`main = "functions/index.ts"`);
  lines.push(`compatibility_date = "${compatibilityDate}"`);
  if (accountId) lines.push(`account_id = "${accountId}"`);

  if (kvId) {
    lines.push(
      [
        ``,
        `[[kv_namespaces]]`,
        `binding = "ASSETS"`,
        `id = "${kvId}"`,
      ].join("\n")
    );
  }

  if (hasPublic) {
    lines.push(
      [
        ``,
        `[site]`,
        `bucket = "./public"`,
      ].join("\n")
    );
  }

  return lines.join("\n");
}