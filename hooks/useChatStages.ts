// hooks/useChatStages.ts
import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { GREETING, STAGE_ORDER } from "../constants/messages";
import { sendToAssistant } from "../lib/assistantClient";
import { postValidate, postBranding, getMvpStream } from "../lib/api";
import type { VentureStage as StageType } from "../types";
import { sanitizeMessages } from "../utils/sanitizeMessages";
import handleAdvanceStageFactory from "../utils/handleAdvanceStage";
import handleConfirmBuildFactory from "../utils/handleConfirmBuild";

export default function useChatStages(onReady?: () => void) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  const updateIdea = (id: any, updates: any) => {
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              ...(typeof updates === "function" ? updates(i) : updates),
            }
          : i
      )
    );
  };

  useEffect(() => {
    if (!activeIdeaId && ideas.length === 0) {
      const id = uuidv4();
      const starter = {
        id,
        title: "",
        messages: [
          {
            role: "assistant",
            content: GREETING,
          },
        ],
        locked: false,
        currentStage: "ideation" as StageType,
        takeaways: {},
      };
      setIdeas([starter]);
      setActiveIdeaId(id);
      if (onReady) onReady();
    }
  }, [activeIdeaId, ideas.length, onReady]);

  const handleAdvanceStage = handleAdvanceStageFactory(updateIdea, ideas);
  const handleConfirmBuild = handleConfirmBuildFactory(updateIdea, setDeployLogs, ideas);

  const handleSend = async (content: string) => {
    const current = activeIdea;
    if (!current) return;

    const trimmed = content.trim().toLowerCase();

    const stageShortcuts: Record<string, () => void> = {
      continue: () => handleAdvanceStage(current.id, "validation"),
      restart: () => updateIdea(current.id, { messages: [...current.messages, { role: "user", content }] }),
      "edit idea": () => updateIdea(current.id, { messages: [...current.messages, { role: "user", content }] }),
      "accept branding": () => handleAdvanceStage(current.id, "mvp"),
      "regenerate branding": () => handleAdvanceStage(current.id, "branding"),
      "start over": () => handleAdvanceStage(current.id, "ideation"),
      deploy: () => handleConfirmBuild(current.id, sanitizeMessages(current.messages), current.takeaways.branding),
    };

    if (stageShortcuts[trimmed]) {
      stageShortcuts[trimmed]();
      return;
    }

    const userMsg = { role: "user", content };
    const placeholder = { role: "assistant", content: "" };
    const baseMessages = [...current.messages, userMsg, placeholder];
    updateIdea(current.id, { messages: baseMessages });
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const { reply, nextStage, plan } = await sendToAssistant([...current.messages, userMsg], current.currentStage);
    setLoading(false);

    const reveal = (index: number, msgs: any[]) => {
      const updatedMsgs = msgs.map((m, i) =>
        i === msgs.length - 1 ? { ...m, content: reply.slice(0, index) } : m
      );
      updateIdea(current.id, { messages: updatedMsgs });

      if (index <= reply.length) {
        setTimeout(() => reveal(index + 1, updatedMsgs), 20);
      } else {
        if (current.currentStage === "ideation") {
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
          updateIdea(current.id, {
            title: current.title || content.slice(0, 80),
            messages: [...updatedMsgs, summaryMsg],
            takeaways: { ...current.takeaways },
            ...(plan && { finalPlan: plan }),
          });
        }

        setTimeout(() => {
          panelRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);

        if (nextStage && nextStage !== current.currentStage) {
          setTimeout(() => handleAdvanceStage(current.id, nextStage), 1000);
        }
      }
    };

    reveal(1, baseMessages);
  };

  return {
    ideas,
    activeIdeaId,
    setActiveIdeaId,
    loading,
    deployLogs,
    messageEndRef,
    panelRef,
    handleSend,
    handleAdvanceStage,
    handleConfirmBuild,
  };
}