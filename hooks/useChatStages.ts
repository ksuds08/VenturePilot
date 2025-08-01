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

  useEffect(() => {
    if (!activeIdeaId && ideas.length === 0) {
      const starter = initializeIdea(uuidv4(), GREETING);
      setIdeas([starter]);
      setActiveIdeaId(starter.id);
      if (onReady) onReady();
    }
  }, [activeIdeaId, ideas.length, onReady]);

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
    togglePanel: () => {}, // placeholder for future logic
    messageEndRef,
    panelRef,
    handleSend,
    handleAdvanceStage,
    handleConfirmBuild,
  };
}