import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";
import { GREETING } from "../constants/messages";

import { initializeIdea, updateIdea as rawUpdateIdea } from "./useIdeaLifecycle";
import { useSendHandler } from "./useSendHandler";
import { useStageTransition } from "./useStageTransition";
import { useDeploymentHandler } from "./useDeploymentHandler";

export default function useChatStages(onReady?: () => void) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);

  const [shouldStreamGreeting, setShouldStreamGreeting] = useState(false);
  const [greetingInitialized, setGreetingInitialized] = useState(false);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [openPanels, setOpenPanels] = useState({
    ideation: false,
    validation: false,
    branding: false,
  });

  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  const updateIdea = (id: any, updates: any) =>
    rawUpdateIdea(setIdeas, id, updates);

  // Track panel open flags
  useEffect(() => {
    if (activeIdea) {
      setOpenPanels((prev) => ({
        ...prev,
        ideation: prev.ideation || activeIdea.currentStage === "ideation",
        validation:
          prev.validation || activeIdea.currentStage === "validation",
        branding: prev.branding || activeIdea.currentStage === "branding",
      }));
    }
  }, [activeIdea?.currentStage]);

  // Initialize idea with empty assistant message (but do not stream yet)
  useEffect(() => {
    if (!activeIdeaId && ideas.length === 0) {
      const id = uuidv4();
      const starter = {
        id,
        title: "",
        messages: [
          {
            role: "assistant",
            content: "", // empty for streaming
          },
        ],
        locked: false,
        currentStage: "ideation" as StageType,
        takeaways: {},
      };
      setIdeas([starter]);
      setActiveIdeaId(id);
      setGreetingInitialized(true); // allow stream later
    }
  }, [activeIdeaId, ideas.length]);

  // Stream the greeting once allowed
  useEffect(() => {
    if (!greetingInitialized || !shouldStreamGreeting || !activeIdeaId || ideas.length === 0) return;

    const greeting = GREETING;
    const ideaIndex = ideas.findIndex((i) => i.id === activeIdeaId);
    if (ideaIndex === -1) return;

    const reveal = (i: number, base: string) => {
      const updated = ideas.map((idea, idx) => {
        if (idx !== ideaIndex) return idea;
        const updatedMessages = [...idea.messages];
        updatedMessages[0] = {
          ...updatedMessages[0],
          content: base.slice(0, i),
        };
        return { ...idea, messages: updatedMessages };
      });

      setIdeas(updated);

      if (i <= greeting.length) {
        setTimeout(() => reveal(i + 1, greeting), 20);
      } else {
        setShouldStreamGreeting(false);
        if (onReady) onReady(); // 🟢 safe to scroll now
      }
    };

    reveal(1, greeting);
  }, [shouldStreamGreeting, greetingInitialized, activeIdeaId, ideas]);

  const handleAdvanceStage = useStageTransition({
    ideas,
    updateIdea,
    setOpenPanels,
    setLoading,
    messageEndRef,
  });

  const handleConfirmBuild = useDeploymentHandler({
    ideas,
    updateIdea,
    setDeployLogs,
  });

  const handleSend = useSendHandler({
    ideas,
    activeIdea,
    updateIdea,
    handleAdvanceStage,
    handleConfirmBuild,
    messageEndRef,
    panelRef,
    setLoading,
  });

  return {
    ideas,
    activeIdeaId,
    setActiveIdeaId,
    loading,
    deployLogs,
    openPanels,
    togglePanel: () => {},
    messageEndRef,
    panelRef,
    handleSend,
    handleAdvanceStage,
    handleConfirmBuild,
    startGreetingStream: () => setShouldStreamGreeting(true), // ⬅️ NEW EXPORT
  };
}