import React, { useState, useEffect, useRef } from "react";
import ChatPanel from "./ChatPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";
import RefinedIdeaCard from "./RefinedIdeaCard";
import ValidationSummary from "./ValidationSummary";
import BrandingCard from "./BrandingCard"; // you can remove this import if it's no longer used

const baseUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://venturepilot-api.promptpulse.workers.dev";
const validateUrl = `${baseUrl}/validate`;
const brandUrl = `${baseUrl}/brand`;
const mvpUrl = `${baseUrl}/mvp`;

type ChatAssistantProps = {
  onReady?: () => void;
};

export default function ChatAssistant(props: ChatAssistantProps) {
  const { onReady } = props;

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

  // Update an idea by id
  const updateIdea = (id: any, updates: any) => {
    setIdeas((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  };

  // Send a message and handle assistant interaction
  const handleSend = async (content: string) => {
    const current = activeIdea;
    if (!current) return;

    const trimmed = content.trim().toLowerCase();

    // Intercept commands during branding stage
    if (current.currentStage === "branding") {
      if (trimmed.includes("accept") && trimmed.includes("branding")) {
        // Echo the user's response
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "mvp");
        return;
      }
      if (trimmed.includes("regenerate") && trimmed.includes("branding")) {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "branding");
        return;
      }
      if (trimmed.includes("start over")) {
        updateIdea(current.id, {
          messages: [...current.messages, { role: "user", content }],
        });
        handleAdvanceStage(current.id, "ideation");
        return;
      }
    }

    // Intercept "deploy" during MVP stage
    if (
      current.currentStage === "mvp" &&
      trimmed.includes("deploy")
    ) {
      updateIdea(current.id, {
        messages: [...current.messages, { role: "user", content }],
      });
      // Optional: inform user that deployment is starting
      updateIdea(current.id, (prev: any) => ({
        messages: [
          ...prev.messages,
          { role: "assistant", content: "🚀 Deploying your MVP…" },
        ],
      }));
      handleConfirmBuild(current.id);
      return;
    }

    // Normal chat flow
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
              const summaryReply = summaryRes?.reply;
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
  };

  // Advance to the next stage; clicking Continue/Confirm/Accept triggers this
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

      // Build a chat-friendly summary of the branding data
      const brandingMessage = [
        "✅ **Branding complete!**",
        "",
        `**Name:** ${data.name}`,
        `**Tagline:** ${data.tagline}`,
        `**Colors:** ${data.colors?.join(", ")}`,
        `**Logo Concept:** ${data.logoDesc}`,
        data.logoUrl ? `![Generated Logo](${data.logoUrl})` : "",
        "",
        'Type "accept branding" to proceed to the MVP stage, "regenerate branding" to try again, or "start over" to revisit your idea.',
      ].join("\n");

      const messages = [
        ...idea.messages,
        { role: "assistant", content: brandingMessage },
      ];
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
      const replyText = `✅ You're ready to deploy your MVP!\n\nType "deploy" when you're ready to launch it to a live site.`;
      const messages = [...idea.messages, { role: "assistant", content: replyText }];
      updateIdea(id, { messages });
    }

    setLoading(false);
  };

  // Deploy the generated MVP with simulated progress logs; append to chat
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
    // Capture the current chat history
    let messageAccumulator = [...idea.messages];

    const steps = [
      "Planning project structure…",
      "Generating backend code…",
      "Generating frontend code…",
      "Packaging files…",
      "Deploying to Cloudflare Pages…",
    ];
    let stepIndex = 0;
    const interval = setInterval(() => {
      const log = steps[stepIndex];
      if (log) {
        setDeployLogs((prev) => [...prev, log]);
        messageAccumulator = [
          ...messageAccumulator,
          { role: "assistant", content: log },
        ];
        updateIdea(id, { messages: [...messageAccumulator] });
      }
      stepIndex++;
      if (stepIndex >= steps.length) {
        clearInterval(interval);
      }
    }, 10000);

    try {
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
      clearInterval(interval);

      if (!res.ok) {
        const errorMsg = data.error || "Unknown error";
        messageAccumulator = [
          ...messageAccumulator,
          { role: "assistant", content: `❌ Deployment failed: ${errorMsg}` },
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
    } catch (err) {
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

  return (
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
      <div ref={messageEndRef} />
      </div>

      {activeIdea && (
        <div className="w-full space-y-4" ref={panelRef}>
          {/* You can optionally leave the panels collapsed or remove them altogether */}
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

          {/* Branding panel is now optional; results are shown in chat */}
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
        </div>
      )}
    </div>
  );
}