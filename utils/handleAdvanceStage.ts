// utils/handleAdvanceStage.ts
import { postValidate, postBranding } from "../lib/api";
import type { VentureStage } from "../types";

export default function handleAdvanceStageFactory(
  updateIdea: (id: any, updates: any) => void,
  getIdeaById: (id: string) => any
) {
  const handleAdvanceStage = async (ideaId: string, nextStage: VentureStage) => {
    const idea = getIdeaById(ideaId);
    if (!idea) return;

    // Stage switch
    updateIdea(ideaId, { currentStage: nextStage });

    // Handle Validation
    if (nextStage === "validation") {
      try {
        const data = await postValidate(idea.title, idea.id);
        const fullValidation = data?.validation || "";
        const summary = fullValidation.split("\n")[0] || fullValidation;

        const validationMsg = {
          role: "assistant" as const,
          content: `✅ Validation complete. Here's what we found:\n\n${fullValidation}`,
          actions: [
            { label: "Continue to Branding", command: "continue" },
            { label: "Restart", command: "restart" },
          ],
        };

        updateIdea(ideaId, {
          messages: [...idea.messages, validationMsg],
          validation: fullValidation,
          takeaways: {
            ...idea.takeaways,
            validationSummary: summary,
          },
        });
      } catch {
        updateIdea(ideaId, {
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

    // Handle Branding
    if (nextStage === "branding") {
      // Show interim message
      updateIdea(ideaId, {
        messages: [
          ...idea.messages,
          {
            role: "assistant",
            content: "⏳ Generating branding assets... Please wait.",
          },
        ],
      });

      try {
        const data = await postBranding(idea.title, idea.id);
        const updatedIdea = getIdeaById(ideaId);

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

        updateIdea(ideaId, {
          messages: [...updatedIdea.messages, brandingMsg],
          branding: data,
          takeaways: {
            ...updatedIdea.takeaways,
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
        const failedIdea = getIdeaById(ideaId);
        updateIdea(ideaId, {
          messages: [
            ...failedIdea.messages,
            {
              role: "assistant",
              content: "⚠️ Branding failed. Please try again later.",
            },
          ],
        });
      }
    }

    // Handle MVP
    if (nextStage === "mvp") {
      const mvpMsg = {
        role: "assistant" as const,
        content: "✅ You're ready to deploy your MVP!",
        actions: [{ label: "Deploy", command: "deploy" }],
      };
      updateIdea(ideaId, { messages: [...idea.messages, mvpMsg] });
    }
  };

  return handleAdvanceStage;
}