export async function callTool(toolName, payload = {}) {
  const res = await fetch(`https://venturepilot.workers.dev/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Tool ${toolName} failed`);
  return res.json();
}
