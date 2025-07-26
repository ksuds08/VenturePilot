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
 * Changes from the original implementation:
 * - Always uses a single‑column layout so the stage panels appear
 *   below the chat on all screen sizes.
 * - Uses <details> elements to collapse panels from earlier phases,
 *   showing a summary line (via <summary>) and keeping the current phase expanded.
 * - Includes the previous modifications: streaming scroll behavior and
 *   scrolling to the bottom when Edit/Restart is clicked.
 */
export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

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

    // Simulated typing: gradually reveal the reply
    const reveal = (index: number, msgs: any[]) => {
      // Update last message content up to the current index
      const updatedMsgs = msgs.map((m, i) =>
        i === msgs.length - 1 ? { ...m, content: reply.slice(0, index) } : m
      );
      updateIdea(current.id, { messages: updatedMsgs });

      if (index <= reply.length) {
        // Continue revealing one character at a time
        setTimeout(() => reveal(index + 1, updatedMsgs), 20);
      } else {
        // Streaming complete: commit the final reply and takeaways
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

        // Move to the next stage if suggested
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
    const stageOrder: StageType[] = ["ideation", "validation", "branding", "mvp", "generatePlan"];
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    const currentIndex = stageOrder.indexOf(idea.currentStage || ("ideation" as StageType));
    const nextStage = forcedStage || stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];
    updateIdea(id, { currentStage: nextStage });

    // handle transitions as before (validation, branding, mvp)...

    setLoading(false);
  };

  // Kick off the build and deploy the generated MVP
  const handleConfirmBuild = async (id: any) => {
    // same implementation as before...
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

      {/* Panel stack below chat */}
      {activeIdea && (
        <div className="w-full space-y-4" ref={panelRef}>
          {/* Idea panel */}
          {activeIdea.takeaways?.refinedIdea && (
            <details
              className="rounded border border-gray-200 p-2"
              open={activeIdea.currentStage === "ideation"}
            >
              <summary className="font-medium cursor-pointer">
                Idea: {activeIdea.takeaways.refinedIdea.name}
              </summary>
              {activeIdea.currentStage === "ideation" && (
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
            </details>
          )}

          {/* Validation panel */}
          {activeIdea.takeaways?.validationSummary && (
            <details
              className="rounded border border-gray-200 p-2"
              open={activeIdea.currentStage === "validation"}
            >
              <summary className="font-medium cursor-pointer">
                Validation: {activeIdea.takeaways.validationSummary}
              </summary>
              {activeIdea.currentStage === "validation" && (
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
            </details>
          )}

          {/* Branding panel */}
          {activeIdea.takeaways?.branding && (
            <details
              className="rounded border border-gray-200 p-2"
              open={activeIdea.currentStage === "branding"}
            >
              <summary className="font-medium cursor-pointer">
                Branding: {activeIdea.takeaways.branding.name} —{" "}
                {activeIdea.takeaways.branding.tagline}
              </summary>
              {activeIdea.currentStage === "branding" && (
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
            </details>
          )}

          {/* MVP panel */}
          {activeIdea.currentStage === "mvp" && (
            <details className="rounded border border-gray-200 p-2" open>
              <summary className="font-medium cursor-pointer">MVP Preview</summary>
              <MVPPreview
                ideaName={activeIdea.title || "Your Idea"}
                onDeploy={() => handleConfirmBuild(activeIdea.id)}
                deploying={activeIdea.deploying}
                deployedUrl={activeIdea.pagesUrl}
                deployError={activeIdea.deployError}
              />
            </details>
          )}
        </div>
      )}
    </div>
  );
}