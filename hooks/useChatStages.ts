// File: hooks/useChatStages.ts
import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { sendToAssistant } from "../lib/assistantClient";
import type { VentureStage as StageType } from "../types";
import { GREETING, STAGE_ORDER } from "../constants/messages";
import { postBranding, postValidate } from "../lib/api";
import { sanitizeMessages } from "../utils/sanitizeMessages";
import revealAssistantReply from "../utils/revealAssistantReply";
import handleAdvanceStage from "../utils/handleAdvanceStage";
import handleConfirmBuild from "../utils/handleConfirmBuild";

export default function useChatStages(onReady?: () => void) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  useEffect(() => {
    if (!activeIdeaId && ideas.length === 0) {
      const id = uuidv4();
      const starter = {
        id,
        title: "",
        messages: [{ role: "assistant", content: GREETING }],
        locked: false,
        currentStage: "ideation" as StageType,
        takeaways: {},
      };
      setIdeas([starter]);
      setActiveIdeaId(id);
      if (onReady) onReady();
    }
  }, [activeIdeaId, ideas.length, onReady]);

  const updateIdea = (id: any, updates: any) => {
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, ...(typeof updates === "function" ? updates(i) : updates) } : i
      )
    );
  };

  const handleSend = async (content: string) => {
    const current = ideas.find((i) => i.id === activeIdeaId);
    if (!current) return;

    const trimmed = content.trim().toLowerCase();
    const stage = current.currentStage;

    const shortcuts: Record<string, () => void> = {
      continue: () =>
        handleAdvanceStage(current, updateIdea, "validation", postValidate, postBranding),
      restart: () =>
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        }),
      "edit idea": () =>
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        }),
      "accept branding": () =>
        handleAdvanceStage(current, updateIdea, "mvp", postValidate, postBranding),
      "regenerate branding": () =>
        handleAdvanceStage(current, updateIdea, "branding", postValidate, postBranding),
      "start over": () =>
        handleAdvanceStage(current, updateIdea, "ideation", postValidate, postBranding),
      deploy: () =>
        handleConfirmBuild(current, setIdeas, setDeployLogs), // ✅ FIXED: removed 4th arg
    };

    if (shortcuts[trimmed]) {
      shortcuts[trimmed]();
      return;
    }

    const userMsg = { role: "user", content };
    const placeholder = { role: "assistant", content: "" };
    const baseMessages = [...current.messages, userMsg, placeholder];
    updateIdea(current.id, { messages: baseMessages });
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const { reply, refinedIdea, nextStage, plan } = await sendToAssistant(
      [...current.messages, userMsg],
      stage
    );
    setLoading(false);

    await revealAssistantReply({
      idea: current,
      updateIdea,
      content,
      reply,
      nextStage,
      plan,
      panelRef,
      baseMessages,
      handleAdvanceStage,
      setIdeas,
    });
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
  };
}