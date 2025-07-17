"use client";
import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatAssistant() {
  const [ideas, setIdeas] = useState<any[]>([]);
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);

  const activeIdea = ideas.find((idea) => idea.id === activeIdeaId);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea when editing
  useEffect(() => {
    if (activeIdea?.editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [activeIdea?.editing, activeIdea?.editValue]);

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const updateIdea = (id: string, updates: Partial<any>) => {
    setIdeas((prev) =>
      prev.map((idea) => (idea.id === id ? { ...idea, ...updates } : idea))
    );
  };

  // ... (keep all other existing functions unchanged)

  return (
    <div className="flex flex-col md:flex-row gap-6 max-w-7xl mx-auto">
      {/* Chat Area (unchanged) */}

      {/* Ideas Panel */}
      <div className="w-full md:w-1/3 bg-slate-100 dark:bg-slate-800 p-4 rounded-xl shadow h-fit space-y-6">
        {ideas.map((idea) => (
          <div
            key={idea.id}
            className={`border rounded-lg p-3 cursor-pointer transition-all ${
              idea.id === activeIdeaId ? "border-blue-500 shadow-md" : "border-slate-300 hover:border-slate-400"
            }`}
            onClick={() => !idea.editing && setActiveIdeaId(idea.id)}
          >
            {idea.editing ? (
              <>
                <textarea
                  ref={textareaRef}
                  className="w-full p-2 rounded border dark:bg-slate-900 dark:text-white resize-none overflow-hidden"
                  value={idea.editValue}
                  onChange={(e) => updateIdea(idea.id, { editValue: e.target.value })}
                  onBlur={() => handleEditSave(idea.id)}
                  autoFocus
                  rows={1}
                  style={{ minHeight: '44px' }}
                />
                <div className="flex justify-end mt-2 space-x-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditSave(idea.id);
                    }}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Save
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateIdea(idea.id, { editing: false });
                    }}
                    className="px-3 py-1 text-sm bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold text-md mb-1 whitespace-pre-wrap">
                  {idea.title}
                </div>

                {/* Rest of your existing JSX */}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

