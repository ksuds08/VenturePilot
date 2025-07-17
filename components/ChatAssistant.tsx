"use client";
import { useState, useRef, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatAssistant() {
  // ... (keep all existing state declarations)

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea when editing
  useEffect(() => {
    if (activeIdea?.editing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [activeIdea?.editing, activeIdea?.editValue]);

  // ... (keep all existing functions until handleEdit)

  const handleEdit = (id: string) => {
    updateIdea(id, { 
      editing: true, 
      editValue: ideas.find((i) => i.id === id)?.title,
      locked: false,
      validation: null,
      validationError: null
    });
  };

  const handleEditSave = (id: string) => {
    const idea = ideas.find((i) => i.id === id);
    if (!idea) return;
    updateIdea(id, {
      title: idea.editValue,
      editing: false,
      editValue: "",
    });
  };

  const handleEditChange = (id: string, value: string) => {
    updateIdea(id, { editValue: value });
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  // ... (keep all other existing functions)

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
                  onChange={(e) => handleEditChange(idea.id, e.target.value)}
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

                {/* Keep all existing idea card content (draft, buttons, validation) */}
                {idea.draft && (
                  <div className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    <div className="font-medium text-xs mb-1">Refined Idea</div>
                    <div className="bg-white dark:bg-slate-900 p-2 rounded border text-sm whitespace-pre-wrap">
                      {idea.draft}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAcceptDraft(idea.id);
                      }}
                      className="mt-2 text-sm text-green-600 hover:underline"
                    >
                      Accept
                    </button>
                  </div>
                )}

                <div className="flex gap-4 text-xs mt-2 flex-wrap">
                  <button
                    className="text-blue-500 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(idea.id);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-500 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(idea.id);
                    }}
                  >
                    Delete
                  </button>
                  {idea.locked && (
                    <button
                      className="text-purple-500 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleValidate(idea.id);
                      }}
                      disabled={validating === idea.id}
                    >
                      {validating === idea.id ? "Validating..." : "Validate"}
                    </button>
                  )}
                </div>

                {/* Keep existing validation display */}
                {idea.validationError && (
                  <div className="mt-3 animate-fade-in">
                    <div className="font-medium text-xs mb-1 text-red-500">Validation Error</div>
                    <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded border border-red-200 dark:border-red-800 text-sm">
                      {idea.validationError}
                    </div>
                  </div>
                )}

                {idea.validation && (
                  <div className="mt-3 animate-fade-in">
                    <div className="flex items-center justify-between mb-1">
                      <div className="font-medium text-xs">Validation Analysis</div>
                      {idea.lastValidated && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {new Date(idea.lastValidated).toLocaleString()}
                        </div>
                      )}
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-3 rounded border max-h-60 overflow-y-auto text-sm">
                      <ReactMarkdown 
                        className="prose dark:prose-invert max-w-none"
                        components={{
                          h1: ({node, ...props}) => <h3 className="text-lg font-bold mt-3 mb-1" {...props} />,
                          h2: ({node, ...props}) => <h4 className="text-md font-semibold mt-2 mb-1" {...props} />,
                          h3: ({node, ...props}) => <h5 className="text-sm font-medium mt-2 mb-1" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1" {...props} />,
                          a: ({node, ...props}) => <a className="text-blue-500 hover:underline" {...props} />,
                        }}
                        remarkPlugins={[remarkGfm]}
                      >
                        {idea.validation}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
