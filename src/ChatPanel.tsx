import { useState, KeyboardEvent, useRef, useEffect } from "react";

/**
 * Represents a single action that can be rendered as a button in the chat.
 * Each action has a label for display and a command string which is sent
 * back to the parent via the onSend callback when clicked.
 */
export interface ChatAction {
  label: string;
  command: string;
}

/**
 * Represents a chat message. In addition to the role and content, a
 * message may include an optional imageUrl to display an image and an
 * optional list of actions. When actions are present the UI will
 * render buttons for each action.
 */
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

/**
 * ChatPanel renders a scrollable list of messages along with an input box
 * for the user to type new messages. Assistant messages with actions
 * will render buttons that call back to the parent with their command.
 */
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

  // Scroll to bottom whenever messages change
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
      className={`border rounded p-4 ${isActive ? "border-blue-400" : "border-gray-200"}`}
      onClick={onClick}
    >
      <div
        ref={containerRef}
        className="mb-4 max-h-64 overflow-y-auto space-y-4"
      >
        {messages.map((msg, idx) => (
          <div key={idx} className="space-y-1">
            <div
              className={`p-2 rounded-md whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-gray-100 self-end text-right"
                  : "bg-blue-50"
              }`}
            >
              {msg.content}
              {msg.imageUrl && (
                <div className="mt-2">
                  <img
                    src={msg.imageUrl}
                    alt=""
                    className="max-w-full h-auto rounded"
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
                    className="px-3 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
                    disabled={loading || disabled}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div className="text-gray-400">Thinking…</div>
        )}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          className="flex-1 border rounded p-2 resize-none"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || loading}
          placeholder={disabled ? "Conversation locked" : "Type a message…"}
        />
        <button
          className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50"
          onClick={sendMessage}
          disabled={disabled || loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
