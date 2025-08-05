export async function getLatestWranglerV4Version(): Promise<string> {
  const res = await fetch('https://registry.npmjs.org/wrangler');
  if (!res.ok) throw new Error('Failed to fetch wrangler versions');

  const data = await res.json();
  const versions = Object.keys(data.versions);

  const latestV4 = versions
    .filter(v => v.startsWith('4.'))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];

  if (!latestV4) throw new Error('No Wrangler v4 version found');
  return latestV4;
}