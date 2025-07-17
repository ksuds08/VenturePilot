import Layout from "../Layout";
import { useState } from "react";
import { motion } from "framer-motion";

const EXAMPLES = [
  "A marketplace for local artists",
  "AI-powered resume builder for GenZ",
  "No-code CRM for solopreneurs",
];

export default function IdeaInputPage() {
  const [messages, setMessages] = useState([{ sender: "ai", text: "Describe your startup idea and I’ll help you build it!" }]);
  const [input, setInput] = useState("");

  function sendMessage() {
    if (input.trim()) {
      setMessages([...messages, { sender: "user", text: input }]);
      setInput("");
      // Call your backend API here for AI response
    }
  }

  return (
    <Layout>
      <section className="max-w-xl mx-auto bg-white dark:bg-slate-800 rounded-2xl shadow-soft p-8">
        <h2 className="text-3xl font-bold mb-2">Describe Your Business Idea</h2>
        <div className="flex gap-2 mb-4">
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
        <div className="h-64 overflow-y-auto flex flex-col gap-2 mb-4">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              className={`px-4 py-2 rounded-xl w-fit max-w-xs ${
                msg.sender === "ai"
                  ? "bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-white self-start"
                  : "bg-gradient-to-r from-purple-500 to-blue-500 text-white self-end"
              }`}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            >
              {msg.text}
            </motion.div>
          ))}
        </div>
        <form
          onSubmit={e => {
            e.preventDefault();
            sendMessage();
          }}
          className="flex gap-2"
        >
          <input
            className="flex-1 bg-slate-100 dark:bg-slate-700 px-4 py-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-400 transition"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Type your idea..."
          />
          <button className="bg-blue-500 text-white px-6 py-2 rounded-xl font-bold hover:scale-105 transition-all">Send</button>
        </form>
      </section>
    </Layout>
  );
}
