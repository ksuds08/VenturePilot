"use client";
import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<any[]>([]);
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

  const updateIdea = (id: string, updates: Partial<any>) => {
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
        editing: false,
        validation: null,
        validationError: null,
        lastValidated: null,
      };
      setIdeas((prev) => [...prev, newIdea]);
      setActiveIdeaId(id);
    } else {
      newIdea.messages.push(newMessage);
      updateIdea(newIdea.id, { messages: [...newIdea.messages] });
    }

    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newIdea.messages }),
      });

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
            i === updatedMsgs.length - 1 ? { ...m, content: streamed.trim() } : m
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
          : "Something went wrong while submitting your idea."
      );
    }

    setLoading(false);
  };

  const handleAcceptDraft = (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    updateIdea(id, {
      title: idea.draft,
      draft: "",
      locked: true,
    });
  };

  const handleEdit = (id: string) => {
    updateIdea(id, {
      editing: true,
      editValue: ideas.find((i) => i.id === id)?.title,
      locked: false,
      validation: null,
      validationError: null,
    });
  };

  const handleEditSave = (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    updateIdea(id, {
      title: idea.editValue,
      editing: false,
      editValue: "",
    });
  };

  const handleDelete = (id: string) => {
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    if (activeIdeaId === id) setActiveIdeaId(null);
  };

  const handleValidate = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;

    setValidating(id);
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          idea: idea.title,
          ideaId: idea.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Validation failed with status ${res.status}`);
      }

      const validation = data.validation || "No validation results returned.";
      const cleanedValidation = validation.replace(/\n{3,}/g, "\n\n").trim();

      updateIdea(id, {
        validation: cleanedValidation,
        validationError: null,
        lastValidated: data.timestamp || new Date().toISOString(),
      });
    } catch (err) {
      console.error("Validation error:", err);
      let errorMessage = "Validation failed. Please try again.";
      if (err instanceof Error) {
        errorMessage = err.message;
        if (errorMessage.includes("Missing required field")) {
          errorMessage = "Invalid idea format - please edit and try again";
        }
      }
      updateIdea(id, {
        validation: null,
        validationError: errorMessage,
        lastValidated: new Date().toISOString(),
      });
    } finally {
      setValidating(null);
    }
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto">
      {/* Chat Area */}
      <div className="flex-1 bg-white dark:bg-slate-900 border rounded-xl p-4 shadow">
        <div className="max-h-[400px] overflow-y-auto space-y-4 mb-4">
          {activeIdea?.messages?.map((msg, i) => (
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
                  remarkPlugins={[() => remarkGfm]}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div className="text-left text-slate-400 text-sm">Assistant is typing…</div>
          )}
        </div>

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
      </div>

      {/* Ideas Panel */}
      <div className="w-full md:w-1/3 bg-slate-100 dark:bg-slate-800 p-4 rounded-xl shadow h-fit space-y-6">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              idea.id === activeIdeaId
                ? "border-blue-500 shadow-md"
                : "border-slate-300 hover:border-slate-400"
            }`}
            onClick={() => !idea.editing && setActiveIdeaId(idea.id)}
          >
            {idea.editing ? (
              <>
                <textarea
                  ref={textareaRef}
                  className="w-full p-2 rounded border dark:bg-slate-900 dark:text-white resize-none overflow-hidden"
                  value={idea.editValue}
                  onChange={(e) => updateIdea(idea.id, { editValue: e.target.value })}
                  onBlur={() => handleEditSave(idea.id)}
                  autoFocus
                  rows={1}
                  style={{ minHeight: "44px" }}
                />
                <div className="flex justify-end mt-2 space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditSave(idea.id);
                    }}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateIdea(idea.id, { editing: false });
                    }}
                    className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold text-md mb-1 whitespace-pre-wrap">
                  {idea.title}
                </div>

                {idea.draft && (
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    <div className="font-medium text-xs mb-1">Refined Idea</div>
                    <div className="bg-white dark:bg-slate-900 p-2 rounded border text-sm whitespace-pre-wrap">
                      {idea.draft}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptDraft(idea.id);
                      }}
                      className="mt-2 text-sm text-green-600 hover:underline"
                    >
                      Accept
                    </button>
                  </div>
                )}

                <div className="flex gap-4 text-xs mt-2 flex-wrap">
                  <button
                    className="text-blue-500 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(idea.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-500 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(idea.id);
                    }}
                  >
                    Delete
                  </button>
                  {idea.locked && (
                    <button
                      className="text-purple-500 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleValidate(idea.id);
                      }}
                      disabled={validating === idea.id}
                    >
                      {validating === idea.id ? "Validating..." : "Validate"}
                    </button>
                  )}
                </div>

                {idea.validationError && (
                  <div className="mt-3 animate-fade-in">
                    <div className="font-medium text-xs mb-1 text-red-500">Validation Error</div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800 text-sm">
                      {idea.validationError}
                    </div>
                  </div>
                )}

                {idea.validation && (
                  <div className="mt-3 animate-fade-in">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-xs">Validation Analysis</div>
                      {idea.lastValidated && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(idea.lastValidated).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded border max-h-60 overflow-y-auto text-sm">
                      <ReactMarkdown
                        className="prose dark:prose-invert max-w-none"
                        components={{
                          h1: ({ node, ...props }) => <h3 className="text-lg font-bold mt-3 mb-1" {...props} />,
                          h2: ({ node, ...props }) => <h4 className="text-md font-semibold mt-2 mb-1" {...props} />,
                          h3: ({ node, ...props }) => <h5 className="text-sm font-medium mt-2 mb-1" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc pl-5 space-y-1" {...props} />,
                          ol: ({ node, ...props }) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
                          a: ({ node, ...props }) => <a className="text-blue-500 hover:underline" {...props} />,
                        }}
                        remarkPlugins={[() => remarkGfm]}
                      >
                        {idea.validation}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

