// components/SummaryPanel.tsx
export default function SummaryPanel({ idea, onAdvanceStage }) {
  return (
    <div className="p-4 space-y-4 text-sm text-gray-800 dark:text-gray-100">
      <h2 className="text-lg font-semibold">Business Plan Summary</h2>
      <div><strong>Current Stage:</strong> {idea.currentStage?.toUpperCase()}</div>
      <div><strong>Refined Idea:</strong> {idea.takeaways?.refinedIdea || "—"}</div>
      {idea.validation && (
        <div><strong>Validation:</strong><br /><pre>{idea.validation}</pre></div>
      )}
      {idea.branding && (
        <div>
          <strong>Branding:</strong>
          <div>Name: {idea.branding.name}</div>
          <div>Tagline: {idea.branding.tagline}</div>
          <div>Colors: {idea.branding.colors?.join(", ")}</div>
        </div>
      )}
      {idea.pagesUrl && (
        <div>
          <strong>Deployment:</strong>{" "}
          <a href={idea.pagesUrl} target="_blank" className="text-green-600 underline">View App</a>
        </div>
      )}
      <button onClick={onAdvanceStage} className="text-xs text-blue-500 underline mt-2">Advance to next stage</button>
    </div>
  );
}

