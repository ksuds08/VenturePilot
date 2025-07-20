// Define the allowed VenturePilot assistant stages

export type VentureStage = "ideation" | "validation" | "branding" | "mvp";
import React, { useState } from "react";
import ChatPanel from "./ChatPanel";
import SummaryPanel from "./SummaryPanel";
import { sendToAssistant } from "../lib/assistantClient";
import { v4 as uuidv4 } from "uuid";
import type { VentureStage } from "../types";

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
        takeaways: {}
      };
      setIdeas((prev) => [...prev, current]);
      setActiveIdeaId(id);
    } else {
      current = {
        ...current,
        messages: [...current.messages, { role: "user", content }]
      };
      updateIdea(current.id, { messages: current.messages });
    }

    setLoading(true);

    const { reply, refinedIdea } = await sendToAssistant(current.messages, current.currentStage);
    updateIdea(current.id, {
      messages: [...current.messages, { role: "assistant", content: reply }],
      takeaways: {
        ...current.takeaways,
        refinedIdea
      }
    });

    setLoading(false);
  };

  const handleAdvanceStage = async (id) => {
    const stageOrder: VentureStage[] = ["ideation", "validation", "branding", "mvp"];
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    const currentIndex = stageOrder.indexOf(idea.currentStage || "ideation");
    const nextStage = stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];

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
        }
      });
    }
  };

  return (
    <div className="max-w-screen-lg mx-auto p-4 h-screen overflow-hidden flex flex-col lg:flex-row gap-4">
      <div className="lg:w-1/2 w-full border rounded-xl flex flex-col h-full">
        <ChatPanel
          messages={activeIdea?.messages ?? []}
          onSend={handleSend}
          loading={loading}
        />
      </div>
      <div className="lg:w-1/2 w-full h-full overflow-y-auto rounded-xl border p-4">
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
