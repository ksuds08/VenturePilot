"use client";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Branding {
  name: string;
  tagline: string;
  colors: string[];
  logoDesc?: string;
}

interface Takeaways {
  refinedIdea?: string;
  validationSummary?: string;
  brandingName?: string;
  brandingTagline?: string;
}

interface Message {
  role: string;
  content: string;
  summary?: string;
}

interface Idea {
  id: string;
  title: string;
  draft?: string;
  messages: Message[];
  locked: boolean;
  editing?: boolean;
  editValue?: string;
  validation?: string;
  validationError?: string;
  lastValidated?: string;
  branding?: Branding;
  repoUrl?: string;
  pagesUrl?: string;
  takeaways?: Takeaways;
  currentStage?: "ideation" | "validation" | "branding" | "mvp";
}

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});
  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId);

  const updateIdea = (id: string, updates: Partial<Idea>) => {
    setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, ...updates } : idea)));
  };

  // Helper to extract a concise summary from a larger block of text
  function extractConciseSummary(text: string): string {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    // Try to find a bullet or a long line first
    const keyLine = lines.find((l) => l.startsWith("- ") || l.length > 40);
    if (keyLine) return keyLine;
    // Fallback to the first line or first 200 characters
    if (lines.length > 0) return lines[0].slice(0, 200);
    return text.slice(0, 200);
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const newMessage: Message = { role: "user", content: input.trim() };
    setInput("");
    let newIdea = activeIdea;
    // Initialize a new idea if one doesn't exist
    if (!newIdea) {
      const id = uuidv4();
      newIdea = {
        id,
        title: newMessage.content,
        draft: "",
        messages: [newMessage],
        locked: false,
        takeaways: {},
        currentStage: "ideation",
      };
      setIdeas((prev) => [...prev, newIdea]);
      setActiveIdeaId(id);
    } else {
      newIdea.messages.push(newMessage);
      updateIdea(newIdea.id, { messages: [...newIdea.messages] });
    }

    // Determine the current stage to tailor the system prompt
    const stage = newIdea.currentStage || "ideation";
    const promptsByStage = {
      ideation: "Help the user refine and clarify their business idea with suggestions.",
      validation: "Help the user validate their idea: market potential, competitors, demand signals.",
      branding: "Suggest brand names, taglines, and visual identity concepts for the idea.",
      mvp: "Guide the user in building an MVP and defining its minimum scope.",
    } as const;

    const systemMessage: Message = {
      role: "system",
      content: `You are a startup advisor. Focus on this stage: ${stage.toUpperCase()}. ${promptsByStage[stage]}`,
    };

    try {
      const messagesForApi = [
        { role: systemMessage.role, content: systemMessage.content },
        ...newIdea.messages.map(({ role, content }) => ({ role, content })),
      ];
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesForApi }),
      });
      const data = await res.json();
      const reply: string = data?.reply || "No reply.";
      const lines = reply.split("\n").map((l) => l.trim()).filter(Boolean);
      const summary = lines.find((l) => l.startsWith("- ") || l.length > 40) || reply;
      const assistantMsg: Message = {
        role: "assistant",
        content: reply,
        summary,
      };
      const updatedMsgs = [...newIdea.messages, assistantMsg];

      // Build a conversation transcript (excluding system prompt) to extract a refined idea
      const conversation = updatedMsgs.map((msg) => msg.content).join("\n");
      const refinedCandidate: string | undefined = data?.refinedIdea;
      const refined = refinedCandidate && refinedCandidate.trim()
        ? refinedCandidate
        : extractConciseSummary(conversation);

      updateIdea(newIdea.id, {
        messages: updatedMsgs,
        draft: refined,
        takeaways: {
          ...newIdea.takeaways,
          refinedIdea: refined,
        },
      });
    } catch (err) {
      // In case of error, still add a placeholder assistant message
      updateIdea(newIdea!.id, {
        messages: [...newIdea!.messages, { role: "assistant", content: "Something went wrong." }],
      });
    }
    setLoading(false);
  };

  // Advance stage and trigger appropriate actions
  const handleAdvanceStage = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    const stageOrder: Array<Idea["currentStage"]> = ["ideation", "validation", "branding", "mvp"];
    const currentIndex = stageOrder.indexOf(idea.currentStage || "ideation");
    const nextStage = stageOrder[Math.min(currentIndex + 1, stageOrder.length - 1)];
    updateIdea(id, { currentStage: nextStage });

    // Automatically call relevant API functions on stage change
    if (nextStage === "validation") {
      await handleValidate(id);
    } else if (nextStage === "branding") {
      await handleBrand(id);
    } else if (nextStage === "mvp") {
      await handleMVP(id);
    }
  };

  const handleValidate = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    setValidating(id);
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      const validation = data?.validation;
      const timestamp = data?.timestamp;
      let summary: string | undefined;
      if (validation) {
        const vLines = validation.split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l);
        summary = vLines[0];
      }
      updateIdea(id, {
        validation,
        lastValidated: timestamp,
        takeaways: {
          ...idea.takeaways,
          validationSummary: summary,
        },
      });
    } catch (err) {
      updateIdea(id, { validationError: "Validation failed." });
    } finally {
      setValidating(null);
    }
  };

  const handleBrand = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      const brandingData = data?.branding ?? data;
      updateIdea(id, {
        branding: brandingData,
        takeaways: {
          ...idea.takeaways,
          brandingName: brandingData?.name,
          brandingTagline: brandingData?.tagline,
        },
      });
    } catch (err) {
      alert("Branding failed");
    }
  };

  const handleMVP = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/mvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      updateIdea(id, { repoUrl: data?.repoUrl, pagesUrl: data?.pagesUrl });
    } catch (err) {
      alert("MVP failed");
    }
  };

  return (
    <div className="max-w-screen-lg mx-auto p-4 h-screen overflow-hidden">
      <div className="flex flex-col lg:flex-row gap-4 h-full">
        {/* Chat column */}
        <div className="lg:w-1/2 w-full border border-gray-300 dark:border-slate-700 rounded-xl flex flex-col h-full">
          {/* Scrollable message list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {(activeIdea?.messages ?? []).map((msg, i) => (
              <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
                <div
                  className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white ml-auto"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  }`}
                >
                  <ReactMarkdown
                    className="prose dark:prose-invert max-w-none text-left"
                    remarkPlugins={[remarkGfm as any]}
                  >
                    {expandedReplies[i] || !msg.summary ? msg.content : msg.summary}
                  </ReactMarkdown>
                  {msg.content !== msg.summary && (
                    <button
                      onClick={() => setExpandedReplies({ ...expandedReplies, [i]: !expandedReplies[i] })}
                      className="ml-2 text-xs text-blue-500 underline"
                    >
                      {expandedReplies[i] ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="text-slate-400 text-sm">Assistant is typing…</div>}
          </div>
          {/* Input area */}
          <div className="p-2 flex gap-2 border-t border-gray-200 dark:border-slate-700">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              className="flex-1 p-2 rounded-xl border dark:bg-slate-800 dark:text-white"
              placeholder="Describe your startup idea..."
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
        {/* Business Plan Summary Column */}
        <div className="lg:w-1/2 w-full h-full overflow-y-auto rounded-xl border border-gray-300 dark:border-slate-700 p-4 space-y-4">
          {activeIdea && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Business Plan Summary</h2>
              <div className="text-sm text-gray-800 dark:text-gray-100 space-y-3">
                <div>
                  <strong>Current Stage:</strong> {activeIdea.currentStage?.toUpperCase() || "IDEATION"}
                </div>
                <div>
                  <strong>Refined Idea:</strong> {activeIdea.takeaways?.refinedIdea || "—"}
                </div>
                {activeIdea.currentStage !== "ideation" && activeIdea.validation && (
                  <div>
                    <strong>Validation Results:</strong>
                    <div className="pl-2 mt-1 whitespace-pre-wrap">{activeIdea.validation}</div>
                  </div>
                )}
                {activeIdea.currentStage !== "ideation" && activeIdea.branding && (
                  <div>
                    <strong>Branding:</strong>
                    <div className="pl-2 mt-1 space-y-1">
                      {activeIdea.branding.name && (
                        <div>
                          <strong>Name:</strong> {activeIdea.branding.name}
                        </div>
                      )}
                      {activeIdea.branding.tagline && (
                        <div>
                          <strong>Tagline:</strong> {activeIdea.branding.tagline}
                        </div>
                      )}
                      {activeIdea.branding.logoDesc && (
                        <div>
                          <strong>Logo Description:</strong> {activeIdea.branding.logoDesc}
                        </div>
                      )}
                      {activeIdea.branding.colors && activeIdea.branding.colors.length > 0 && (
                        <div>
                          <strong>Colors:</strong> {activeIdea.branding.colors.join(", ")}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {activeIdea.pagesUrl && (
                  <div>
                    <strong>Deployment:</strong>{" "}
                    <a href={activeIdea.pagesUrl} target="_blank" className="text-green-600 underline">
                      View App
                    </a>
                    {activeIdea.repoUrl && (
                      <span>
                        ,{" "}
                        <a href={activeIdea.repoUrl} target="_blank" className="text-gray-500 underline">
                          Repository
                        </a>
                      </span>
                    )}
                  </div>
                )}
                <button
                  onClick={() => handleAdvanceStage(activeIdea.id)}
                  className="text-xs text-blue-500 underline mt-2"
                >
                  Advance to next stage
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
