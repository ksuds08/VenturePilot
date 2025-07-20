import React, { useState } from "react";
import ChatPanel from "./ChatPanel";
import SummaryPanel from "./SummaryPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage as StageType } from "../types";

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState([]);
  const [activeIdeaId, setActiveIdeaId] = useState(null);
  const [loading, setLoading] = useState(false);
  const activeIdea = ideas.find((i) => i.id === activeIdeaId);

  const updateIdea = (id, updates) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, ...updates } : i)));
  };

  const handleSend = async (content) => {
    let current = activeIdea;
    if (!current) {
      const id = uuidv4();
      current = {
        id,
        title: content,
        messages: [{ role: "user", content }],
        locked: false,
        currentStage: "ideation",
        takeaways: {},
      };
      setIdeas((prev) => [...prev, current]);
      setActiveIdeaId(id);
    } else {
      current = {
        ...current,
        messages: [...current.messages, { role: "user", content }],
      };
      updateIdea(current.id, { messages: current.messages });
    }

    setLoading(true);

    const { reply, refinedIdea, nextStage } = await sendToAssistant(current.messages, current.currentStage);

    updateIdea(current.id, {
      messages: [...current.messages, { role: "assistant", content: reply }],
      takeaways: {
        ...current.takeaways,
        refinedIdea,
      },
    });

    if (nextStage && nextStage !== current.currentStage) {
      setTimeout(() => {
        handleAdvanceStage(current.id, nextStage);
      }, 1200);
    }

    setLoading(false);
  };

  const handleAdvanceStage = async (id, forcedStage?: StageType) => {
    const stageOrder: StageType[] = ["ideation", "validation", "branding", "mvp"];
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
    <div className="max-w-screen-lg mx-auto p-4 h-screen space-y-4 lg:space-y-0 lg:space-x-4 lg:flex lg:flex-row">
      {/* Chat Panel */}
      <div className="w-full lg:w-1/2 h-[50vh] lg:h-full border rounded-xl overflow-y-auto">
        <ChatPanel
          messages={activeIdea?.messages ?? []}
          onSend={handleSend}
          loading={loading}
        />
      </div>

      {/* Summary Panel */}
      <div className="w-full lg:w-1/2 h-[50vh] lg:h-full border rounded-xl overflow-y-auto p-4">
        {activeIdea && (
          <SummaryPanel
            idea={activeIdea}
            onAdvanceStage={() => handleAdvanceStage(activeIdea.id)}
          />
        )}
      </div>
    </div>
  );
}

