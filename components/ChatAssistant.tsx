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

// Key takeaways summarised outside the chat
interface Takeaways {
  refinedIdea?: string;
  validationSummary?: string;
  brandingName?: string;
  brandingTagline?: string;
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

  // Summarised key takeaways for quick reference
  takeaways?: Takeaways;
}

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId);

  // Track which idea's full business plan is currently shown (null for none)
  const [fullPlanIdeaId, setFullPlanIdeaId] = useState<string | null>(null);

  // Load persisted ideas from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("vp_ideas");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setIdeas(parsed);
          // restore active idea id if present
          const activeId = localStorage.getItem("vp_activeIdeaId");
          if (activeId) setActiveIdeaId(activeId);
        }
      }
    } catch (e) {
      console.error("Failed to load persisted ideas", e);
    }
  }, []);

  // Persist ideas and active idea id whenever they change
  useEffect(() => {
    try {
      localStorage.setItem("vp_ideas", JSON.stringify(ideas));
      if (activeIdeaId) {
        localStorage.setItem("vp_activeIdeaId", activeIdeaId);
      }
    } catch (e) {
      console.error("Failed to persist ideas", e);
    }
  }, [ideas, activeIdeaId]);

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
      newIdea = { id, title: input.trim(), draft: "", messages: [newMessage], locked: false, takeaways: {} };
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
      // Determine the refined idea to display. If the backend returns a refinedIdea, use it.
      // Otherwise derive a concise fallback from the assistant's reply. If even that is
      // unavailable, retain the previous draft so the refined idea card doesn't disappear.
      let refinedCandidate: string | undefined = data?.refinedIdea;
      // Derive a short fallback from the assistant reply (first non‑empty line)
      let fallbackRefined = reply;
      const lines = reply.split(/\r?\n/).map((l) => l.trim()).filter((l) => l);
      if (lines.length > 0) {
        fallbackRefined = lines[0];
      }
      // If refinedCandidate is falsy (undefined, empty string), choose fallbackRefined
      // but if that's also empty, keep the previous draft to avoid clearing the card
      let refined: string;
      if (refinedCandidate && refinedCandidate.trim()) {
        refined = refinedCandidate.trim();
      } else if (fallbackRefined && fallbackRefined.trim()) {
        refined = fallbackRefined.trim();
      } else {
        // retain existing draft
        refined = newIdea.draft || "";
      }
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
      // Once streaming is complete, set the draft and update the takeaways. If refined is
      // empty, the previous draft is retained in the takeaways update logic.
      updateIdea(newIdea.id, {
        draft: refined,
        takeaways: {
          ...newIdea.takeaways,
          refinedIdea: refined,
        },
      });
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
      // Extract a concise summary from the validation text (first non‑empty line)
      let validationSummary: string | undefined;
      const vLines = (data?.validation || "").split(/\r?\n/).map((l: string) => l.trim()).filter((l: string) => l);
      if (vLines.length > 0) validationSummary = vLines[0];
      updateIdea(id, {
        validation: data.validation,
        lastValidated: data.timestamp,
        takeaways: {
          ...idea.takeaways,
          validationSummary,
        },
      });
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
      // Some APIs return a nested `branding` object; if so, unwrap it. Otherwise use the top level.
      const brandingData = data?.branding ?? data;
      updateIdea(id, {
        branding: brandingData,
        takeaways: {
          ...idea.takeaways,
          brandingName: brandingData?.name,
          brandingTagline: brandingData?.tagline,
        },
      });
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
    <div className="max-w-5xl mx-auto p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Chat column */}
        <div className="lg:w-1/2 w-full border border-gray-300 dark:border-slate-700 rounded-xl flex flex-col max-h-[80vh]">
          {/* Scrollable message list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {(activeIdea?.messages ?? []).map((msg, i) => (
              <div key={i} className={`text-${msg.role === "user" ? "right" : "left"}`}>
                <div
                  className={`inline-block px-4 py-2 rounded-xl max-w-[80%] whitespace-pre-wrap ${
                    msg.role === "user"
                      ? "bg-blue-500 text-white ml-auto"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100"
                  }`}
                >
                  <ReactMarkdown className="prose dark:prose-invert max-w-none text-left" remarkPlugins={[remarkGfm as any]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && <div className="text-slate-400 text-sm">Assistant is typing…</div>}
          </div>
          {/* Input area */}
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
        {/* Details column */}
        <div className="lg:w-1/2 w-full space-y-6 overflow-y-auto max-h-[80vh] pr-2">
          {ideas.map((idea) => (
            <div key={idea.id} className="space-y-4">
              {/* Idea title card */}
              <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                <h3 className="text-lg font-semibold mb-1">{idea.title}</h3>
              </section>
              {/* Key takeaways summary */}
              {idea.takeaways && (
                <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                  <details open>
                    {/* Business plan summary assembled as the chat evolves */}
                    <summary className="font-semibold text-sm cursor-pointer text-teal-600">Business Plan</summary>
                    <div className="mt-2 text-sm space-y-1">
                      <div>
                        <strong>Refined Idea:</strong>{" "}
                        {idea.takeaways.refinedIdea || "—"}
                      </div>
                      {idea.takeaways.validationSummary && (
                        <div>
                          <strong>Market Potential:</strong>{" "}
                          {idea.takeaways.validationSummary}
                        </div>
                      )}
                      {idea.takeaways.brandingName && (
                        <div>
                          <strong>Brand Name:</strong>{" "}
                          {idea.takeaways.brandingName}
                        </div>
                      )}
                      {idea.takeaways.brandingTagline && (
                        <div>
                          <strong>Tagline:</strong>{" "}
                          {idea.takeaways.brandingTagline}
                        </div>
                      )}
                    </div>
                  </details>
                </section>
              )}
              {/* Refined idea card */}
              {!idea.locked && idea.draft && (
                <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                  <details open>
                    <summary className="cursor-pointer text-sm font-medium">Refined Idea</summary>
                    <div className="mt-2 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {idea.draft}
                    </div>
                    <button
                      onClick={() => handleAcceptDraft(idea.id)}
                      className="mt-2 text-green-600 text-sm"
                    >
                      Accept
                    </button>
                  </details>
                </section>
              )}
              {/* Validate call card */}
              {idea.locked && !idea.validation && (
                <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                  <button
                    onClick={() => handleValidate(idea.id)}
                    className="text-blue-500 text-sm"
                  >
                    {validating === idea.id ? "Validating..." : "Validate"}
                  </button>
                </section>
              )}
              {/* Validation report */}
              {idea.validation && (
                <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                  <details>
                    <summary className="font-semibold text-sm cursor-pointer">Validation Report</summary>
                    <div className="mt-2 text-sm max-h-64 overflow-y-auto">
                      <ReactMarkdown
                        className="prose dark:prose-invert"
                        remarkPlugins={[remarkGfm as any]}
                      >
                        {idea.validation}
                      </ReactMarkdown>
                    </div>
                  </details>
                </section>
              )}
              {/* Branding kit */}
              {idea.branding && (
                <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                  <details>
                    <summary className="font-semibold text-sm cursor-pointer text-indigo-500">Branding Kit</summary>
                    <div className="space-y-1 text-sm mt-2">
                      <div>
                        <strong>Name:</strong> {idea.branding?.name || "N/A"}
                      </div>
                      <div>
                        <strong>Tagline:</strong> {idea.branding?.tagline || "N/A"}
                      </div>
                      <div>
                        <strong>Colors:</strong>{" "}
                        {idea.branding?.colors && idea.branding.colors.length
                          ? idea.branding.colors.join(", ")
                          : "N/A"}
                      </div>
                      {(() => {
                        const logo = (idea.branding as any)?.logoDesc || (idea.branding as any)?.logo_prompt;
                        return logo ? (
                          <div>
                            <strong>Logo Prompt:</strong> {logo}
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </details>
                </section>
              )}
              {/* Deployment */}
              {idea.pagesUrl && (
                <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                  <details>
                    <summary className="font-semibold text-sm cursor-pointer text-green-600">Deployment</summary>
                    <div className="mt-2 text-sm space-y-1">
                      <a href={idea.pagesUrl} target="_blank" className="text-green-600 underline">
                        View App
                      </a>
                      {idea.repoUrl && (
                        <a href={idea.repoUrl} target="_blank" className="text-gray-500 underline block">
                          View Repository
                        </a>
                      )}
                    </div>
                  </details>
                </section>
              )}
              {/* Action buttons for next steps */}
              <div className="flex flex-wrap gap-4">
                {idea.locked && idea.validation && !idea.branding && (
                  <button onClick={() => handleBrand(idea.id)} className="text-indigo-600 text-sm">
                    Generate Branding
                  </button>
                )}
                {idea.branding && !idea.pagesUrl && (
                  <button onClick={() => handleMVP(idea.id)} className="text-green-600 text-sm">
                    Generate MVP
                  </button>
                )}
                {/* Toggle full business plan view */}
                {(idea.validation || idea.branding || idea.pagesUrl) && (
                  <button
                    onClick={() =>
                      setFullPlanIdeaId(fullPlanIdeaId === idea.id ? null : idea.id)
                    }
                    className="text-teal-600 text-sm"
                  >
                    {fullPlanIdeaId === idea.id ? "Hide Full Plan" : "View Full Plan"}
                  </button>
                )}
              </div>

              {/* Full business plan compiled view */}
              {fullPlanIdeaId === idea.id && (
                <section className="p-4 bg-white dark:bg-slate-800 rounded-xl shadow">
                  <details open>
                    <summary className="font-semibold text-sm cursor-pointer text-teal-700">Full Business Plan</summary>
                    <div className="mt-2 text-sm space-y-3">
                      {/* Refined idea summary */}
                      {idea.takeaways?.refinedIdea && (
                        <div>
                          <strong>Refined Idea:</strong> {idea.takeaways.refinedIdea}
                        </div>
                      )}
                      {/* Full validation text */}
                      {idea.validation && (
                        <div>
                          <strong>Validation:</strong>
                          <div className="mt-1 max-h-64 overflow-y-auto border border-gray-200 dark:border-slate-700 p-2 rounded">
                            <ReactMarkdown
                              className="prose dark:prose-invert"
                              remarkPlugins={[remarkGfm as any]}
                            >
                              {idea.validation}
                            </ReactMarkdown>
                          </div>
                        </div>
                      )}
                      {/* Branding summary */}
                      {idea.branding && (
                        <div>
                          <strong>Branding:</strong>
                          <div className="mt-1 space-y-1 ml-4">
                            <div>
                              <strong>Name:</strong> {idea.branding?.name}
                            </div>
                            <div>
                              <strong>Tagline:</strong> {idea.branding?.tagline}
                            </div>
                            <div>
                              <strong>Colors:</strong>{" "}
                              {idea.branding?.colors?.join(", ")}
                            </div>
                            {(() => {
                              const logo = (idea.branding as any)?.logoDesc || (idea.branding as any)?.logo_prompt;
                              return logo ? (
                                <div>
                                  <strong>Logo Prompt:</strong> {logo}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      )}
                      {/* Deployment links */}
                      {idea.pagesUrl && (
                        <div>
                          <strong>Deployment:</strong>
                          <div className="mt-1 ml-4 space-y-1">
                            <a href={idea.pagesUrl} target="_blank" className="text-green-600 underline">
                              View App
                            </a>
                            {idea.repoUrl && (
                              <a href={idea.repoUrl} target="_blank" className="text-gray-500 underline block">
                                View Repository
                              </a>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </details>
                </section>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
