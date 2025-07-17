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

interface Idea {
  id: string;
  title: string;
  draft?: string;
  messages: any[];
  locked: boolean;
  editing?: boolean;
  editValue?: string;
  validation?: string;
  validationError?: string;
  lastValidated?: string;
  branding?: Branding;
}

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId);

  useEffect(() => {
    if (activeIdea?.editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [activeIdea?.editing, activeIdea?.editValue]);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

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

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Response was not valid JSON");
      }

      if (!res.ok) {
        const message = data?.error || `Server error ${res.status}`;
        throw new Error(message);
      }

      const reply = data?.reply || "No reply received.";
      const refined = data?.refinedIdea || "";

      const assistantMsg = { role: "assistant", content: "" };
      const words = reply.split(" ");
      const updatedMsgs = [...newIdea.messages, assistantMsg];
      updateIdea(newIdea.id, { messages: updatedMsgs });

      let streamed = "";
      for (const word of words) {
        streamed += word + " ";
        updateIdea(newIdea.id, {
          messages: updatedMsgs.map((m, i) =>
            i === updatedMsgs.length - 1
              ? { ...m, content: streamed.trim() }
              : m
          ),
        });
        await delay(30);
      }

      updateIdea(newIdea.id, {
        draft: refined,
      });
    } catch (err) {
      console.error("Assistant error:", err);
      alert(
        err instanceof Error
          ? `Assistant failed: ${err.message}`
          : "Something went wrong."
      );
    }

    setLoading(false);
  };

  const handleAcceptDraft = (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    updateIdea(id, {
      title: idea.draft || idea.title,
      draft: "",
      locked: true,
    });
  };

  const handleValidate = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    setValidating(id);

    try {
      const res = await fetch(
        "https://venturepilot-api.promptpulse.workers.dev/validate",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
        }
      );

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Response was not valid JSON");
      }

      if (!res.ok)
        throw new Error(data.error || `Validation failed with status ${res.status}`);

      updateIdea(id, {
        validation: data.validation,
        validationError: null,
        lastValidated: data.timestamp || new Date().toISOString(),
      });
    } catch (err) {
      console.error("Validation error:", err);
      updateIdea(id, {
        validation: null,
        validationError:
          err instanceof Error ? err.message : "Validation failed",
        lastValidated: new Date().toISOString(),
      });
    } finally {
      setValidating(null);
    }
  };

  const handleBrand = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    try {
      const res = await fetch(
        "https://venturepilot-api.promptpulse.workers.dev/brand",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
        }
      );

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("Response was not valid JSON");
      }

      if (!res.ok) throw new Error(data.error || "Brand generation failed");

      updateIdea(id, {
        branding: {
          name: data.name,
          tagline: data.tagline,
          colors: data.colors,
          logoDesc: data.logoDesc,
        },
      });
    } catch (err) {
      console.error("Branding error:", err);
      alert("Failed to generate branding.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      {/* Chat messages */}
      <div className="space-y-4">
        {(activeIdea?.messages ?? []).map((msg, i) => (
          <div
            key={i}
            className={`text-${msg.role === "user" ? "right" : "left"}`}
          >
            <div
              className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-500 text-white ml-auto"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              }`}
            >
              <ReactMarkdown
                className="prose dark:prose-invert max-w-none text-left"
                remarkPlugins={[() => remarkGfm]}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-slate-400 text-sm">Assistant is typing…</div>
        )}
      </div>

      {/* Input */}
      <div className="flex gap-2">
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

      {/* Idea cards */}
      {ideas.map((idea) => (
        <div
          key={idea.id}
          className="border rounded-lg p-4 bg-white dark:bg-slate-800"
        >
          <div className="flex justify-between">
            <h3 className="text-lg font-semibold">{idea.title}</h3>
            {idea.locked && !idea.validation && (
              <button
                onClick={() => handleValidate(idea.id)}
                className="text-blue-500 text-sm"
              >
                {validating === idea.id ? "Validating..." : "Validate"}
              </button>
            )}
          </div>

          {/* Validation */}
          {idea.validation && (
            <div className="mt-2 text-sm">
              <h4 className="font-bold text-xs mb-1">Validation Report</h4>
              <ReactMarkdown
                className="prose dark:prose-invert"
                remarkPlugins={[() => remarkGfm]}
              >
                {idea.validation}
              </ReactMarkdown>
            </div>
          )}

          {/* Branding */}
          {idea.locked && idea.validation && !idea.branding && (
            <button
              onClick={() => handleBrand(idea.id)}
              className="text-indigo-600 text-sm mt-2"
            >
              Generate Branding
            </button>
          )}

          {idea.branding && (
            <div className="mt-4 animate-fade-in">
              <div className="font-medium text-xs mb-1 text-indigo-500">
                Branding Kit
              </div>
              <div className="bg-white dark:bg-slate-900 p-3 rounded border text-sm space-y-2">
                <div>
                  <strong>Name:</strong> {idea.branding.name}
                </div>
                <div>
                  <strong>Tagline:</strong> {idea.branding.tagline}
                </div>
                <div>
                  <strong>Colors:</strong>
                  <div className="flex gap-2 mt-1">
                    {idea.branding.colors.map((c) => (
                      <div
                        key={c}
                        className="w-6 h-6 rounded-full border"
                        style=https://operator.chatgpt.com/c/68795ad055b48191959fdb6c71d65adb#cua_citation-%20backgroundColor:%20c%20                        title={c}
                      />
                    ))}
                  </div>
                </div>
                {idea.branding.logoDesc && (
                  <div>
                    <strong>Logo Prompt:</strong> {idea.branding.logoDesc}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Refined draft */}
          {!idea.locked && idea.draft && (
            <>
              <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                <div className="font-medium text-xs mb-1">Refined Idea</div>
                <div className="bg-white dark:bg-slate-900 p-2 rounded border text-sm whitespace-pre-wrap">
                  {idea.draft}
                </div>
                <button
                  onClick={() => handleAcceptDraft(idea.id)}
                  className="mt-2 text-sm text-green-600 hover:underline"
                >
                  Accept
                </button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
