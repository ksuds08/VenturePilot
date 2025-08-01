// hooks/revealAssistantReply.ts
import type { RefObject } from "react";
import type { VentureStage as StageType } from "../types";

interface RevealReplyParams {
  ideaId: string;
  currentStage: StageType;
  currentTitle: string;
  content: string;
  reply: string;
  plan?: string;
  nextStage?: StageType;
  messages: any[];
  updateIdea: (id: string, updates: any) => void;
  panelRef: RefObject<HTMLDivElement>;
  handleAdvanceStage: (id: string, stage?: StageType) => void;
}

export default function revealAssistantReply({
  ideaId,
  currentStage,
  currentTitle,
  content,
  reply,
  plan,
  nextStage,
  messages,
  updateIdea,
  panelRef,
  handleAdvanceStage,
}: RevealReplyParams) {
  const reveal = (index: number, msgs: any[]) => {
    const updatedMsgs = msgs.map((m, i) =>
      i === msgs.length - 1 ? { ...m, content: reply.slice(0, index) } : m
    );
    updateIdea(ideaId, { messages: updatedMsgs });

    if (index <= reply.length) {
      setTimeout(() => reveal(index + 1, updatedMsgs), 20);
    } else {
      if (currentStage === "ideation") {
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
        updateIdea(ideaId, {
          title: currentTitle || content.slice(0, 80),
          messages: [...updatedMsgs, summaryMsg],
          takeaways: {},
          ...(plan && { finalPlan: plan }),
        });
      }

      setTimeout(() => {
        panelRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);

      if (nextStage && nextStage !== currentStage) {
        setTimeout(() => handleAdvanceStage(ideaId, nextStage), 1000);
      }
    }
  };

  reveal(1, messages);
}