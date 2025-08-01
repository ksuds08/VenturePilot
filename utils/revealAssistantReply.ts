// utils/revealAssistantReply.ts
import type { VentureStage } from "../types";

interface RevealParams {
  idea: any;
  updateIdea: (id: any, updates: any) => void;
  content: string;
  reply: string;
  nextStage?: VentureStage;
  plan?: string;
  panelRef: React.RefObject<HTMLDivElement>;
  baseMessages: any[];
  handleAdvanceStage: (id: any, nextStage?: VentureStage) => void;
}

export default async function revealAssistantReply({
  idea,
  updateIdea,
  content,
  reply,
  nextStage,
  plan,
  panelRef,
  baseMessages,
  handleAdvanceStage,
}: RevealParams) {
  const reveal = (index: number, msgs: any[]) => {
    const updatedMsgs = msgs.map((m, i) =>
      i === msgs.length - 1 ? { ...m, content: reply.slice(0, index) } : m
    );
    updateIdea(idea.id, { messages: updatedMsgs });

    if (index <= reply.length) {
      setTimeout(() => reveal(index + 1, updatedMsgs), 20);
    } else {
      if (idea.currentStage === "ideation") {
        const summaryMsg = {
          role: "assistant",
          content:
            `✅ Got it! Here’s what you said:\n\n${reply || content}\n\n` +
            `If this looks good, we’ll move on to validate your idea.`,
          actions: [
            { label: "Continue to Validation", command: "continue" },
            { label: "Edit Idea", command: "restart" },
          ],
        };
        updateIdea(idea.id, {
          title: idea.title || content.slice(0, 80),
          messages: [...updatedMsgs, summaryMsg],
          takeaways: { ...idea.takeaways },
          ...(plan && { finalPlan: plan }),
        });
      }

      setTimeout(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);

      if (nextStage && nextStage !== idea.currentStage) {
        setTimeout(() => handleAdvanceStage(idea.id, nextStage), 1000);
      }
    }
  };

  reveal(1, baseMessages);
}