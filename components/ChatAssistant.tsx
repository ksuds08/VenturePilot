"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { v4 as uuidv4 } from "uuid";

type PhaseStatus = "not_started" | "in_progress" | "completed";

interface PhaseState {
  status: PhaseStatus;
  output?: string;
}

interface VentureIdea {
  id: string;
  title: string;
  draft?: string;
  history: string[];
  phases: { [phase: string]: PhaseState };
}

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<VentureIdea[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi! Ready to build your startup together?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("ventureIdeas-v2");
    if (saved) setIdeas(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem("ventureIdeas-v2", JSON.stringify(ideas));
  }, [ideas]);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const activeIdea = ideas.find((i) => i.id === activeId) || null;

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
      const reply = data.reply || "";
      const refined = data.refinedIdea;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let display = "";
      const words = reply.split(" ");
      for (const word of words) {
        display += word + " ";
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1].content = display.trim();
          return updated;
        });
        await delay(50);
      }

      if (refined) {
        if (activeIdea) {
          updateDraft(activeIdea.id, refined);
        } else {
          const id = uuidv4();
          const newIdea: VentureIdea = {
            id,
            title: refined,
            draft: "",
            history: [],
            phases: {},
          };
          setIdeas((prev) => [...prev, newIdea]);
          setActiveId(id);
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Sorry, something went wrong." },
      ]);
    }

    setLoading(false);
  };

  const updateDraft = (id: string, draft: string) => {
    setIdeas((prev) =>
      prev.map((idea) => (idea.id === id ? { ...idea, draft } : idea))
    );
  };

  const acceptDraft = (id: string) => {
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === id
          ? {
              ...idea,
              title: idea.draft ?? idea.title,
              history: [...idea.history, idea.title],
              draft: undefined,
            }
          : idea
      )
    );
  };

  const deleteIdea = (id: string) => {
    if (confirm("Delete this idea?")) {
      setIdeas((prev) => prev.filter((idea) => idea.id !== id));
      if (activeId === id) setActiveId(null);
    }
  };

  const beginEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditText(current);
  };

  const saveEdit = () => {
    if (!editingId) return;
    setIdeas((prev) =>
      prev.map((idea) =>
        idea.id === editingId ? { ...idea, title: editText } : idea
      )
    );
    setEditingId(null);
    setEditText("");
  };

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-6xl mx-auto">
      {/* Ideas List */}
      <div className="w-full md:w-1/3 space-y-4">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className={`border rounded-lg p-4 shadow ${
              idea.id === activeId ? "border-blue-500 ring-2 ring-blue-300" : "border-slate-300"
            }`}
          >
            {editingId === idea.id ? (
              <>
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full p-2 border rounded mb-2 dark:bg-slate-800"
                  rows={3}
                />
                <div className="flex justify-end gap-2">
                  <button onClick={saveEdit} className="bg-blue-600 text-white px-3 py-1 rounded">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-sm text-slate-500">Cancel</button>
                </div>
              </>
            ) : (
              <>
                <h3
                  className="font-semibold text-lg cursor-pointer"
                  onClick={() => setActiveId(idea.id)}
                >
                  {idea.title}
                </h3>

                {idea.draft && (
                  <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-sm whitespace-pre-wrap">
                    <div className="text-slate-700 dark:text-slate-300 mb-2">
                      <strong>Refined Idea</strong>
                    </div>
                    {idea.draft}
                    <div className="mt-2 text-right">
                      <button
                        onClick={() => acceptDraft(idea.id)}
                        className="bg-green-600 text-white px-3 py-1 rounded"
                      >
                        Accept
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-2 text-sm">
                  <button
                    onClick={() => beginEdit(idea.id, idea.title)}
                    className="text-blue-600"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteIdea(idea.id)}
                    className="text-red-500"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Chat Section */}
      <div className="flex-1 bg-white dark:bg-slate-900 border rounded-xl shadow p-4">
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
    </div>
  );
}
