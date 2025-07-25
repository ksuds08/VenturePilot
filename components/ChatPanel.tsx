// ChatPanel.tsx (Quick fix for remark-gfm vfile version conflict)

import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

  return (
    <div
      className={`rounded-xl border border-gray-200 p-4 shadow-sm ${
        isActive ? "ring-2 ring-blue-500" : ""
      }`}
      onClick={onClick}
    >
      <div
        ref={scrollRef}
        className="max-h-64 overflow-y-auto rounded bg-gray-50 p-2 text-sm"
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-2 ${
              msg.role === "user" ? "text-right text-blue-700" : "text-left text-gray-800"
            }`}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm.default || remarkGfm]}
              className="prose prose-sm"
            >
              {msg.content}
            </ReactMarkdown>
          </div>
        ))}
        {loading && (
          <div className="italic text-gray-500 animate-pulse">Thinking...</div>
        )}
        {streamedContent && (
          <div className="text-left text-gray-800">
            <ReactMarkdown
              remarkPlugins={[remarkGfm.default || remarkGfm]}
              className="prose prose-sm"
            >
              {streamedContent}
            </ReactMarkdown>
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
          className="rounded bg-blue-600 px-4 py-2 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          disabled={disabled || input.trim() === ""}
        >
          Send
        </button>
      </div>
    </div>
  );
}
