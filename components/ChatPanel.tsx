// Updated ChatPanel.tsx with chat bubbles and animated spinner
import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

// Lazy load remark-gfm with dynamic import for compatibility
const loadRemarkGfm = async () => {
  const mod = await import("remark-gfm");
  return mod.default || mod;
};

interface ChatMessage {
  role: "user" | "assistant" | string;
  content: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  loading: boolean;
  onStreamComplete?: (content: string) => void;
  idea: any;
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
}

export default function ChatPanel({
  messages,
  onSend,
  loading,
  onStreamComplete,
  idea,
  isActive,
  onClick,
  disabled,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [streamedContent, setStreamedContent] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [remarkPlugins, setRemarkPlugins] = useState<any[]>([]);

  useEffect(() => {
    loadRemarkGfm().then((plugin) => {
      setRemarkPlugins([plugin]);
    });
  }, []);

  const handleSend = () => {
    if (input.trim() === "") return;
    onSend(input);
    setInput("");
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamedContent]);

  useEffect(() => {
    if (onStreamComplete && streamedContent !== "") {
      onStreamComplete(streamedContent);
    }
  }, [streamedContent, onStreamComplete]);

  // Helper to render spinner with three bouncing dots
  const Spinner = () => (
    <div className="flex space-x-1 py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-2 w-2 rounded-full bg-gray-500 animate-bounce"
          style={{ animationDelay: `${i * 0.2}s` }}
        ></div>
      ))}
    </div>
  );

  return (
    <div
      className={`rounded-xl border border-gray-200 p-4 shadow-sm ${isActive ? "ring-2 ring-blue-500" : ""}`}
      onClick={onClick}
    >
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto rounded bg-gray-50 p-2 text-sm"
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`${
                msg.role === "user" ? "bg-primary text-white" : "bg-gray-200 text-gray-800"
              } px-3 py-2 rounded-lg max-w-xs break-words`}
            >
              <ReactMarkdown remarkPlugins={remarkPlugins} className="prose prose-sm">
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="mb-2 flex justify-start">
            <Spinner />
          </div>
        )}
        {streamedContent && (
          <div className="mb-2 flex justify-start">
            <div className="bg-gray-200 text-gray-800 px-3 py-2 rounded-lg max-w-xs break-words">
              <ReactMarkdown remarkPlugins={remarkPlugins} className="prose prose-sm">
                {streamedContent}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <input
          type="text"
          placeholder="Type your message..."
          className="flex-1 rounded border border-gray-300 p-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          disabled={disabled}
        />
        <button
          onClick={handleSend}
          className="rounded bg-primary px-4 py-2 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          disabled={disabled || input.trim() === ""}
        >
          Send
        </button>
      </div>
    </div>
  );
}