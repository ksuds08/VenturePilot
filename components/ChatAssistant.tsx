"use client";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId);

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

      const data = await res.json();
      const reply = data.reply || "";
      const refined = data.refinedIdea || "";

      // Typing simulation
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
    }

    setLoading(false);
  };

  const handleAcceptDraft = (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    updateIdea(id, {
      title: idea.draft,
      draft: "",
    });
  };

  const handleEdit = (id: string) => {
    updateIdea(id, { editing: true, editValue: ideas.find((i) => i.id === id)?.title });
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
                <ReactMarkdown className="prose dark:prose-invert max-w-none text-left" remarkPlugins={[remarkGfm]}>
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
            className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600"
          >
            Send
          </button>
        </div>
      </div>

      {/* Ideas Panel */}
      <div className="w-full md:w-1/3 bg-slate-100 dark:bg-slate-800 p-4 rounded-xl shadow h-fit space-y-6">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className={`border rounded-lg p-3 cursor-pointer ${
              idea.id === activeIdeaId ? "border-blue-500 shadow-md" : "border-slate-300"
            }`}
            onClick={() => setActiveIdeaId(idea.id)}
          >
            <div className="font-semibold text-md">
              {idea.editing ? (
                <input
                  className="w-full p-1 rounded border dark:bg-slate-900 dark:text-white"
                  value={idea.editValue}
                  onChange={(e) =>
                    updateIdea(idea.id, { editValue: e.target.value })
                  }
                  onBlur={() => handleEditSave(idea.id)}
                />
              ) : (
                idea.title
              )}
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

            <div className="flex gap-4 text-xs mt-2">
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
