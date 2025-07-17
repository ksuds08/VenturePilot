"use client";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatAssistant() {
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi! Ready to build your startup together?" }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [refinedIdea, setRefinedIdea] = useState<string | null>(null);
  const [lockedIdeas, setLockedIdeas] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [validatedIdeas, setValidatedIdeas] = useState<Record<string, string>>({});
  const [validationLoading, setValidationLoading] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("lockedIdeas");
    if (saved) setLockedIdeas(JSON.parse(saved));
  }, []);

  const saveLockedIdea = (idea: string) => {
    if (lockedIdeas.includes(idea)) return;
    const updated = [...lockedIdeas, idea];
    setLockedIdeas(updated);
    localStorage.setItem("lockedIdeas", JSON.stringify(updated));
  };

  const deleteLockedIdea = (index: number) => {
    const updated = [...lockedIdeas];
    const [removed] = updated.splice(index, 1);
    const newValidations = { ...validatedIdeas };
    delete newValidations[removed];
    setValidatedIdeas(newValidations);
    setLockedIdeas(updated);
    localStorage.setItem("lockedIdeas", JSON.stringify(updated));
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(lockedIdeas[index]);
  };

  const handleSave = () => {
    if (editingIndex === null) return;
    const updated = [...lockedIdeas];
    updated[editingIndex] = editValue.trim();
    setLockedIdeas(updated);
    localStorage.setItem("lockedIdeas", JSON.stringify(updated));
    setEditingIndex(null);
    setEditValue("");
  };

  const validateIdea = async (idea: string) => {
    const ideaId = btoa(idea).slice(0, 12); // deterministic short ID
    if (validatedIdeas[idea]) return; // already validated

    setValidationLoading(idea);
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, ideaId }),
      });

      const data = await res.json();
      setValidatedIdeas((prev) => ({ ...prev, [idea]: data.content || "Validation complete." }));
    } catch (err) {
      setValidatedIdeas((prev) => ({ ...prev, [idea]: "⚠️ Validation failed. Please try again." }));
    }
    setValidationLoading(null);
  };

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
      });

      const data = await res.json();
      const fullText = data.reply ?? "";
      const newRefined = data.refinedIdea ?? null;
      if (newRefined) setRefinedIdea(newRefined);

      const words = fullText.split(" ");
      let displayed = "";
      const assistantMsg = { role: "assistant", content: "" };
      setMessages((prev) => [...prev, assistantMsg]);

      for (const word of words) {
        displayed += word + " ";
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content: displayed.trim(),
          };
          return updated;
        });
        await delay(50);
      }
    } catch (err) {
      console.error("Typing simulation error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Sorry, something went wrong. Please try again." },
      ]);
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 max-w-6xl mx-auto">
      {/* Chat */}
      <div className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl shadow p-4">
        <div className="space-y-4 max-h-[400px] overflow-y-auto mb-4">
          {messages.map((msg, i) => (
            <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
              <div className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-blue-500 text-white ml-auto"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              }`}>
                <ReactMarkdown className="prose dark:prose-invert max-w-none text-left" remarkPlugins={[remarkGfm]}>
                  {msg.content}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && <div className="text-left text-slate-400 text-sm">Assistant is typing…</div>}
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

      {/* Sidebar */}
      <div className="w-full md:w-1/3 bg-slate-100 dark:bg-slate-800 p-4 rounded-xl shadow h-fit">
        <h2 className="text-xl font-semibold mb-2">Refined Idea</h2>
        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
          {refinedIdea || "The assistant will summarize and refine your idea here as you chat."}
        </p>

        {refinedIdea && (
          <button
            onClick={() => saveLockedIdea(refinedIdea)}
            className="mt-4 bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
          >
            Lock This Version
          </button>
        )}

        {lockedIdeas.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Locked Ideas</h3>
            <ul className="space-y-4">
              {lockedIdeas.map((idea, i) => (
                <li key={i} className="bg-white dark:bg-slate-900 border rounded-lg p-3">
                  {editingIndex === i ? (
                    <>
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full p-2 rounded border dark:bg-slate-800 dark:text-white"
                        rows={3}
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={handleSave}
                          className="bg-blue-600 text-white py-1 px-3 rounded hover:bg-blue-700"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingIndex(null)}
                          className="text-sm text-slate-500 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-sm whitespace-pre-wrap mb-2">{idea}</p>
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEdit(i)}
                          className="text-blue-500 hover:underline text-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteLockedIdea(i)}
                          className="text-red-500 hover:underline text-sm"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => validateIdea(idea)}
                          disabled={validationLoading === idea}
                          className="text-green-600 hover:underline text-sm"
                        >
                          {validationLoading === idea ? "Validating..." : "Validate"}
                        </button>
                      </div>
                      {validatedIdeas[idea] && (
                        <div className="mt-2 p-2 rounded bg-slate-200 dark:bg-slate-700 text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{validatedIdeas[idea]}</ReactMarkdown>
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
