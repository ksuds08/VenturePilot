"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatAssistant() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ready to build your startup together?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [refinedIdea, setRefinedIdea] = useState<string | null>(null);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

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
      const newRefined = data.refinedIdea ?? null;
      if (newRefined) setRefinedIdea(newRefined);

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
        await delay(50); // Typing speed
      }
    } catch (err) {
      console.error("Typing simulation error:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Sorry, something went wrong. Please try again.",
        },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 max-w-6xl mx-auto">
      {/* Chat Window */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow p-4">
        <div className="space-y-4 max-h-[400px] overflow-y-auto mb-4">
          {messages.map((msg, i) => (
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
                  remarkPlugins={[remarkGfm]}
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

      {/* Refined Idea Sidebar */}
      <div className="w-full md:w-1/3 bg-slate-100 dark:bg-slate-800 p-4 rounded-xl shadow h-fit">
        <h2 className="text-xl font-semibold mb-2">Refined Idea</h2>
        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
          {refinedIdea || "The assistant will summarize and refine your idea here as you chat."}
        </p>
      </div>
    </div>
  );
}
