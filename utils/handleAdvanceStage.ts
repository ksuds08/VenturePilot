// utils/handleAdvanceStage.ts
import { postValidate, postBranding } from "../lib/api";
import type { VentureStage } from "../types";

export default function handleAdvanceStageFactory(
  updateIdea: (id: any, updates: any) => void,
  getIdeaById: (id: string) => any,
  setLoading: (loading: boolean) => void
) {
  const handleAdvanceStage = async (ideaId: string, nextStage: VentureStage) => {
    const idea = getIdeaById(ideaId);
    if (!idea) return;

    console.log(`🔄 Advancing ${ideaId} to stage: ${nextStage}`);
    updateIdea(ideaId, { currentStage: nextStage });
    setLoading(true);

    if (nextStage === "validation") {
      try {
        console.log("📡 Calling postValidate...");
        const data = await postValidate(idea.title, idea.id);
        const fullValidation = data?.validation || "";
        const summary = fullValidation.split("\n")[0] || fullValidation;
        const validationMsg = {
          role: "assistant" as const,
          content: `✅ Validation complete. Here's what we found:\n\n${fullValidation}`,
          actions: [
            { label: "Continue to Branding", command: "continue to branding" },
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
      } catch (err) {
        console.error("❌ Validation error:", err);
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

    if (nextStage === "branding") {
      try {
        console.log("🎨 Calling postBranding...");
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
        updateIdea(ideaId, {
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
      } catch (err) {
        console.error("❌ Branding error:", err);
        updateIdea(ideaId, {
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
        content: "✅ You're ready to deploy your MVP!",
        actions: [{ label: "Deploy", command: "deploy" }],
      };
      updateIdea(ideaId, { messages: [...idea.messages, mvpMsg] });
    }

    setLoading(false);
  };

  return handleAdvanceStage;
}