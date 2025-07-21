import React, { useState, useEffect } from "react";
import ChatPanel from "./ChatPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";
import RefinedIdeaCard from "./RefinedIdeaCard";

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState([]);
  const [activeIdeaId, setActiveIdeaId] = useState(null);
  const [loading, setLoading] = useState(false);
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
    let current = activeIdea;
    if (!current) return;

    const updatedMessages = [...current.messages, { role: "user", content }];
    updateIdea(current.id, { messages: updatedMessages });
    setLoading(true);

    const { reply, refinedIdea, nextStage, plan } = await sendToAssistant(
      updatedMessages,
      current.currentStage
    );

    const updates = {
      title: current.title || content.slice(0, 80),
      messages: [...updatedMessages, { role: "assistant", content: reply }],
      takeaways: {
        ...current.takeaways,
        refinedIdea: refinedIdea || current.takeaways.refinedIdea,
      },
    };

    if (plan) updates["finalPlan"] = plan;
    updateIdea(current.id, updates);

    if (nextStage && nextStage !== current.currentStage) {
      setTimeout(() => {
        handleAdvanceStage(current.id, nextStage);
      }, 1000);
    }

    // 🔁 Trigger MVP deploy if confirmed at generatePlan stage
    const confirmationKeywords = ["yes", "let's do it", "build it", "go ahead", "launch it"];
    if (
      current.currentStage === "generatePlan" &&
      confirmationKeywords.some((kw) => content.toLowerCase().includes(kw))
    ) {
      await handleConfirmBuild(current.id);
    }

    setLoading(false);
  };

  const handleAdvanceStage = async (id, forcedStage?: StageType) => {
    const stageOrder: StageType[] = ["ideation", "validation", "branding", "mvp", "generatePlan"];
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    const currentIndex = stageOrder.indexOf(idea.currentStage || "ideation");
    const nextStage = forcedStage || stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];

    updateIdea(id, { currentStage: nextStage });

    if (nextStage === "validation") {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      updateIdea(id, {
        validation: data?.validation,
        takeaways: {
          ...idea.takeaways,
          validationSummary: data?.validation?.split("\n")[0] || "",
        },
      });
    }
  };

  const handleConfirmBuild = async (id) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/mvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
    });

    const data = await res.json();
    updateIdea(id, {
      repoUrl: data.repoUrl,
      pagesUrl: data.pagesUrl,
      deployed: true,
      messages: [
        ...idea.messages,
        {
          role: "assistant",
          content: `✅ MVP deployed! You can view it here:\n\n🔗 ${data.pagesUrl}`,
        },
      ],
    });
  };

  const restartStage = (stage: StageType) => {
    if (!activeIdeaId) return;
    updateIdea(activeIdeaId, {
      currentStage: stage,
      takeaways: {
        ...activeIdea?.takeaways,
        refinedIdea: undefined,
      },
      messages: activeIdea?.messages || [],
    });
  };

  return (
    <div className="max-w-screen-lg mx-auto p-4 h-screen">
      <div className="w-full h-full border rounded-xl overflow-y-auto">
        <ChatPanel
          messages={activeIdea?.messages ?? []}
          onSend={handleSend}
          loading={loading}
        />

        {/* 🎯 Refined Idea Summary & Actions */}
        {activeIdea?.currentStage === "ideation" &&
          activeIdea?.takeaways?.refinedIdea && (
            <RefinedIdeaCard
              name={activeIdea.title || "Untitled Startup"}
              description={activeIdea.takeaways.refinedIdea}
              onConfirm={() => handleAdvanceStage(activeIdea.id, "validation")}
              onEdit={() => restartStage("ideation")}
            />
          )}
      </div>
    </div>
  );
}

