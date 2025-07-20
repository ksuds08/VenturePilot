// components/ChatPanel.tsx
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatPanel({ messages, onSend, loading }) {
  const [input, setInput] = useState("");

  const handleSend = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput("");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
            <div className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${
              msg.role === "user" ? "bg-blue-500 text-white ml-auto" : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            }`}>
              <ReactMarkdown className="prose dark:prose-invert max-w-none text-left" remarkPlugins={[remarkGfm]}>
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && <div className="text-slate-400 text-sm">Assistant is typing…</div>}
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

