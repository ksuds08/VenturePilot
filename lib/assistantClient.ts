// lib/assistantClient.ts
import { getSystemPrompt } from "../utils/promptUtils";

export async function sendToAssistant(messages, stage = "ideation") {
  const systemPrompt = getSystemPrompt(stage);
  const payload = [
    { role: "system", content: systemPrompt },
    ...messages.map(({ role, content }) => ({ role, content }))
  ];

  const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: payload }),
  });

  const data = await res.json();
  const fullText = messages.filter(m => m.role === "assistant").map(m => m.content).join("\n\n");
  const refined = data?.refinedIdea?.trim() || extractSummary(fullText);

  return {
    reply: data?.reply || "No reply.",
    refinedIdea: refined
  };
}

function extractSummary(text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return (
    lines.find(l => l.toLowerCase().includes("the idea is")) ||
    lines.find(l => l.length > 60) ||
    text.slice(0, 200)
  );
}

