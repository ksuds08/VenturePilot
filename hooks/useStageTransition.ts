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

    // === VALIDATION STAGE ===
    if (nextStage === "validation") {
      try {
        const data = await postValidate(idea.title, idea.id);
        const fullValidation = data?.validation || "";
        const summary = fullValidation.split("\n")[0] || fullValidation;

        updateIdea(id, {
          messages: [...idea.messages, { role: "assistant", content: "Thinking" }],
        });

        const reveal = (i: number) => {
          const content =
            `✅ Validation complete. Here's what we found:\n\n` +
            fullValidation.slice(0, i);

          updateIdea(id, (prev: any) => ({
            ...prev,
            messages: prev.messages.map((m: any, idx: number) =>
              idx === prev.messages.length - 1 ? { ...m, content } : m
            ),
          }));

          if (i < fullValidation.length) {
            requestAnimationFrame(() => reveal(i + 1));
          } else {
            updateIdea(id, (prev: any) => ({
              ...prev,
              messages: prev.messages.map((m: any, idx: number) =>
                idx === prev.messages.length - 1
                  ? {
                      ...m,
                      actions: [
                        { label: "Continue to Branding", command: "continue" },
                        { label: "Restart", command: "restart" },
                      ],
                    }
                  : m
              ),
              validation: fullValidation,
              takeaways: {
                ...prev.takeaways,
                validationSummary: summary,
              },
            }));
          }
        };

        requestAnimationFrame(() => reveal(1));
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

    // === BRANDING STAGE ===
    if (nextStage === "branding") {
      try {
        const data = await postBranding(idea.title, idea.id);
        const brandingText =
          "✅ **Branding complete!**\n\n" +
          `**Name:** ${data.name}\n` +
          `**Tagline:** ${data.tagline}\n` +
          `**Colors:** ${data.colors?.join(", ")}\n` +
          `**Logo Concept:** ${data.logoDesc}\n\n`;

        updateIdea(id, {
          messages: [
            ...idea.messages,
            {
              role: "assistant",
              content: "Thinking",
              imageUrl: data.logoUrl || undefined,
            },
          ],
        });

        const reveal = (i: number) => {
          const content = brandingText.slice(0, i);

          updateIdea(id, (prev: any) => ({
            ...prev,
            messages: prev.messages.map((m: any, idx: number) =>
              idx === prev.messages.length - 1 ? { ...m, content } : m
            ),
          }));

          if (i < brandingText.length) {
            requestAnimationFrame(() => reveal(i + 1));
          } else {
            updateIdea(id, (prev: any) => ({
              ...prev,
              messages: prev.messages.map((m: any, idx: number) =>
                idx === prev.messages.length - 1
                  ? {
                      ...m,
                      actions: [
                        { label: "Accept Branding", command: "accept branding" },
                        { label: "Regenerate Branding", command: "regenerate branding" },
                        { label: "Start Over", command: "start over" },
                      ],
                    }
                  : m
              ),
              branding: data,
              takeaways: {
                ...prev.takeaways,
                branding: {
                  name: data.name,
                  tagline: data.tagline,
                  colors: data.colors,
                  logoDesc: data.logoDesc,
                  logoUrl: data.logoUrl || "",
                },
              },
            }));
          }
        };

        requestAnimationFrame(() => reveal(1));
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

    // === MVP STAGE ===
    if (nextStage === "mvp") {
      const mvpMsg = {
        role: "assistant" as const,
        content: "✅ You're ready to deploy your MVP!\n\n",
        actions: [{ label: "Deploy", command: "deploy" }],
      };
      updateIdea(id, { messages: [...idea.messages, mvpMsg] });
    }

    setLoading(false);
  };

  return handleAdvanceStage;
}