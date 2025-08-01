import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";
import { GREETING, STAGE_ORDER } from "../constants/messages";
import { sendToAssistant } from "../lib/assistantClient";
import { postValidate, postBranding } from "../lib/api";
import { getMvpStream } from "../lib/api";
import { initializeIdea, updateIdea as rawUpdateIdea } from "./useIdeaLifecycle";
import sanitizeMessages from "../utils/sanitizeMessages";

export default function useChatStages(onReady?: () => void) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  const [openPanels, setOpenPanels] = useState({
    ideation: false,
    validation: false,
    branding: false,
  });

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

  return {
    ideas,
    activeIdeaId,
    setActiveIdeaId,
    loading,
    deployLogs,
    openPanels,
    togglePanel: () => {}, // placeholder
    messageEndRef,
    panelRef,
    handleSend: () => {}, // will be filled in next step
    handleAdvanceStage: () => {}, // will be filled in next step
    handleConfirmBuild: () => {}, // will be filled in next step
  };
}