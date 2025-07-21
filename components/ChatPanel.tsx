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
    const isUser = msg.role === "user";

    return (
      <div key={i} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
        <div
          className={`rounded-2xl px-5 py-3 max-w-[80%] whitespace-pre-wrap text-left shadow-md ${
            isUser
              ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white"
              : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          }`}
        >
          <ReactMarkdown
            className="prose dark:prose-invert max-w-none"
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
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-slate-50 dark:bg-slate-900">
        {messages.map((msg, i) => renderMessage(msg, i))}
        {loading && <div className="text-slate-400 text-sm pl-2">Assistant is typing…</div>}
        <div ref={scrollRef} />
      </div>

      <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            className="flex-1 px-4 py-2 rounded-full border border-gray-300 dark:border-slate-600 dark:bg-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Describe your startup idea..."
          />
          <button
            onClick={handleSend}
            disabled={loading}
            className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-5 py-2 rounded-full shadow-md hover:scale-105 transition-transform disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

