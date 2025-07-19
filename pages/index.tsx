// SPDX-License-Identifier: MIT
// Updated idea handler for VenturePilot
//
// This handler takes a user's raw idea prompt and returns both a list of
// micro‑business suggestions and a structured "Business Idea Canvas".  The
// canvas includes a one‑paragraph summary of the idea, a set of elaborated
// requirements, and clarifying questions to ask the founder.  This makes it
// easier for downstream front‑end components to display a rich, multi‑step
// representation of the idea instead of a single paragraph summary.

export async function ideaHandler(request, env) {
  // Parse JSON body. Expect a "prompt" property containing the user idea.
  const { prompt } = await request.json();

  // Safety: ensure a prompt was provided
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return new Response(
      JSON.stringify({ error: 'Missing or invalid prompt' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Helper to call OpenAI's chat completions API
  async function callOpenAI(messages, model = 'gpt-4o') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 512
      })
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI call failed: ${errorText}`);
    }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim();
  }

  try {
    // First, generate a few high‑level micro‑business ideas from the prompt.  We
    // continue to return this string field for backward compatibility with
    // existing callers that expect the prior behaviour.
    const ideasPrompt = [
      { role: 'system', content: 'You are VenturePilot, an AI startup co‑pilot.' },
      { role: 'user',   content: `Generate 5 AI‑enabled micro‑business ideas based on: ${prompt}` }
    ];
    const ideasContent = await callOpenAI(ideasPrompt, 'gpt-4o-mini');

    // Next, create the structured canvas: summary, requirements and questions.  We
    // ask OpenAI to respond in strict JSON format so that we can parse the
    // response reliably.
    const canvasPrompt = [
      { role: 'system', content: 'You are VenturePilot, an AI startup co‑pilot.' },
      { role: 'user',   content: `For the following business idea, produce a JSON object with these keys:\n\n` +
        `summary: a one‑paragraph summary of the idea (string);\n` +
        `requirements: an array of at least three elaborated requirements describing the major functional modules or tasks needed to build the product (array of strings);\n` +
        `questions: an array of clarifying questions to ask the founder in order to better define the scope and constraints (array of strings).\n\n` +
        `Respond ONLY with valid JSON. Do not include any other text.\n\n` +
        `Idea: ${prompt}` }
    ];
    const canvasContent = await callOpenAI(canvasPrompt, 'gpt-4o');
    let canvas = {};
    try {
      canvas = JSON.parse(canvasContent || '{}');
    } catch (_) {
      // If parsing fails, fallback to a minimal canvas containing just the
      // summary text.  This prevents the entire request from failing if
      // OpenAI returns malformed JSON.
      canvas = { summary: canvasContent || '' };
    }

    return new Response(
      JSON.stringify({
        ideas: ideasContent || '',
        summary: canvas.summary || '',
        requirements: Array.isArray(canvas.requirements) ? canvas.requirements : [],
        questions: Array.isArray(canvas.questions) ? canvas.questions : []
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Unexpected error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
