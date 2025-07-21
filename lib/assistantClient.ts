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
  const systemPrompt = getSystemPrompt(stage); // ✅ Fixed
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

