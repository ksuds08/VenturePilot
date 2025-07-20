import React, { useState, useEffect } from "react";
import ChatPanel from "./ChatPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";

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

    current = {
      ...current,
      messages: [...current.messages, { role: "user", content }],
    };
    updateIdea(current.id, { messages: current.messages });
    setLoading(true);

    const { reply, refinedIdea, nextStage, plan } = await sendToAssistant(
      current.messages,
      current.currentStage
    );

    const updates = {
      messages: [...current.messages, { role: "assistant", content: reply }],
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

  return (
    <div className="max-w-screen-lg mx-auto p-4 h-screen">
      <div className="w-full h-full border rounded-xl overflow-y-auto">
        <ChatPanel
          messages={activeIdea?.messages ?? []}
          onSend={handleSend}
          loading={loading}
        />
      </div>
    </div>
  );
}

