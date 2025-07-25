// ChatAssistant.tsx (Finalized with all typed props for ChatPanel, RefinedIdeaCard, ValidationSummary, and BrandingCard)

import React, { useState, useEffect } from "react";
import ChatPanel from "./ChatPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";
import RefinedIdeaCard from "./RefinedIdeaCard";
import ValidationSummary from "./ValidationSummary";
import BrandingCard from "./BrandingCard";
import MVPPreview from "./MVPPreview";

const baseUrl = process.env.NEXT_PUBLIC_API_URL || "https://venturepilot-api.promptpulse.workers.dev";
const validateUrl = `${baseUrl}/validate`;
const brandUrl = `${baseUrl}/brand`;
const mvpUrl = `${baseUrl}/mvp`;

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState([]);
  const [activeIdeaId, setActiveIdeaId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

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
        currentStage: "ideation",
        takeaways: {},
      };
      setIdeas([starter]);
      setActiveIdeaId(id);
    }
  }, [activeIdeaId, ideas.length]);

  const updateIdea = (id, updates) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const handleSend = async (content) => {
    const current = activeIdea;
    if (!current) return;
    const updatedMessages = [...current.messages, { role: "user", content }];
    updateIdea(current.id, { messages: updatedMessages });
    setLoading(true);
    setShowPanel(false);
    const { reply, refinedIdea, nextStage, plan } = await sendToAssistant(updatedMessages, current.currentStage);
    const updates = {
      title: current.title || content.slice(0, 80),
      messages: [...updatedMessages, { role: "assistant", content: reply }],
      takeaways: {
        ...current.takeaways,
        refinedIdea: refinedIdea || current.takeaways.refinedIdea,
      },
      ...(plan && { finalPlan: plan }),
    };
    updateIdea(current.id, updates);
    if (nextStage && nextStage !== current.currentStage) {
      setTimeout(() => handleAdvanceStage(current.id, nextStage), 1000);
    }
    setLoading(false);
  };

  const handleAdvanceStage = async (id, forcedStage) => {
    setLoading(true);
    setShowPanel(false);
    const stageOrder = ["ideation", "validation", "branding", "mvp", "generatePlan"];
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    const currentIndex = stageOrder.indexOf(idea.currentStage || "ideation");
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
      const messages = [...idea.messages, { role: "assistant", content: `✅ Validation complete. Here's what we found:\n\n${summary}` }];
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
      const brandingSummary = `✅ Branding complete!\n\n• Name: ${data.name}\n• Tagline: ${data.tagline}\n• Colors: ${data.colors?.join(", ")}\n• Logo: ${data.logoDesc}`;
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
      const reply = `✅ You're ready to deploy your MVP!\n\nClick below to deploy it to a live site.`;
      const messages = [...idea.messages, { role: "assistant", content: reply }];
      updateIdea(id, { messages });
    }

    setLoading(false);
  };

  const handleConfirmBuild = async (id) => {
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
    <div className="flex flex-col lg:flex-row gap-8 lg:mt-0 mt-6">
      <div className="flex flex-col w-full lg:w-7/12 px-2 lg:px-0">
        {ideas.map((idea) => (
          <div key={idea.id} className="mb-6">
            <ChatPanel
              messages={idea.messages}
              onSend={(content) => {
                setActiveIdeaId(idea.id);
                setShowPanel(false);
                handleSend(content);
              }}
              loading={loading && idea.id === activeIdeaId}
              onStreamComplete={(streamed) => {
                const updated = [...idea.messages, { role: "assistant", content: streamed }];
                updateIdea(idea.id, { messages: updated });
              }}
              idea={idea}
              isActive={idea.id === activeIdeaId}
              onClick={() => {
                setActiveIdeaId(idea.id);
                setShowPanel(true);
              }}
              disabled={idea.locked}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col w-full lg:w-5/12">
        {activeIdea && (
          <>
            {activeIdea.takeaways?.refinedIdea && (
              <RefinedIdeaCard
                name={activeIdea.takeaways.refinedIdea.name}
                description={activeIdea.takeaways.refinedIdea.description}
                onConfirm={() => handleAdvanceStage(activeIdea.id, "validation")}
                onEdit={() => {
                  setShowPanel(true);
                  setActiveIdeaId(activeIdea.id);
                }}
              />
            )}
            {activeIdea.takeaways?.validationSummary && (
              <ValidationSummary
                summary={activeIdea.takeaways.validationSummary}
                onContinue={() => handleAdvanceStage(activeIdea.id, "branding")}
                onRestart={() => {
                  setShowPanel(true);
                  setActiveIdeaId(activeIdea.id);
                }}
              />
            )}
            {activeIdea.takeaways?.branding && (
              <BrandingCard
                name={activeIdea.takeaways.branding.name}
                tagline={activeIdea.takeaways.branding.tagline}
                colors={activeIdea.takeaways.branding.colors}
                logoDesc={activeIdea.takeaways.branding.logoDesc}
                logoUrl={activeIdea.takeaways.branding.logoUrl}
                onAccept={() => handleAdvanceStage(activeIdea.id, "mvp")}
                onRegenerate={() => handleAdvanceStage(activeIdea.id, "branding")}
                onRestart={() => {
                  setShowPanel(true);
                  setActiveIdeaId(activeIdea.id);
                }}
              />
            )}
            {activeIdea.finalPlan && (
              <MVPPreview
                plan={activeIdea.finalPlan}
                branding={activeIdea.takeaways.branding}
                onConfirm={() => handleConfirmBuild(activeIdea.id)}
                deploying={activeIdea.deploying}
                deployed={activeIdea.deployed}
                deployError={activeIdea.deployError}
                pagesUrl={activeIdea.pagesUrl}
                repoUrl={activeIdea.repoUrl}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
