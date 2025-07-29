import { useState, useEffect, useRef } from "react";
import { v4 as uuidv4 } from "uuid";
import { sendToAssistant } from "../lib/assistantClient";
import type { VentureStage as StageType } from "../types";
import {
  GREETING,
  STAGE_ORDER,
  DEPLOYMENT_STEPS,
} from "../constants/messages";
import {
  postValidate,
  postBranding,
  postMvp,
} from "../lib/api";

/**
 * Custom hook encapsulating all of the state and behaviour for the chat
 * assistant. Components that need to drive the chat interface can
 * import and call this hook rather than implementing state, side
 * effects and network calls directly. Doing so keeps the
 * presentation layer lean and improves testability.
 *
 * @param onReady Optional callback invoked when the first idea is created.
 */
export default function useChatStages(onReady?: () => void) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [deployLogs, setDeployLogs] = useState<string[]>([]);

  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  // Panel flags retained for backward compatibility; no longer used in the UI.
  const [openPanels, setOpenPanels] = useState({
    ideation: false,
    validation: false,
    branding: false,
  });

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

  // Initialise the first conversation with a greeting.
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

  const updateIdea = (id: any, updates: any) => {
    setIdeas((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              ...(typeof updates === "function" ? updates(i) : updates),
            }
          : i,
      ),
    );
  };

  const handleSend = async (content: string) => {
    const current = activeIdea;
    if (!current) return;

    const trimmed = content.trim().toLowerCase();

    // Ideation commands via summary buttons
    if (current.currentStage === "ideation") {
      if (trimmed === "continue") {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "validation");
        return;
      }
      if (trimmed === "restart" || trimmed === "edit idea") {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        return;
      }
    }

    // Validation commands via summary buttons
    if (current.currentStage === "validation") {
      if (trimmed === "continue") {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "branding");
        return;
      }
      if (trimmed === "restart") {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "ideation");
        return;
      }
    }

    // Branding commands via summary buttons
    if (current.currentStage === "branding") {
      if (trimmed === "accept branding") {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "mvp");
        return;
      }
      if (trimmed === "regenerate branding") {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "branding");
        return;
      }
      if (trimmed === "start over") {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "ideation");
        return;
      }
    }

    // MVP stage command
    if (current.currentStage === "mvp" && trimmed === "deploy") {
      updateIdea(current.id, {
        messages: [...current.messages, { role: "user", content }],
      });
      updateIdea(current.id, (prev: any) => ({
        messages: [
          ...prev.messages,
          { role: "assistant", content: "🚀 Deploying your MVP…" },
        ],
      }));
      handleConfirmBuild(current.id);
      return;
    }

    // Otherwise handle as a normal assistant request
    const userMsg = { role: "user", content };
    const placeholder = { role: "assistant", content: "" };
    const baseMessages = [...current.messages, userMsg, placeholder];
    updateIdea(current.id, { messages: baseMessages });
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const { reply, refinedIdea, nextStage, plan } = await sendToAssistant(
      [...current.messages, userMsg],
      current.currentStage,
    );
    setLoading(false);

    const reveal = (index: number, msgs: any[]) => {
      const updatedMsgs = msgs.map((m, i) =>
        i === msgs.length - 1 ? { ...m, content: reply.slice(0, index) } : m,
      );
      updateIdea(current.id, { messages: updatedMsgs });

      if (index <= reply.length) {
        setTimeout(() => reveal(index + 1, updatedMsgs), 20);
      } else {
        let summaryDesc = reply || content;
        try {
          const parts = summaryDesc.split(/(?<=[.!?])\s+/);
          summaryDesc = parts.slice(0, 2).join(" ");
          if (!summaryDesc) {
            summaryDesc = (reply || content).slice(0, 150);
          }
        } catch {
          summaryDesc = (reply || content).slice(0, 150);
        }

        const fallbackRefined = {
          name: (current.title || content).slice(0, 60),
          description: summaryDesc,
        };

        (async () => {
          let finalRefined =
            refinedIdea || current.takeaways.refinedIdea || fallbackRefined;

          // Summarise if no refinedIdea returned (ideation stage only).
          if (!refinedIdea && current.currentStage === "ideation") {
            try {
              const summaryRes = await sendToAssistant(
                [
                  ...current.messages,
                  userMsg,
                  { role: "assistant", content: reply },
                  {
                    role: "user",
                    content: "Please summarise the above idea concisely.",
                  },
                ],
                current.currentStage,
              );
              const summaryReply = summaryRes?.reply;
              if (summaryReply) {
                finalRefined = {
                  name: (current.title || content).slice(0, 60),
                  description: summaryReply.trim(),
                };
              }
            } catch {
              // ignore errors
            }
          }

          // Build interactive summary if still in ideation.
          let finalMessages = updatedMsgs;
          if (current.currentStage === "ideation") {
            const summaryMsg = {
              role: "assistant",
              content:
                `✅ Here's the refined idea:\n\n` +
                `**Name:** ${finalRefined.name}\n` +
                `**Description:** ${finalRefined.description}\n\n`,
              actions: [
                { label: "Continue to Validation", command: "continue" },
                { label: "Edit Idea", command: "restart" },
              ],
            } as any;
            finalMessages = [...updatedMsgs, summaryMsg];
          }

          updateIdea(current.id, {
            title: current.title || content.slice(0, 80),
            messages: finalMessages,
            takeaways: {
              ...current.takeaways,
              refinedIdea: finalRefined,
            },
            ...(plan && { finalPlan: plan }),
          });
        })();

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

  const handleAdvanceStage = async (id: any, forcedStage?: StageType) => {
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const idea = ideas.find((i) => i.id === id);
    if (!idea) {
      setLoading(false);
      return;
    }

    const currentIndex = STAGE_ORDER.indexOf(
      (idea.currentStage as StageType) || ("ideation" as StageType),
    );
    const nextStage =
      forcedStage || STAGE_ORDER[Math.min(currentIndex + 1, STAGE_ORDER.length - 1)];

    // Collapse panel flags (not visible).
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

    // Validation stage summary
    if (nextStage === "validation") {
      try {
        const data = await postValidate(idea.title, idea.id);
        const summary = data?.validation?.split("\n")[0] || "";
        const validationMsg = {
          role: "assistant" as const,
          content:
            `✅ Validation complete. Here's what we found:\n\n${summary}\n\n`,
          actions: [
            { label: "Continue to Branding", command: "continue" },
            { label: "Restart", command: "restart" },
          ],
        };
        const messages = [...idea.messages, validationMsg];
        updateIdea(id, {
          messages,
          validation: data?.validation,
          takeaways: {
            ...idea.takeaways,
            validationSummary: summary,
          },
        });
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

    // Branding stage summary
    if (nextStage === "branding") {
      try {
        const data = await postBranding(idea.title, idea.id);
        const brandingMsg = {
          role: "assistant" as const,
          content:
            "✅ **Branding complete!**\n\n" +
            `**Name:** ${data.name}\n` +
            `**Tagline:** ${data.tagline}\n` +
            `**Colors:** ${data.colors?.join(", ")}\n` +
            `**Logo Concept:** ${data.logoDesc}\n\n`,
          imageUrl: data.logoUrl || undefined,
          actions: [
            { label: "Accept Branding", command: "accept branding" },
            { label: "Regenerate Branding", command: "regenerate branding" },
            { label: "Start Over", command: "start over" },
          ],
        };
        const messages = [...idea.messages, brandingMsg];
        updateIdea(id, {
          messages,
          branding: data,
          takeaways: {
            ...idea.takeaways,
            branding: {
              name: data.name,
              tagline: data.tagline,
              colors: data.colors,
              logoDesc: data.logoDesc,
              logoUrl: data.logoUrl || "",
            },
          },
        });
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

    // MVP stage summary
    if (nextStage === "mvp") {
      const mvpMsg = {
        role: "assistant" as const,
        content: "✅ You're ready to deploy your MVP!\n\n",
        actions: [
          { label: "Deploy", command: "deploy" },
        ],
      };
      const messages = [...idea.messages, mvpMsg];
      updateIdea(id, { messages });
    }

    setLoading(false);
  };

  const handleConfirmBuild = async (id: any) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea || !idea.takeaways?.branding || !idea.messages?.length) {
      updateIdea(id, {
        deployError: "Missing ideaId, branding, or messages",
      });
      return;
    }

    updateIdea(id, { deploying: true });
    setDeployLogs([]);
    let messageAccumulator = [...idea.messages];

    if (DEPLOYMENT_STEPS.length > 0) {
      messageAccumulator = [
        ...messageAccumulator,
        { role: "assistant", content: DEPLOYMENT_STEPS[0] },
      ];
      updateIdea(id, { messages: [...messageAccumulator] });
    }

    let stepIndex = 1;
    const interval = setInterval(() => {
      if (stepIndex < DEPLOYMENT_STEPS.length) {
        const log = DEPLOYMENT_STEPS[stepIndex];
        setDeployLogs((prev) => [...prev, log]);
        messageAccumulator = [
          ...messageAccumulator,
          { role: "assistant", content: log },
        ];
        updateIdea(id, { messages: [...messageAccumulator] });
        stepIndex++;
      } else {
        clearInterval(interval);
      }
    }, 10000);

    try {
      const res = await postMvp(
        idea.id,
        idea.takeaways.branding,
        idea.messages,
      );
      const data = await res.json();
      clearInterval(interval);

      if (!res.ok) {
        const errorMsg = data.error || "Unknown error";
        messageAccumulator = [
          ...messageAccumulator,
          {
            role: "assistant",
            content: `❌ Deployment failed: ${errorMsg}`,
          },
        ];
        updateIdea(id, {
          deploying: false,
          deployError: errorMsg,
          messages: [...messageAccumulator],
        });
        return;
      }

      const deployedUrl = data.workerUrl || data.pagesUrl;
      messageAccumulator = [
        ...messageAccumulator,
        {
          role: "assistant",
          content: `✅ Deployment successful! Your site is live at ${deployedUrl}`,
        },
      ];
      updateIdea(id, {
        deploying: false,
        deployed: true,
        repoUrl: data.repoUrl,
        pagesUrl: deployedUrl,
        messages: [...messageAccumulator],
      });
    } catch (err: any) {
      clearInterval(interval);
      const errorMsg = err instanceof Error ? err.message : String(err);
      messageAccumulator = [
        ...messageAccumulator,
        {
          role: "assistant",
          content: `❌ Deployment failed: ${errorMsg}`,
        },
      ];
      updateIdea(id, {
        deploying: false,
        deployError: errorMsg,
        messages: [...messageAccumulator],
      });
    }
  };

  return {
    ideas,
    activeIdeaId,
    setActiveIdeaId,
    loading,
    deployLogs,
    openPanels,
    togglePanel: () => {}, // no-op; kept for API compatibility
    messageEndRef,
    panelRef,
    handleSend,
    handleAdvanceStage,
    handleConfirmBuild,
  };
}