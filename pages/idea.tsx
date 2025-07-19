import Layout from "../Layout";
import { useState } from "react";
import { motion } from "framer-motion";

// Example ideas to quick‑fill the input box.  Feel free to adjust these or
// remove them entirely.
const EXAMPLES = [
  "A marketplace for local artists",
  "AI‑powered resume builder for GenZ",
  "No‑code CRM for solopreneurs",
];

/**
 * IdeaInputPage
 *
 * This page allows the user to describe a startup idea.  When the user
 * submits their idea, it calls the VenturePilot backend (/idea endpoint)
 * to generate both a one‑paragraph summary and a set of elaborated
 * requirements/clarifying questions (the "Business Idea Canvas").  The
 * results are displayed below the chat interface.
 */
export default function IdeaInputPage() {
  const [messages, setMessages] = useState([
    { sender: "ai", text: "Describe your startup idea and I’ll help you build it!" },
  ]);
  const [input, setInput] = useState("");
  const [canvas, setCanvas] = useState(null as null | {
    summary: string;
    requirements: string[];
    questions: string[];
  });
  const [loading, setLoading] = useState(false);

  // Send the user's idea to the backend and update the chat and canvas
  async function sendMessage() {
    if (!input.trim() || loading) return;
    const userMsg = { sender: "user", text: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch("https://venturepilot.workers.dev/idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: input.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = data?.error || `Server error ${res.status}`;
        throw new Error(errMsg);
      }
      // Compose assistant response text from summary/requirements/questions
      let assistantText = data.summary || "";
      if (data.requirements && data.requirements.length) {
        assistantText += "\n\nRequirements:\n" + data.requirements.map((req: string, i: number) => `${i + 1}. ${req}`).join("\n");
      }
      if (data.questions && data.questions.length) {
        assistantText += "\n\nClarifying Questions:\n" + data.questions.map((q: string, i: number) => `${i + 1}. ${q}`).join("\n");
      }
      const aiMsg = { sender: "ai", text: assistantText };
      setMessages((prev) => [...prev, aiMsg]);
      setCanvas({ summary: data.summary, requirements: data.requirements, questions: data.questions });
    } catch (err) {
      console.error("Idea handler error", err);
      setMessages((prev) => [...prev, { sender: "ai", text: (err as Error).message || "Something went wrong." }]);
    }
    setInput("");
    setLoading(false);
  }

  return (
    <Layout>
      <section className="max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8 space-y-4">
        <h2 className="text-3xl font-bold mb-2">Describe Your Business Idea</h2>
        {/* Quick‑fill buttons */}
        <div className="flex gap-2 mb-4 flex-wrap">
          {EXAMPLES.map((e, i) => (
            <button
              key={i}
              className="bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-xl text-sm hover:bg-blue-100 dark:hover:bg-blue-900 transition"
              onClick={() => setInput(e)}
            >
              {e}
            </button>
          ))}
        </div>
        {/* Conversation view */}
        <div className="h-64 overflow-y-auto flex flex-col gap-2 mb-4">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              className={`px-4 py-2 rounded-xl w-fit max-w-xs ${
                msg.sender === "ai"
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-white self-start"
                  : "bg-gradient-to-r from-purple-500 to-blue-500 text-white self-end"
              }`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {msg.text}
            </motion.div>
          ))}
          {loading && (
            <div className="text-slate-400 text-sm">Generating canvas…</div>
          )}
        </div>
        {/* Input form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 transition"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your idea..."
          />
          <button
            className="bg-blue-500 text-white px-6 py-2 rounded-xl font-bold hover:scale-105 transition-all"
            disabled={loading}
            type="submit"
          >
            {loading ? 'Sending…' : 'Send'}
          </button>
        </form>
      </section>
      {canvas && (
        <section className="max-w-xl mx-auto mt-6 bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-6 space-y-4">
          <h3 className="text-2xl font-bold">Your Business Idea Canvas</h3>
          <p className="text-base leading-relaxed">{canvas.summary}</p>
          {canvas.requirements && canvas.requirements.length > 0 && (
            <div>
              <h4 className="font-semibold mb-1">Requirements</h4>
              <ul className="list-disc list-inside space-y-1">
                {canvas.requirements.map((req, idx) => (
                  <li key={idx}>{req}</li>
                ))}
              </ul>
            </div>
          )}
          {canvas.questions && canvas.questions.length > 0 && (
            <div>
              <h4 className="font-semibold mb-1">Clarifying Questions</h4>
              <ul className="list-disc list-inside space-y-1">
                {canvas.questions.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </Layout>
  );
}
