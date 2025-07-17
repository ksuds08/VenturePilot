"use client";
import { useState } from "react";

export default function ChatAssistant() {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hi! Ready to build your startup together?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { role: "user", content: input };
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updatedMessages }),
      });

      if (!res.ok) throw new Error("Assistant API error");

      const data = await res.json();
      const assistantMsg = { role: "assistant", content: data.reply };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Sorry, something went wrong. Please try again." },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow p-4 max-w-3xl mx-auto">
      <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
            <div
              className={`inline-block px-4 py-2 rounded-xl max-w-[80%] ${
                msg.role === "user"
                  ? "bg-blue-500 text-white ml-auto"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-left">
            <div className="inline-block px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400">
              Assistant is typing…
            </div>
          </div>
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
  );
}
