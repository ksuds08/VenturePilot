import React from "react";

export default function SummaryPanel({ idea, onAdvanceStage }) {
  return (
    <div className="p-4 space-y-4 text-sm text-gray-800 dark:text-gray-100">
      <h2 className="text-lg font-semibold">Business Plan Summary</h2>

      <div>
        <strong>Current Stage:</strong> {idea.currentStage?.toUpperCase()}
      </div>

      <div>
        <strong>Refined Idea:</strong> {idea.takeaways?.refinedIdea || "—"}
      </div>

      {idea.validation && (
        <div>
          <strong>Validation:</strong>
          <pre className="text-xs whitespace-pre-wrap mt-1 border p-2 rounded bg-gray-50 dark:bg-gray-900">
            {idea.validation}
          </pre>
        </div>
      )}

      {idea.branding && (
        <div>
          <strong>Branding:</strong>
          <div className="pl-2 space-y-1 mt-1">
            {idea.branding.name && <div><strong>Name:</strong> {idea.branding.name}</div>}
            {idea.branding.tagline && <div><strong>Tagline:</strong> {idea.branding.tagline}</div>}
            {idea.branding.colors?.length > 0 && (
              <div><strong>Colors:</strong> {idea.branding.colors.join(", ")}</div>
            )}
            {idea.branding.logoDesc && (
              <div><strong>Logo Description:</strong> {idea.branding.logoDesc}</div>
            )}
          </div>
        </div>
      )}

      {idea.pagesUrl && (
        <div>
          <strong>Deployment:</strong>{" "}
          <a href={idea.pagesUrl} target="_blank" className="text-green-600 underline">
            View App
          </a>
          {idea.repoUrl && (
            <span>
              ,{" "}
              <a href={idea.repoUrl} target="_blank" className="text-gray-500 underline">
                Repository
              </a>
            </span>
          )}
        </div>
      )}

      <button
        onClick={onAdvanceStage}
        className="text-xs text-blue-500 underline mt-2"
      >
        Advance to next stage
      </button>
    </div>
  );
}
