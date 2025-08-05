// src/lib/generate/generateWranglerToml.ts

export function generateWranglerToml(projectName: string): string {
  const safeName = projectName || 'launchwing-app';
  const uniqueTitle = `submissions-${safeName}-${Date.now()}`;

  return `name = "${safeName}"
main = "functions/index.ts"
compatibility_date = "2024-08-01"

[[kv_namespaces]]
binding = "SUBMISSIONS_KV"
title = "${uniqueTitle}"
`;
}