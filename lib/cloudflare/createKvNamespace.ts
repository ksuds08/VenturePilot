// lib/cloudflare/createKvNamespace.ts

type CreateArgs = {
  token: string;
  accountId: string;
  title: string;
};

/**
 * Create a KV namespace and return its id.
 */
export async function createKvNamespace({ token, accountId, title }: CreateArgs): Promise<string> {
  const resp = await fetch(
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

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`createKvNamespace failed: ${resp.status} ${resp.statusText} ${text}`);
  }

  const data = (await resp.json()) as any;
  const id = data?.result?.id;
  if (!id) throw new Error(`createKvNamespace: no id in response`);
  return id;
}

/**
 * Reuse an existing KV namespace named "<projectName>-ASSETS" if present,
 * otherwise create it. Returns the namespace id.
 */
export async function ensureAssetsKv(
  projectName: string,
  accountId: string,
  token: string
): Promise<string> {
  const title = `${projectName}-ASSETS`;

  // Try to find an existing namespace first
  try {
    const listRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (listRes.ok) {
      const data = (await listRes.json()) as any;
      const found = data?.result?.find((ns: any) => ns?.title === title);
      if (found?.id) return found.id;
    } else {
      // non-fatal: we’ll try to create
      const text = await listRes.text().catch(() => "");
      console.warn(`ensureAssetsKv: list namespaces failed: ${listRes.status} ${text}`);
    }
  } catch (e) {
    console.warn(`ensureAssetsKv: list namespaces error: ${String(e)}`);
  }

  // Create if missing
  return await createKvNamespace({ token, accountId, title });
}