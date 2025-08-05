// src/lib/cloudflare/createKvNamespace.ts
export async function createKvNamespace({
  token,
  accountId,
  title,
}: {
  token: string;
  accountId: string;
  title: string;
}): Promise<string> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title }),
    }
  );

  const data = await res.json();

  if (!data.success || !data.result?.id) {
    throw new Error(`Failed to create KV namespace: ${JSON.stringify(data)}`);
  }

  return data.result.id;
}