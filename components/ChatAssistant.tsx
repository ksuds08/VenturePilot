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

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { role: "user", content: input };
    const updatedMessages = [...messages, userMsg];

    setMessages(updatedMessages);
    setInput("");
    setLoading(true);

    const newAssistantMsg = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, newAssistantMsg]);

    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...updatedMessages] }),
      });

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let updateCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.startsWith("data: "));

        for (const line of lines) {
          const token = line.replace("data: ", "").trim();
          if (token === "[DONE]") continue;

          // ✅ Add a space if needed between words
          const lastChar = buffer.slice(-1);
          const needsSpace =
            lastChar && /\w/.test(lastChar) && /^\w/.test(token);
          buffer += needsSpace ? ` ${token}` : token;

          updateCount++;

          if (
            updateCount % 3 === 0 ||
            buffer.endsWith(".") ||
            buffer.endsWith("!") ||
            buffer.endsWith("?") ||
            buffer.endsWith(" ")
          ) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                ...updated[updated.length - 1],
                content: buffer,
              };
              return updated;
            });

            await delay(25);
          }
        }
      }

      // Final flush
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: buffer.trim(),
        };
        return updated;
      });
    } catch (err) {
      console.error("Streaming error", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Sorry, there was a problem receiving the response. Please try again.",
        },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow p-4 max-w-3xl mx-auto">
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
  );
}
