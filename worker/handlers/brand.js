export async function handler(request, env) {
  try {
    const { idea, ideaId } = await request.json();

    if (!idea) {
      return new Response(JSON.stringify({ error: "Missing idea" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const prompt = `
You are VenturePilot, an AI startup co‑pilot.
Generate a concise branding kit in JSON format with the following keys:
name  - a catchy brand name (string)
tagline - a short tagline (string)
colors - an array of exactly 3 hex color codes (array)
logoDesc - a brief logo design prompt (string)

Respond ONLY with valid JSON.
Idea: ${idea}
`;

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 400,
      }),
    });

    if (!openaiRes.ok) {
      const text = await openaiRes.text();
      return new Response(JSON.stringify({ error: text }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content?.trim() || "";

    let branding;
    try {
      branding = JSON.parse(content);
    } catch (err) {
      return new Response(
        JSON.stringify({ error: "Failed to parse branding JSON" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(branding), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message || "Error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
