import { useState, KeyboardEvent, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
// @ts-ignore: suppress type error due to vfile version mismatch in remark-gfm
import remarkGfm from "remark-gfm";

export interface ChatAction {
  label: string;
  command: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
  imageUrl?: string;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  onSend: (content: string) => void;
  loading: boolean;
  idea: any;
  isActive: boolean;
  onClick: () => void;
  disabled: boolean;
}

export default function ChatPanel({
  messages,
  onSend,
  loading,
  idea,
  isActive,
  onClick,
  disabled,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setInput("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div
      className={`rounded-2xl shadow-lg p-6 border ${
        isActive ? "border-blue-500" : "border-gray-200"
      } bg-white`}
      onClick={onClick}
    >
      <div
        ref={containerRef}
        className="mb-4 max-h-96 overflow-y-auto space-y-4"
      >
        {messages.map((msg, idx) => (
          <div key={idx} className="space-y-1">
            <div
              className={`p-4 rounded-xl whitespace-pre-wrap text-sm md:text-base ${
                msg.role === "user"
                  ? "bg-gray-100 text-right"
                  : "bg-blue-50 text-left"
              }`}
            >
              <ReactMarkdown
                // @ts-ignore: suppress remark-gfm type mismatch
                remarkPlugins={[remarkGfm as any]}
                className="prose prose-sm break-words max-w-full"
              >
                {msg.content}
              </ReactMarkdown>
              {msg.imageUrl && (
                <div className="mt-2">
                  <img
                    src={msg.imageUrl}
                    alt=""
                    className="max-w-full h-auto rounded-md"
                  />
                </div>
              )}
            </div>
            {msg.actions && (
              <div className="flex flex-wrap gap-2 mt-1">
                {msg.actions.map((action, i) => (
                  <button
                    key={i}
                    onClick={() => onSend(action.command)}
                    className="px-4 py-1.5 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
                    disabled={loading || disabled}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="text-gray-400 text-sm">Thinking…</div>}
      </div>

      <div className="flex items-end gap-2 pt-2 border-t mt-4">
        <textarea
          className="flex-1 border rounded-md p-2 text-sm resize-none shadow-sm"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder={disabled ? "Conversation locked" : "Type a message…"}
        />
        <button
          className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          onClick={sendMessage}
          disabled={disabled || loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}