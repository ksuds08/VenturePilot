// lib/build/generateWranglerToml.ts

type WranglerTomlOpts = {
  projectName: string;
  accountId?: string;
  kvId?: string;      // ASSETS KV id; include block only if provided
  hasPublic: boolean; // whether to add [site] bucket = "./public"
};

// Backward-compat overloads
export function generateWranglerToml(projectName: string, kvNamespaceId?: string): string;
export function generateWranglerToml(opts: WranglerTomlOpts): string;

// Single impl handling both signatures
export function generateWranglerToml(
  arg1: string | WranglerTomlOpts,
  kvNamespaceId?: string
): string {
  let projectName: string;
  let accountId: string | undefined;
  let kvId: string | undefined;
  let hasPublic = true;

  if (typeof arg1 === "string") {
    // OLD CALL SHAPE: generateWranglerToml(projectName, kvNamespaceId)
    projectName = arg1;
    kvId = kvNamespaceId || undefined;
    // We don't know accountId here; buildService will patch it later.
  } else {
    // NEW CALL SHAPE: generateWranglerToml({ projectName, accountId, kvId, hasPublic })
    projectName = arg1.projectName;
    accountId   = arg1.accountId;
    kvId        = arg1.kvId;
    hasPublic   = arg1.hasPublic ?? true;
  }

  const today = new Date().toISOString().slice(0, 10);

  const lines: string[] = [];
  lines.push(`name = "${projectName}"`);
  lines.push(`main = "functions/index.ts"`);
  lines.push(`compatibility_date = "${today}"`);

  if (accountId) {
    lines.push(`account_id = "${accountId}"`);
  }

  if (kvId) {
    lines.push(`
[[kv_namespaces]]
binding = "ASSETS"
id = "${kvId}"`.trim());
  }

  if (hasPublic) {
    lines.push(`
[site]
bucket = "./public"`.trim());
  }

  // Join with newlines; keep minimal/clean file
  return lines.join("\n");
}