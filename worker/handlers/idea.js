
export async function ideaHandler(request, env) {
  const { prompt } = await request.json();

  const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are VenturePilot, an AI startup co‑pilot.' },
        { role: 'user',   content: `Generate 5 AI‑enabled micro‑business ideas based on: ${prompt}` }
      ],
      temperature: 0.7
    })
  });

  if (!openaiRes.ok) {
    return new Response(JSON.stringify({ error: await openaiRes.text() }), { status: 500 });
  }

  const data  = await openaiRes.json();
  const ideas = data.choices?.[0]?.message?.content || '[]';

  return new Response(JSON.stringify({ ideas }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
