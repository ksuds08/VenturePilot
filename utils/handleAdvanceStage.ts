// utils/handleAdvanceStage.ts
import type { VentureStage as StageType } from "../types";
import { STAGE_ORDER } from "../constants/messages";
import { postValidate, postBranding } from "../lib/api";

type UpdateIdeaFn = (id: any, updates: any) => void;

export default function createAdvanceStageHandler(updateIdea: UpdateIdeaFn, ideas: any[]) {
  return async function handleAdvanceStage(id: any, forcedStage?: StageType) {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    const currentIndex = STAGE_ORDER.indexOf(
      (idea.currentStage as StageType) || "ideation"
    );
    const nextStage =
      forcedStage || STAGE_ORDER[Math.min(currentIndex + 1, STAGE_ORDER.length - 1)];

    updateIdea(id, { currentStage: nextStage });

    if (nextStage === "validation") {
      try {
        const data = await postValidate(idea.title, idea.id);
        const fullValidation = data?.validation || "";
        const summary = fullValidation.split("\n")[0] || fullValidation;
        const validationMsg = {
          role: "assistant" as const,
          content:
            `✅ Validation complete. Here's what we found:\n\n${fullValidation}\n\n`,
          actions: [
            { label: "Continue to Branding", command: "continue" },
            { label: "Restart", command: "restart" },
          ],
        };
        updateIdea(id, {
          messages: [...idea.messages, validationMsg],
          validation: fullValidation,
          takeaways: {
            ...idea.takeaways,
            validationSummary: summary,
          },
        });
      } catch {
        updateIdea(id, {
          messages: [
            ...idea.messages,
            {
              role: "assistant",
              content: "⚠️ Validation failed. Please try again later.",
            },
          ],
        });
      }
    }

    if (nextStage === "branding") {
      try {
        const data = await postBranding(idea.title, idea.id);
        const brandingMsg = {
          role: "assistant" as const,
          content:
            "✅ **Branding complete!**\n\n" +
            `**Name:** ${data.name}\n` +
            `**Tagline:** ${data.tagline}\n` +
            `**Colors:** ${data.colors?.join(", ")}\n` +
            `**Logo Concept:** ${data.logoDesc}\n\n`,
          imageUrl: data.logoUrl || undefined,
          actions: [
            { label: "Accept Branding", command: "accept branding" },
            { label: "Regenerate Branding", command: "regenerate branding" },
            { label: "Start Over", command: "start over" },
          ],
        };
        updateIdea(id, {
          messages: [...idea.messages, brandingMsg],
          branding: data,
          takeaways: {
            ...idea.takeaways,
            branding: {
              name: data.name,
              tagline: data.tagline,
              colors: data.colors,
              logoDesc: data.logoDesc,
              logoUrl: data.logoUrl || "",
            },
          },
        });
      } catch {
        updateIdea(id, {
          messages: [
            ...idea.messages,
            {
              role: "assistant",
              content: "⚠️ Branding failed. Please try again later.",
            },
          ],
        });
      }
    }

    if (nextStage === "mvp") {
      const mvpMsg = {
        role: "assistant" as const,
        content: "✅ You're ready to deploy your MVP!\n\n",
        actions: [{ label: "Deploy", command: "deploy" }],
      };
      updateIdea(id, {
        messages: [...idea.messages, mvpMsg],
      });
    }
  };
}