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
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Replace with your API call (Assistants API or Cloudflare Worker)
    const res = await fetch("/api/assistant", {
      method: "POST",
      body: JSON.stringify([...messages, userMsg]),
    });
    const data = await res.json();

    setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    setLoading(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow p-4 max-w-3xl mx-auto">
      <div className="space-y-3 max-h-[500px] overflow-y-auto mb-4">
        {messages.map((msg, i) => (
          <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block px-4 py-2 rounded-xl ${msg.role === "user" ? "bg-blue-500 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && <div className="italic text-slate-400">Assistant is typing…</div>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 p-2 rounded-xl border dark:bg-slate-800 dark:text-white"
          placeholder="Type your idea..."
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
