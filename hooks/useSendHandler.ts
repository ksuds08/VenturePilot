import { sendToAssistant } from "../lib/assistantClient";
import type { VentureStage as StageType } from "../types";

type Message = {
  role: "user" | "assistant";
  content: string;
  actions?: { label: string; command: string }[];
  imageUrl?: string;
};

type UseSendHandlerParams = {
  ideas: any[];
  activeIdea: any;
  updateIdea: (id: string, updates: any) => void;
  handleAdvanceStage: (id: string, stage?: StageType) => void;
  handleConfirmBuild: (id: string) => void;
  messageEndRef: React.RefObject<HTMLDivElement>;
  panelRef: React.RefObject<HTMLDivElement>;
  setLoading: (val: boolean) => void;
};

export function useSendHandler({
  ideas,
  activeIdea,
  updateIdea,
  handleAdvanceStage,
  handleConfirmBuild,
  messageEndRef,
  panelRef,
  setLoading,
}: UseSendHandlerParams) {
  const handleSend = async (content: string) => {
    const current = activeIdea;
    if (!current) return;

    const trimmed = content.trim().toLowerCase();
    const id = current.id;

    const stageCommand = (nextStage: StageType) => {
      updateIdea(id, {
        messages: [...current.messages, { role: "user", content }],
      });
      handleAdvanceStage(id, nextStage);
    };

    const simpleCommand = () =>
      updateIdea(id, {
        messages: [...current.messages, { role: "user", content }],
      });

    const commandMap: Record<string, () => void> = {
      continue: () => {
        if (current.currentStage === "ideation") return stageCommand("validation");
        if (current.currentStage === "validation") return stageCommand("branding");
      },
      "edit idea": simpleCommand,
      restart: () => {
        if (current.currentStage === "ideation" || current.currentStage === "validation")
          return stageCommand("ideation");
      },
      "accept branding": () => stageCommand("mvp"),
      "regenerate branding": () => stageCommand("branding"),
      "start over": () => stageCommand("ideation"),
      deploy: () => {
        updateIdea(id, {
          messages: [...current.messages, { role: "user", content }],
        });
        updateIdea(id, (prev: any) => ({
          messages: [
            ...prev.messages,
            { role: "assistant", content: "🚀 Deploying your MVP…" },
          ],
        }));
        handleConfirmBuild(id);
      },
    };

    if (commandMap[trimmed]) return commandMap[trimmed]();

    const userMsg = { role: "user", content };
    const placeholder = { role: "assistant", content: "" };
    const baseMessages = [...current.messages, userMsg, placeholder];

    updateIdea(id, { messages: baseMessages });
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const { reply, nextStage, plan } = await sendToAssistant(
      [...current.messages, userMsg],
      current.currentStage
    );

    setLoading(false);

    const reveal = (index: number, msgs: Message[]) => {
      const updatedMsgs = msgs.map((m, i) =>
        i === msgs.length - 1 ? { ...m, content: reply.slice(0, index) } : m
      );
      updateIdea(id, { messages: updatedMsgs });

      if (index <= reply.length) {
        setTimeout(() => reveal(index + 1, updatedMsgs), 20);
      } else {
        let finalMessages = updatedMsgs;

        // ➕ Add buttons directly to assistant reply
        if (current.currentStage === "ideation") {
          const updatedWithActions: Message[] = updatedMsgs.map((m, i) =>
            i === updatedMsgs.length - 1
              ? {
                  ...m,
                  actions: [
                    { label: "Continue to Validation", command: "continue" },
                    { label: "Edit Idea", command: "restart" },
                  ],
                }
              : m
          );
          finalMessages = updatedWithActions;
        }

        updateIdea(id, {
          title: current.title || content.slice(0, 80),
          messages: finalMessages,
          takeaways: {
            ...current.takeaways,
          },
          ...(plan && { finalPlan: plan }),
        });

        setTimeout(() => {
          panelRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);

        if (nextStage && nextStage !== current.currentStage) {
          setTimeout(() => handleAdvanceStage(id, nextStage), 1000);
        }
      }
    };

    reveal(1, baseMessages);
  };

  return handleSend;
}