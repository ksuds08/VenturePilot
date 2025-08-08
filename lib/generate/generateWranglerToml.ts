// lib/generate/generateWranglerToml.ts

/**
 * Build a wrangler.toml string with:
 * - name, main, compatibility_date (today)
 * - optional account_id
 * - optional ASSETS KV binding
 * - optional [site] bucket when serving static public/ assets
 */
export function generateWranglerToml(
  projectName: string,
  accountId?: string,
  kvNamespaceId?: string,
  hasPublic: boolean = true
): string {
  const today = new Date().toISOString().slice(0, 10);

  let toml = `name = "${projectName}"
main = "functions/index.ts"
compatibility_date = "${today}"`;

  if (accountId && accountId.trim()) {
    toml += `\naccount_id = "${accountId.trim()}"`;
  }

  if (kvNamespaceId && kvNamespaceId.trim()) {
    toml += `

[[kv_namespaces]]
binding = "ASSETS"
id = "${kvNamespaceId.trim()}"`;
  }

  if (hasPublic) {
    toml += `

[site]
bucket = "./public"`;
  }

  return toml + "\n";
}