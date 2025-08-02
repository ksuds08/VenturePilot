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
  const [hasStreamedGreeting, setHasStreamedGreeting] = useState(false); // ✅ new

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

  // Initialize empty assistant greeting
  useEffect(() => {
    if (!activeIdeaId && ideas.length === 0) {
      const id = uuidv4();
      const starter = {
        id,
        title: "",
        messages: [
          {
            role: "assistant",
            content: "", // stream fills this in
          },
        ],
        locked: false,
        currentStage: "ideation" as StageType,
        takeaways: {},
      };
      setIdeas([starter]);
      setActiveIdeaId(id);
    }
  }, [activeIdeaId, ideas.length]);

  // ✅ Final-safe streaming function
  const startGreetingStream = () => {
    if (hasStreamedGreeting || !activeIdeaId || ideas.length === 0) return;

    const greeting = GREETING;
    const ideaId = activeIdeaId;

    const reveal = (i: number) => {
      setIdeas((prevIdeas) =>
        prevIdeas.map((idea) => {
          if (idea.id !== ideaId) return idea;

          const updatedMessages = [...idea.messages];
          updatedMessages[0] = {
            ...updatedMessages[0],
            content: greeting.slice(0, i),
          };

          return { ...idea, messages: updatedMessages };
        })
      );

      if (i < greeting.length) {
        setTimeout(() => reveal(i + 1), 20);
      } else {
        setHasStreamedGreeting(true); // ✅ prevent loop
        if (onReady) onReady();
      }
    };

    // Delay just slightly to let state settle
    setTimeout(() => reveal(1), 50);
  };

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
    startGreetingStream,
  };
}