import { getSystemPrompt } from "../utils/promptUtils";
import type { VentureStage } from "../types";

export async function sendToAssistant(
  messages: { role: string; content: string }[],
  stage: VentureStage = "ideation"
): Promise<{
  reply: string;
  refinedIdea?: string;
  nextStage?: VentureStage;
  plan?: string;
}> {
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

  const refinedIdea = extractRefinedIdea(reply);
  const plan = extractFinalPlan(reply);
  const nextStage = detectNextStageSuggestion(reply);

  return {
    reply,
    refinedIdea: refinedIdea || fallbackSummary(reply),
    nextStage,
    plan,
  };
}

function extractRefinedIdea(text: string): string | undefined {
  const match = text.match(/Refined Idea:\s*\n+(.+)/i);
  return match ? match[1].trim() : undefined;
}

function extractFinalPlan(text: string): string | undefined {
  const match = text.match(/Business Plan:\s*\n+([\s\S]*)$/i);
  return match ? match[1].trim() : undefined;
}

function detectNextStageSuggestion(text: string): VentureStage | undefined {
  if (/move to (the )?validation/i.test(text)) return "validation";
  if (/move to (the )?branding/i.test(text)) return "branding";
  if (/start( the)? mvp|move to (the )?mvp/i.test(text)) return "mvp";
  if (/generate( the)? business plan|final plan ready/i.test(text)) return "generatePlan";
  return undefined;
}

function fallbackSummary(text: string): string {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  return (
    lines.find(l => l.toLowerCase().includes("the idea is")) ||
    lines.find(l => l.length > 60) ||
    text.slice(0, 200)
  );
}

