import React, { useState, useEffect, useRef } from "react";
import ChatPanel from "./ChatPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";
import RefinedIdeaCard from "./RefinedIdeaCard";
import ValidationSummary from "./ValidationSummary";
import BrandingCard from "./BrandingCard";
import MVPPreview from "./MVPPreview";

const baseUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://venturepilot-api.promptpulse.workers.dev";
const validateUrl = `${baseUrl}/validate`;
const brandUrl = `${baseUrl}/brand`;
const mvpUrl = `${baseUrl}/mvp`;

/**
 * ChatAssistant orchestrates the chat flow and stage progression.
 */
export default function ChatAssistant({ onReady }: { onReady?: () => void }) {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

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
        validation: prev.validation || activeIdea.currentStage === "validation",
        branding: prev.branding || activeIdea.currentStage === "branding",
      }));
    }
  }, [activeIdea?.currentStage]);

  const togglePanel = (key: "ideation" | "validation" | "branding") => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Initialize starter idea on first render and call onReady
  useEffect(() => {
    if (!activeIdeaId && ideas.length === 0) {
      const id = uuidv4();
      const starter = {
        id,
        title: "",
        messages: [
          {
            role: "assistant",
            content:
              "Hi! I'm your AI cofounder. Let's build something together.\n\nTo start, tell me about the startup idea you're exploring — even if it's rough.",
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
  // Helper to update an idea by id
  const updateIdea = (id: any, updates: any) => {
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  };

  // Send a message and handle streaming plus summarisation fallback
  const handleSend = async (content: string) => {
    const current = activeIdea;
    if (!current) return;

    const userMsg = { role: "user", content };
    const placeholder = { role: "assistant", content: "" };
    const baseMessages = [...current.messages, userMsg, placeholder];
    updateIdea(current.id, { messages: baseMessages });
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const { reply, refinedIdea, nextStage, plan } = await sendToAssistant(
      [...current.messages, userMsg],
      current.currentStage
    );
    setLoading(false);

    const reveal = (index: number, msgs: any[]) => {
      const updatedMsgs = msgs.map((m, i) =>
        i === msgs.length - 1
          ? { ...m, content: reply.slice(0, index) }
          : m
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
                current.currentStage
              );
              const summaryReply =
                summaryRes?.reply ||
                summaryRes?.summary ||
                summaryRes?.content;
              if (summaryReply) {
                finalRefined = {
                  name: (current.title || content).slice(0, 60),
                  description: summaryReply.trim(),
                };
              }
            } catch {
              // summarisation failure: use fallback
            }
          }

          updateIdea(current.id, {
            title: current.title || content.slice(0, 80),
            messages: updatedMsgs,
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
          setTimeout(
            () => handleAdvanceStage(current.id, nextStage),
            1000
          );
        }
      }
    };

    reveal(1, baseMessages);
  };  // Advance to the next stage; clicking Continue/Confirm/Accept triggers this
  const handleAdvanceStage = async (id: any, forcedStage?: StageType) => {
    setLoading(true);
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    const stageOrder: StageType[] = [
      "ideation",
      "validation",
      "branding",
      "mvp",
      "generatePlan",
    ];
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    const currentIndex = stageOrder.indexOf(
      idea.currentStage || ("ideation" as StageType)
    );
    const nextStage =
      forcedStage ||
      stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];

    // Collapse the panel we're leaving
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

    if (nextStage === "validation") {
      const res = await fetch(validateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      const summary = data?.validation?.split("\n")[0] || "";
      const messages = [
        ...idea.messages,
        {
          role: "assistant",
          content: `✅ Validation complete. Here's what we found:\n\n${summary}`,
        },
      ];
      updateIdea(id, {
        messages,
        validation: data?.validation,
        takeaways: {
          ...idea.takeaways,
          validationSummary: summary,
        },
      });
    }

    if (nextStage === "branding") {
      const res = await fetch(brandUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      const brandingSummary = `✅ Branding complete!\n\n• Name: ${data.name}\n• Tagline: ${data.tagline}\n• Colors: ${data.colors?.join(
        ", "
      )}\n• Logo: ${data.logoDesc}`;
      const messages = [...idea.messages, { role: "assistant", content: brandingSummary }];
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
    }

    if (nextStage === "mvp") {
      const replyText = `✅ You're ready to deploy your MVP!\n\nClick below to deploy it to a live site.`;
      const messages = [...idea.messages, { role: "assistant", content: replyText }];
      updateIdea(id, { messages });
    }

    setLoading(false);
  };

  // Deploy the generated MVP
  const handleConfirmBuild = async (id: any) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea || !idea.takeaways?.branding || !idea.messages?.length) {
      updateIdea(id, {
        deployError: "Missing ideaId, branding, or messages",
      });
      return;
    }

    updateIdea(id, { deploying: true });

    const res = await fetch(mvpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ideaId: idea.id,
        branding: idea.takeaways.branding,
        messages: idea.messages,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      updateIdea(id, {
        deploying: false,
        deployError: data.error || "Unknown error",
      });
      return;
    }

    const deployedUrl = data.workerUrl || data.pagesUrl;
    updateIdea(id, {
      deploying: false,
      deployed: true,
      repoUrl: data.repoUrl,
      pagesUrl: deployedUrl,
    });
  };  return (
    <div className="flex flex-col gap-8 mt-6 px-2">
      {/* Chat container */}
      <div className="flex flex-col w-full">
        {ideas.map((idea) => (
          <div key={idea.id} className="mb-6">
            <ChatPanel
              messages={idea.messages}
              onSend={(msg) => {
                setActiveIdeaId(idea.id);
                handleSend(msg);
              }}
              loading={loading && idea.id === activeIdeaId}
              idea={idea}
              isActive={idea.id === activeIdeaId}
              onClick={() => setActiveIdeaId(idea.id)}
              disabled={idea.locked}
            />
          </div>
        ))}
        {/* marker div to scroll to when a new message is sent */}
        <div ref={messageEndRef} />
      </div>

      {/* Panel stack: each panel always rendered; current stage expands its content */}
      {activeIdea && (
        <div className="w-full space-y-4" ref={panelRef}>
          {/* Refined Idea panel */}
          {activeIdea.takeaways?.refinedIdea && (
            <div
              className={`rounded border border-gray-200 p-2 ${
                activeIdea.currentStage === "ideation" || openPanels.ideation
                  ? "bg-blue-100"
                  : "bg-blue-50"
              }`}
            >
              <div
                className="font-medium mb-1 flex items-center justify-between cursor-pointer"
                onClick={() => togglePanel("ideation")}
              >
                <span>Idea</span>
                <span className="text-gray-400">
                  {activeIdea.currentStage === "ideation" || openPanels.ideation
                    ? "▲"
                    : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "ideation" || openPanels.ideation) && (
                <RefinedIdeaCard
                  name={activeIdea.takeaways.refinedIdea.name}
                  description={activeIdea.takeaways.refinedIdea.description}
                  onConfirm={() =>
                    handleAdvanceStage(activeIdea.id, "validation")
                  }
                  onEdit={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                />
              )}
            </div>
          )}

          {/* Validation panel */}
          {activeIdea.takeaways?.validationSummary && (
            <div
              className={`rounded border border-gray-200 p-2 ${
                activeIdea.currentStage === "validation" || openPanels.validation
                  ? "bg-blue-100"
                  : "bg-blue-50"
              }`}
            >
              <div
                className="font-medium mb-1 flex items-center justify-between cursor-pointer"
                onClick={() => togglePanel("validation")}
              >
                <span>Validation</span>
                <span className="text-gray-400">
                  {activeIdea.currentStage === "validation" || openPanels.validation
                    ? "▲"
                    : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "validation" || openPanels.validation) && (
                <ValidationSummary
                  summary={activeIdea.takeaways.validationSummary}
                  fullText={activeIdea.validation}
                  onContinue={() =>
                    handleAdvanceStage(activeIdea.id, "branding")
                  }
                  onRestart={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                />
              )}
            </div>
          )}

          {/* Branding panel */}
          {activeIdea.takeaways?.branding && (
            <div
              className={`rounded border border-gray-200 p-2 ${
                activeIdea.currentStage === "branding" || openPanels.branding
                  ? "bg-blue-100"
                  : "bg-blue-50"
              }`}
            >
              <div
                className="font-medium mb-1 flex items-center justify-between cursor-pointer"
                onClick={() => togglePanel("branding")}
              >
                <span>Branding</span>
                <span className="text-gray-400">
                  {activeIdea.currentStage === "branding" || openPanels.branding
                    ? "▲"
                    : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "branding" || openPanels.branding) && (
                <BrandingCard
                  name={activeIdea.takeaways.branding.name}
                  tagline={activeIdea.takeaways.branding.tagline}
                  colors={activeIdea.takeaways.branding.colors}
                  logoDesc={activeIdea.takeaways.branding.logoDesc}
                  logoUrl={activeIdea.takeaways.branding.logoUrl}
                  onAccept={() =>
                    handleAdvanceStage(activeIdea.id, "mvp")
                  }
                  onRegenerate={() =>
                    handleAdvanceStage(activeIdea.id, "branding")
                  }
                  onRestart={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({
                      behavior: "smooth",
                    });
                  }}
                />
              )}
            </div>
          )}

          {/* MVP panel */}
          {activeIdea.currentStage === "mvp" && (
            <div className="rounded border border-gray-200 p-2 bg-yellow-100">
              <div className="font-medium mb-1">MVP Preview</div>
              <MVPPreview
                ideaName={activeIdea.title || "Your Idea"}
                onDeploy={() => handleConfirmBuild(activeIdea.id)}
                deploying={activeIdea.deploying}
                deployedUrl={activeIdea.pagesUrl}
                deployError={activeIdea.deployError}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

