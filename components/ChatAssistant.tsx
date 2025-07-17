"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { v4 as uuidv4 } from "uuid";

type PhaseStatus = "not_started" | "in_progress" | "completed";

interface PhaseState {
  status: PhaseStatus;
  output?: string;
  pendingUpdate?: string;
}

interface VentureIdea {
  id: string;
  title: string;
  draft?: string;
  history: string[];
  phases: { [key: string]: PhaseState };
}

const phaseStructure = [
  { key: "refinedIdea", label: "Refined Idea", next: "validation" },
  { key: "validation", label: "Market Validation", next: "branding" },
  { key: "branding", label: "Branding", next: "mvp" },
  { key: "mvp", label: "MVP Plan", next: "formation" },
  { key: "formation", label: "Business Formation", next: "launch" },
  { key: "launch", label: "Launch Strategy", next: "ops" },
  { key: "ops", label: "Ongoing Operations", next: null },
];

export default function ChatAssistant() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi! Ready to build your startup together?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [ideas, setIdeas] = useState<VentureIdea[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("ventureIdeas-v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      setIdeas(parsed);
      if (parsed.length > 0) setActiveIdeaId(parsed[0].id);
    }
  }, []);

  const persistIdeas = (updated: VentureIdea[]) => {
    setIdeas(updated);
    localStorage.setItem("ventureIdeas-v2", JSON.stringify(updated));
  };

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const addNewIdea = (draft: string): string => {
    const newIdea: VentureIdea = {
      id: uuidv4(),
      title: draft,
      draft: undefined,
      history: [],
      phases: phaseStructure.reduce((acc, phase) => {
        acc[phase.key] = {
          status: phase.key === "refinedIdea" ? "completed" : "not_started",
          output: phase.key === "refinedIdea" ? draft : undefined,
        };
        return acc;
      }, {} as Record<string, PhaseState>),
    };
    const updated = [...ideas, newIdea];
    persistIdeas(updated);
    setActiveIdeaId(newIdea.id);
    return newIdea.id;
  };

  const updateIdeaDraft = (id: string, newDraft: string) => {
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === id ? { ...idea, draft: newDraft } : idea
      )
    );
  };

  const acceptRefinedDraft = (id: string) => {
    setIdeas((prev) =>
      prev.map((idea) => {
        if (idea.id !== id || !idea.draft) return idea;
        return {
          ...idea,
          history: [...idea.history, idea.title],
          title: idea.draft,
          draft: undefined,
          phases: {
            ...idea.phases,
            refinedIdea: {
              status: "completed",
              output: idea.draft,
            },
          },
        };
      })
    );
  };

  const updatePhaseOutput = (id: string, phaseKey: string, output: string) => {
    const updated = ideas.map((idea) => {
      if (idea.id !== id) return idea;
      const newPhases = { ...idea.phases };
      newPhases[phaseKey].output = output;
      newPhases[phaseKey].status = "completed";

      const next = phaseStructure.find(p => p.key === phaseKey)?.next;
      if (next) {
        newPhases[next].status = "in_progress";
      }

      return { ...idea, phases: newPhases };
    });
    persistIdeas(updated);
  };

  const handleValidate = async (id: string, title: string) => {
    const ideaId = btoa(title).slice(0, 12);
    const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea: title, ideaId }),
    });
    const data = await res.json();
    updatePhaseOutput(id, "validation", data.content || "Validation complete.");
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      const data = await res.json();
      const fullText = data.reply ?? "";
      const refined = data.refinedIdea ?? null;

      const words = fullText.split(" ");
      let displayed = "";
      const assistantMsg = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMsg]);

      for (const word of words) {
        displayed += word + " ";
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: displayed.trim(),
          };
          return updated;
        });
        await delay(50);
      }

      if (refined) {
        if (activeIdeaId) {
          updateIdeaDraft(activeIdeaId, refined);
        } else {
          const newId = addNewIdea(refined);
          setActiveIdeaId(newId);
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Sorry, something went wrong. Please try again." },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 max-w-6xl mx-auto">
      {/* Chat */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow p-4">
        <div className="space-y-4 max-h-[400px] overflow-y-auto mb-4">
          {messages.map((msg, i) => (
            <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
              <div className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-500 text-white ml-auto"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              }`}>
                <ReactMarkdown className="prose dark:prose-invert max-w-none text-left" remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && <div className="text-left text-slate-400 text-sm">Assistant is typing…</div>}
        </div>

        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            className="flex-1 p-2 rounded-xl border dark:bg-slate-800 dark:text-white"
            placeholder="Describe your startup idea..."
          />
          <button
            onClick={sendMessage}
            className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </div>

      {/* Ideas Panel */}
      <div className="w-full md:w-1/3 space-y-6">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className={`p-4 rounded-xl shadow border ${
              idea.id === activeIdeaId ? "bg-slate-200 dark:bg-slate-700 border-blue-500" : "bg-slate-100 dark:bg-slate-800"
            }`}
          >
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">{idea.title}</h2>
              {idea.id !== activeIdeaId && (
                <button
                  onClick={() => setActiveIdeaId(idea.id)}
                  className="text-sm text-blue-500 hover:underline"
                >
                  Set Active
                </button>
              )}
            </div>

            {idea.draft && idea.draft !== idea.title && (
              <div className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 p-2 rounded mb-3">
                <p className="text-sm mb-2">💡 A new refinement is available:</p>
                <p className="text-xs italic mb-2">{idea.draft}</p>
                <button
                  onClick={() => acceptRefinedDraft(idea.id)}
                  className="text-sm bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                >
                  Accept Update
                </button>
              </div>
            )}

            {/* Phase Wizard */}
            <div className="space-y-4 mt-2">
              {phaseStructure.map((phase) => {
                const phaseData = idea.phases[phase.key];
                if (!phaseData) return null;

                return (
                  <div key={phase.key} className="border rounded p-3 bg-white dark:bg-slate-900">
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold">{phase.label}</h3>
                      <span className="text-xs text-gray-500">{phaseData.status}</span>
                    </div>

                    {phaseData.output && (
                      <div className="mt-2 text-sm whitespace-pre-wrap">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {phaseData.output}
                        </ReactMarkdown>
                      </div>
                    )}

                    {phaseData.status !== "completed" && (
                      <div className="mt-2 flex gap-2">
                        {phase.key === "validation" && (
                          <button
                            onClick={() => handleValidate(idea.id, idea.title)}
                            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                          >
                            Validate
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
