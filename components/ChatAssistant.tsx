import React, { useState, useEffect, useRef } from "react";
import ChatPanel from "./ChatPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";
import RefinedIdeaCard from "./RefinedIdeaCard";
import ValidationSummary from "./ValidationSummary";
import BrandingCard from "./BrandingCard";
import MVPPreview from "./MVPPreview";

// Base URLs for the API endpoints
const baseUrl =
  process.env.NEXT_PUBLIC_API_URL || "https://venturepilot-api.promptpulse.workers.dev";
const validateUrl = `${baseUrl}/validate`;
const brandUrl = `${baseUrl}/brand`;
const mvpUrl = `${baseUrl}/mvp`;

/**
 * ChatAssistant orchestrates the chat flow and stage progression.
 *
 * Key behaviours:
 * - Always uses a single-column layout: chat on top, panels below.
 * - Each phase panel persists; earlier phases are collapsed to a summary line.
 * - User can expand/collapse panels manually, and the current stage panel opens automatically.
 * - Scrolls to the bottom of the chat when sending a message or when Edit/Restart is clicked.
 * - Shows a spinner during long operations (validation, branding, etc.).
 */
export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  // Track which panels are explicitly open. When a stage is active it is automatically open.
  const [openPanels, setOpenPanels] = useState({
    ideation: false,
    validation: false,
    branding: false,
  });

  // Ensure the current stage panel is open by default when stage changes
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

  // Helper to toggle panel open state when header clicked
  const togglePanel = (key: "ideation" | "validation" | "branding") => {
    setOpenPanels((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Initialize a starter idea on first render
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
    }
  }, [activeIdeaId, ideas.length]);

  // Helper to update an idea by id
  const updateIdea = (id: any, updates: any) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  // Handle sending a user message with simulated streaming
  const handleSend = async (content: string) => {
    const current = activeIdea;
    if (!current) return;

    // Insert the user's message and an empty assistant placeholder
    const userMsg = { role: "user", content };
    const placeholder = { role: "assistant", content: "" };
    const baseMessages = [...current.messages, userMsg, placeholder];
    updateIdea(current.id, { messages: baseMessages });
    setLoading(true);

    // Scroll to the bottom of the chat when a new message is added
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });

    // Fetch the assistant's full reply (no streaming API)
    const { reply, refinedIdea, nextStage, plan } = await sendToAssistant(
      [...current.messages, userMsg],
      current.currentStage
    );
    // Once we've received the full reply from the assistant we want
    // to stop showing the loading spinner.  The response will now be
    // streamed via the reveal() helper below, so we clear the
    // loading flag before starting the streaming animation.  If
    // loading remains true here the spinner will continue to display
    // on top of the chat while the text is being revealed.
    setLoading(false);

    // Simulated typing: gradually reveal the reply
    const reveal = (index: number, msgs: any[]) => {
      const updatedMsgs = msgs.map((m, i) =>
        i === msgs.length - 1 ? { ...m, content: reply.slice(0, index) } : m
      );
      updateIdea(current.id, { messages: updatedMsgs });

      if (index <= reply.length) {
        setTimeout(() => reveal(index + 1, updatedMsgs), 20);
      } else {
        updateIdea(current.id, {
          title: current.title || content.slice(0, 80),
          messages: updatedMsgs,
          takeaways: {
            ...current.takeaways,
            refinedIdea: refinedIdea || current.takeaways.refinedIdea,
          },
          ...(plan && { finalPlan: plan }),
        });
        setLoading(false);

        // Scroll to the stage panel once the stream is done
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

  // Advance to the next stage (validation → branding → mvp, etc.)
  const handleAdvanceStage = async (id: any, forcedStage?: StageType) => {
    setLoading(true);
    // Ensure the spinner is visible by scrolling to the bottom of the chat
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    const stageOrder: StageType[] = ["ideation", "validation", "branding", "mvp", "generatePlan"];
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    const currentIndex = stageOrder.indexOf(idea.currentStage || ("ideation" as StageType));
    const nextStage = forcedStage || stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];
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
        { role: "assistant", content: `✅ Validation complete. Here's what we found:\n\n${summary}` },
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

  // Kick off the build and deploy the generated MVP
  const handleConfirmBuild = async (id: any) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea || !idea.takeaways?.branding || !idea.messages?.length) {
      updateIdea(id, { deployError: "Missing ideaId, branding, or messages" });
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
      updateIdea(id, { deploying: false, deployError: data.error || "Unknown error" });
      return;
    }
    updateIdea(id, {
      deploying: false,
      deployed: true,
      repoUrl: data.repoUrl,
      pagesUrl: data.pagesUrl,
    });
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
        {/* marker div to scroll to when a new message is sent */}
        <div ref={messageEndRef} />
      </div>

      {/* Panel stack: each panel always rendered; current stage expands its content */}
      {activeIdea && (
        <div className="w-full space-y-4" ref={panelRef}>
          {/* Refined Idea */}
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
                  {activeIdea.currentStage === "ideation" || openPanels.ideation ? "▲" : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "ideation" || openPanels.ideation) && (
                <RefinedIdeaCard
                  name={activeIdea.takeaways.refinedIdea.name}
                  description={activeIdea.takeaways.refinedIdea.description}
                  onConfirm={() => handleAdvanceStage(activeIdea.id, "validation")}
                  onEdit={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              )}
            </div>
          )}

          {/* Validation */}
          {activeIdea.takeaways?.validationSummary && (
            <div
              className={`rounded border border-gray-200 p-2 ${
                activeIdea.currentStage === "validation" || openPanels.validation
                  ? "bg-green-100"
                  : "bg-green-50"
              }`}
            >
              <div
                className="font-medium mb-1 flex items-center justify-between cursor-pointer"
                onClick={() => togglePanel("validation")}
              >
                <span>Validation</span>
                <span className="text-gray-400">
                  {activeIdea.currentStage === "validation" || openPanels.validation ? "▲" : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "validation" || openPanels.validation) && (
                <ValidationSummary
                  summary={activeIdea.takeaways.validationSummary}
                  fullText={activeIdea.validation}
                  onContinue={() => handleAdvanceStage(activeIdea.id, "branding")}
                  onRestart={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              )}
            </div>
          )}

          {/* Branding */}
          {activeIdea.takeaways?.branding && (
            <div
              className={`rounded border border-gray-200 p-2 ${
                activeIdea.currentStage === "branding" || openPanels.branding
                  ? "bg-purple-100"
                  : "bg-purple-50"
              }`}
            >
              <div
                className="font-medium mb-1 flex items-center justify-between cursor-pointer"
                onClick={() => togglePanel("branding")}
              >
                <span>Branding</span>
                <span className="text-gray-400">
                  {activeIdea.currentStage === "branding" || openPanels.branding ? "▲" : "▼"}
                </span>
              </div>
              {(activeIdea.currentStage === "branding" || openPanels.branding) && (
                <BrandingCard
                  name={activeIdea.takeaways.branding.name}
                  tagline={activeIdea.takeaways.branding.tagline}
                  colors={activeIdea.takeaways.branding.colors}
                  logoDesc={activeIdea.takeaways.branding.logoDesc}
                  logoUrl={activeIdea.takeaways.branding.logoUrl}
                  onAccept={() => handleAdvanceStage(activeIdea.id, "mvp")}
                  onRegenerate={() => handleAdvanceStage(activeIdea.id, "branding")}
                  onRestart={() => {
                    setActiveIdeaId(activeIdea.id);
                    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  }}
                />
              )}
            </div>
          )}

          {/* MVP preview */}
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