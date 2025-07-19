// Updated ChatAssistant.tsx for VenturePilot
// Includes collapsible cards per stage, left-aligned sections, better spacing


"use client";
import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


interface Branding {
  name: string;
  tagline: string;
  colors: string[];
  logoDesc?: string;
}


interface Idea {
  id: string;
  title: string;
  draft?: string;
  messages: any[];
  locked: boolean;
  editing?: boolean;
  editValue?: string;
  validation?: string;
  validationError?: string;
  lastValidated?: string;
  branding?: Branding;
  repoUrl?: string;
  pagesUrl?: string;
}


export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId);


  const updateIdea = (id: string, updates: Partial<Idea>) => {
    setIdeas((prev) => prev.map((idea) => (idea.id === id ? { ...idea, ...updates } : idea)));
  };


  const handleSend = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    const newMessage = { role: "user", content: input.trim() };
    setInput("");
    let newIdea = activeIdea;
    if (!newIdea) {
      const id = uuidv4();
      newIdea = { id, title: input.trim(), draft: "", messages: [newMessage], locked: false };
      setIdeas((prev) => [...prev, newIdea]);
      setActiveIdeaId(id);
    } else {
      newIdea.messages.push(newMessage);
      updateIdea(newIdea.id, { messages: [...newIdea.messages] });
    }
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newIdea.messages }),
      });
      const data = await res.json();
      const reply = data?.reply || "No reply.";
      const refined = data?.refinedIdea || "";
      const assistantMsg = { role: "assistant", content: "" };
      const words = reply.split(" ");
      const updatedMsgs = [...newIdea.messages, assistantMsg];
      updateIdea(newIdea.id, { messages: updatedMsgs });
      let streamed = "";
      for (const word of words) {
        streamed += word + " ";
        updateIdea(newIdea.id, {
          messages: updatedMsgs.map((m, i) => (i === updatedMsgs.length - 1 ? { ...m, content: streamed.trim() } : m)),
        });
        await new Promise((r) => setTimeout(r, 25));
      }
      updateIdea(newIdea.id, { draft: refined });
    } catch (err) {
      updateIdea(newIdea.id, { messages: [...newIdea.messages, { role: "assistant", content: "Something went wrong." }] });
    }
    setLoading(false);
  };


  const handleAcceptDraft = (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    updateIdea(id, { title: idea.draft || idea.title, draft: "", locked: true });
  };


  const handleValidate = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    setValidating(id);
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      updateIdea(id, { validation: data.validation, lastValidated: data.timestamp });
    } catch (err) {
      updateIdea(id, { validationError: "Validation failed." });
    } finally {
      setValidating(null);
    }
  };


  const handleBrand = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/brand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      updateIdea(id, { branding: data });
    } catch (err) {
      alert("Branding failed");
    }
  };


  const handleMVP = async (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/mvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea: idea.title, ideaId: idea.id }),
      });
      const data = await res.json();
      updateIdea(id, { repoUrl: data.repoUrl, pagesUrl: data.pagesUrl });
    } catch (err) {
      alert("MVP failed");
    }
  };


  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <div className="space-y-4">
        {(activeIdea?.messages ?? []).map((msg, i) => (
          <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
            <div className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${msg.role === "user" ? "bg-blue-500 text-white ml-auto" : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"}`}>
              <ReactMarkdown className="prose dark:prose-invert max-w-none text-left" remarkPlugins={[remarkGfm as any]}>
                {msg.content}
              </ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && <div className="text-slate-400 text-sm">Assistant is typing…</div>}
      </div>
      <div className="flex gap-2">
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
      {ideas.map((idea) => (
        <div key={idea.id} className="space-y-6">
          <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
            <h3 className="text-lg font-semibold mb-1">{idea.title}</h3>
            {!idea.locked && idea.draft && (
              <details open>
                <summary className="cursor-pointer text-sm font-medium">Refined Idea</summary>
                <div className="mt-2 text-sm whitespace-pre-wrap">{idea.draft}</div>
                <button onClick={() => handleAcceptDraft(idea.id)} className="mt-2 text-green-600 text-sm">Accept</button>
              </details>
            )}
            {idea.locked && !idea.validation && (
              <button onClick={() => handleValidate(idea.id)} className="text-blue-500 text-sm">
                {validating === idea.id ? "Validating..." : "Validate"}
              </button>
            )}
          </section>
          {idea.validation && (
            <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
              <details>
                <summary className="font-semibold text-sm cursor-pointer">Validation Report</summary>
                <div className="mt-2 text-sm">
                  <ReactMarkdown className="prose dark:prose-invert" remarkPlugins={[remarkGfm as any]}>
                    {idea.validation}
                  </ReactMarkdown>
                </div>
              </details>
            </section>
          )}
          {idea.branding && (
            <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
              <details>
                <summary className="font-semibold text-sm cursor-pointer text-indigo-500">Branding Kit</summary>
                <div className="space-y-1 text-sm mt-2">
                  <div><strong>Name:</strong> {idea.branding.name}</div>
                  <div><strong>Tagline:</strong> {idea.branding.tagline}</div>
                  <div><strong>Colors:</strong> {idea.branding.colors.join(", ")}</div>
                  {idea.branding.logoDesc && <div><strong>Logo Prompt:</strong> {idea.branding.logoDesc}</div>}
                </div>
              </details>
            </section>
          )}
          {idea.pagesUrl && (
            <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
              <details>
                <summary className="font-semibold text-sm cursor-pointer text-green-600">Deployment</summary>
                <div className="mt-2 text-sm space-y-1">
                  <a href={idea.pagesUrl} target="_blank" className="text-green-600 underline">View App</a>
                  {idea.repoUrl && <a href={idea.repoUrl} target="_blank" className="text-gray-500 underline block">View Repository</a>}
                </div>
              </details>
            </section>
          )}
          <div className="flex gap-4">
            {idea.locked && idea.validation && !idea.branding && (
              <button onClick={() => handleBrand(idea.id)} className="text-indigo-600 text-sm">Generate Branding</button>
            )}
            {idea.branding && !idea.pagesUrl && (
              <button onClick={() => handleMVP(idea.id)} className="text-green-600 text-sm">Generate MVP</button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

