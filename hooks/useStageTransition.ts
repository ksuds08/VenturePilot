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

    // ✅ STREAMED VALIDATION STAGE
    if (nextStage === "validation") {
      try {
        const data = await postValidate(idea.title, idea.id);
        const fullValidation = data?.validation || "";
        const summary = fullValidation.split("\n")[0] || fullValidation;

        const placeholder = { role: "assistant" as const, content: "" };
        const messagesWithPlaceholder = [...idea.messages, placeholder];
        updateIdea(id, { messages: messagesWithPlaceholder });

        const reveal = (index: number) => {
          const content =
            `✅ Validation complete. Here's what we found:\n\n` +
            fullValidation.slice(0, index);
          const updatedMessages = messagesWithPlaceholder.map((m, i) =>
            i === messagesWithPlaceholder.length - 1 ? { ...m, content } : m
          );
          updateIdea(id, { messages: updatedMessages });

          if (index <= fullValidation.length) {
            setTimeout(() => reveal(index + 1), 10);
          } else {
            const withActions = updatedMessages.map((m, i) =>
              i === updatedMessages.length - 1
                ? {
                    ...m,
                    actions: [
                      { label: "Continue to Branding", command: "continue" },
                      { label: "Restart", command: "restart" },
                    ],
                  }
                : m
            );
            updateIdea(id, {
              messages: withActions,
              validation: fullValidation,
              takeaways: {
                ...idea.takeaways,
                validationSummary: summary,
              },
            });
          }
        };

        reveal(1);
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

    // ✅ STREAMED BRANDING STAGE
    if (nextStage === "branding") {
      try {
        const data = await postBranding(idea.title, idea.id);
        const brandingText =
          "✅ **Branding complete!**\n\n" +
          `**Name:** ${data.name}\n` +
          `**Tagline:** ${data.tagline}\n` +
          `**Colors:** ${data.colors?.join(", ")}\n` +
          `**Logo Concept:** ${data.logoDesc}\n\n`;

        const placeholder = {
          role: "assistant" as const,
          content: "",
          imageUrl: data.logoUrl || undefined,
        };

        const messagesWithPlaceholder = [...idea.messages, placeholder];
        updateIdea(id, { messages: messagesWithPlaceholder });

        const reveal = (index: number) => {
          const content = brandingText.slice(0, index);
          const updatedMessages = messagesWithPlaceholder.map((m, i) =>
            i === messagesWithPlaceholder.length - 1 ? { ...m, content } : m
          );
          updateIdea(id, { messages: updatedMessages });

          if (index <= brandingText.length) {
            setTimeout(() => reveal(index + 1), 10);
          } else {
            const withActions = updatedMessages.map((m, i) =>
              i === updatedMessages.length - 1
                ? {
                    ...m,
                    actions: [
                      { label: "Accept Branding", command: "accept branding" },
                      { label: "Regenerate Branding", command: "regenerate branding" },
                      { label: "Start Over", command: "start over" },
                    ],
                  }
                : m
            );
            updateIdea(id, {
              messages: withActions,
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
          }
        };

        reveal(1);
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

    // 🚀 MVP stage
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