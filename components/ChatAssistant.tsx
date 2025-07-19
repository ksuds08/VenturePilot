"use client";
import { useState, useRef, useEffect } from "react";
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
}

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Record<number, boolean>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId);

  useEffect(() => {
    const stored = localStorage.getItem("vp_ideas");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setIdeas(parsed);
        const activeId = localStorage.getItem("vp_activeIdeaId");
        if (activeId) setActiveIdeaId(activeId);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("vp_ideas", JSON.stringify(ideas));
    if (activeIdeaId) {
      localStorage.setItem("vp_activeIdeaId", activeIdeaId);
    }
  }, [ideas, activeIdeaId]);

  const updateIdea = (id: string, updates: Partial<Idea>) => {
    setIdeas((prev) =>
      prev.map((idea) => (idea.id === id ? { ...idea, ...updates } : idea))
    );
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const newMessage = { role: "user", content: input.trim() };
    setInput("");
    let newIdea = activeIdea;
    if (!newIdea) {
      const id = uuidv4();
      newIdea = {
        id,
        title: input.trim(),
        draft: "",
        messages: [newMessage],
        locked: false,
        takeaways: {},
      };
      setIdeas((prev) => [...prev, newIdea]);
      setActiveIdeaId(id);
    } else {
      newIdea.messages.push(newMessage);
      updateIdea(newIdea.id, { messages: [...newIdea.messages] });
    }
    try {
      const res = await fetch(
        "https://venturepilot-api.promptpulse.workers.dev/assistant",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: newIdea.messages }),
        }
      );
      const data = await res.json();
      const reply = data?.reply || "No reply.";
      const lines = reply.split("\n").map((l: string) => l.trim()).filter(Boolean);
      const summary =
        lines.find((l) => l.startsWith("- ") || l.length > 40) || reply;
      const assistantMsg = {
        role: "assistant",
        content: reply,
        summary,
      };
      const updatedMsgs = [...newIdea.messages, assistantMsg];
      updateIdea(newIdea.id, {
        messages: updatedMsgs,
        draft: data?.refinedIdea || summary,
        takeaways: {
          ...newIdea.takeaways,
          refinedIdea: data?.refinedIdea || summary,
        },
      });
    } catch (err) {
      updateIdea(newIdea.id, {
        messages: [
          ...newIdea.messages,
          { role: "assistant", content: "Something went wrong." },
        ],
      });
    }
    setLoading(false);
  };
// Continued ChatAssistant.tsx (Part 2 with business plan rendering)

  const handleAcceptDraft = (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    updateIdea(id, { title: idea.draft || idea.title, draft: "", locked: true });
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
      const vLines = (data?.validation || "").split("\n").map((l: string) => l.trim()).filter((l: string) => l);
      updateIdea(id, {
        validation: data.validation,
        lastValidated: data.timestamp,
        takeaways: {
          ...idea.takeaways,
          validationSummary: vLines[0] || "",
        },
      });
    } catch (err) {
      updateIdea(id, { validationError: "Validation failed." });
    } finally {
      setValidating(null);
    }
  };

  return (
    <div className="max-w-screen-lg mx-auto p-4 h-screen overflow-hidden">
      <div className="flex flex-col lg:flex-row gap-4 h-full">
        {/* Chat column */}
        <div className="lg:w-1/2 w-full border border-gray-300 dark:border-slate-700 rounded-xl flex flex-col h-full">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {(activeIdea?.messages ?? []).map((msg, i) => (
              <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
                <div className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${msg.role === "user" ? "bg-blue-500 text-white ml-auto" : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"}`}>
                  <ReactMarkdown className="prose dark:prose-invert max-w-none text-left" remarkPlugins={[remarkGfm as any]}>
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
          {activeIdea?.takeaways && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Business Plan Summary</h2>
              <div className="text-sm text-gray-800 dark:text-gray-100 space-y-2">
                <div>
                  <strong>Refined Idea:</strong> {activeIdea.takeaways.refinedIdea || "—"}
                </div>
                {activeIdea.takeaways.validationSummary && (
                  <div>
                    <strong>Market Potential:</strong> {activeIdea.takeaways.validationSummary}
                  </div>
                )}
                {activeIdea.takeaways.brandingName && (
                  <div>
                    <strong>Brand Name:</strong> {activeIdea.takeaways.brandingName}
                  </div>
                )}
                {activeIdea.takeaways.brandingTagline && (
                  <div>
                    <strong>Tagline:</strong> {activeIdea.takeaways.brandingTagline}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
