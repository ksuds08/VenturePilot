import { getSystemPrompt } from "../utils/promptUtils";
import type { VentureStage } from "../types";

export async function sendToAssistant(
  messages: { role: string; content: string }[],
  stage: VentureStage = "ideation"
): Promise<{ reply: string; refinedIdea: string; nextStage?: VentureStage }> {
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
  const reply: string = data?.reply || "No reply.";

  const fullAssistantHistory = messages
    .filter((m) => m.role === "assistant")
    .map((m) => m.content)
    .join("\n\n");

  const refined = extractRefinedIdea(reply) || extractSummary(fullAssistantHistory);
  const nextStage = detectNextStageSuggestion(reply);

  return {
    reply,
    refinedIdea: refined,
    nextStage,
  };
}

function extractRefinedIdea(text: string): string | undefined {
  const match = text.match(/Refined Idea:\s*\n+(.+)/i);
  return match ? match[1].trim() : undefined;
}

function extractSummary(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    lines.find((l) => l.toLowerCase().includes("the idea is")) ||
    lines.find((l) => l.length > 60) ||
    text.slice(0, 200)
  );
}

function detectNextStageSuggestion(text: string): VentureStage | undefined {
  if (/move to (the )?validation/i.test(text)) return "validation";
  if (/move to (the )?branding/i.test(text)) return "branding";
  if (/move to (the )?mvp|start( the)? mvp/i.test(text)) return "mvp";
  return undefined;
}

