export async function createKvNamespace(projectName: string): Promise<string> {
  const accountId = (globalThis as any).CF_ACCOUNT_ID;
  const token = (globalThis as any).CF_API_TOKEN;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: `${projectName}-ASSETS` }),
    }
  );

  const data = await res.json();
  if (!res.ok || !data?.result?.id) {
    throw new Error(
      `Failed to create KV namespace: ${JSON.stringify(data?.errors || data)}`
    );
  }

  return data.result.id;
}
