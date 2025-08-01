// hooks/useStageTransition.ts
import { postValidate, postBranding } from "../lib/api";
import type { VentureStage as StageType } from "../types";
import { STAGE_ORDER } from "../constants/messages";

type UseStageTransitionParams = {
  ideas: any[];
  updateIdea: (id: string, updates: any) => void;
  setOpenPanels: (fn: (prev: any) => any) => void;
  setLoading: (value: boolean) => void;
  messageEndRef: React.RefObject<HTMLDivElement>;
};

export function useStageTransition({
  ideas,
  updateIdea,
  setOpenPanels,
  setLoading,
  messageEndRef,
}: UseStageTransitionParams) {
  const handleAdvanceStage = async (id: any, forcedStage?: StageType) => {
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const idea = ideas.find((i) => i.id === id);
    if (!idea) {
      setLoading(false);
      return;
    }

    const currentIndex = STAGE_ORDER.indexOf(
      (idea.currentStage as StageType) || "ideation"
    );
    const nextStage =
      forcedStage || STAGE_ORDER[Math.min(currentIndex + 1, STAGE_ORDER.length - 1)];

    if (
      idea.currentStage === "ideation" ||
      idea.currentStage === "validation" ||
      idea.currentStage === "branding"
    ) {
      setOpenPanels((prev) => ({
        ...prev,
        [idea.currentStage as keyof typeof prev]: false,
      }));
    }

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
        const messages = [...idea.messages, validationMsg];
        updateIdea(id, {
          messages,
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
        const messages = [...idea.messages, brandingMsg];
        updateIdea(id, {
          messages,
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
      const messages = [...idea.messages, mvpMsg];
      updateIdea(id, { messages });
    }

    setLoading(false);
  };

  return handleAdvanceStage;
}