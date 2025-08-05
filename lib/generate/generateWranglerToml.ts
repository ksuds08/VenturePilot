export function generateWranglerToml(projectName: string, kvNamespaceId: string): string {
  return `name = "${projectName}"
main = "functions/index.ts"
compatibility_date = "2024-08-01"

[[kv_namespaces]]
binding = "SUBMISSIONS_KV"
id = "${kvNamespaceId}"
`;
}