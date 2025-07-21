import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatPanel({ messages, onSend, loading, onStreamComplete }) {
  const [input, setInput] = useState("");
  const [streamedContent, setStreamedContent] = useState("");
  const scrollRef = useRef(null);

  const handleSend = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput("");
      setStreamedContent(""); // reset streaming state
    }
  };

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamedContent]);

  // Simulate assistant streaming and notify when done
  useEffect(() => {
    if (!loading && messages.length > 0) {
      const last = messages[messages.length - 1];
      if (last.role === "assistant") {
        let i = 0;
        const fullText = last.content;
        setStreamedContent("");

        const interval = setInterval(() => {
          i++;
          setStreamedContent(fullText.slice(0, i));
          if (i >= fullText.length) {
            clearInterval(interval);
            onStreamComplete?.(); // ✅ Notify ChatAssistant
          }
        }, 12); // typing speed in ms

        return () => clearInterval(interval);
      }
    }
  }, [loading, messages]);

  const renderMessage = (msg, i) => {
    const isStreaming = i === messages.length - 1 && msg.role === "assistant";
    const content = isStreaming ? streamedContent : msg.content;

    return (
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
            {content}
          </ReactMarkdown>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => renderMessage(msg, i))}
        {loading && <div className="text-slate-400 text-sm">Assistant is typing…</div>}
        <div ref={scrollRef} />
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
  );
}

