import React from "react";

interface ValidationSummaryProps {
  summary: string;
  fullText?: string;
  onContinue: () => void;
  onRestart: () => void;
}

export default function ValidationSummary({
  summary,
  fullText,
  onContinue,
  onRestart,
}: ValidationSummaryProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg mt-6 max-w-3xl mx-auto">
      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">
        ✅ Validation Complete
      </h3>
      <p className="text-slate-700 dark:text-slate-300 text-lg mb-4 whitespace-pre-wrap">
        {summary}
      </p>
      {fullText && (
        <details className="mb-6">
          <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline mb-2">
            View full validation details
          </summary>
          <pre className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap mt-2">
            {fullText}
          </pre>
        </details>
      )}
      <div className="flex flex-wrap gap-4">
        <button
          onClick={onContinue}
          className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:scale-105 transition-transform"
        >
          🚀 Proceed to Branding
        </button>
        <button
          onClick={onRestart}
          className="border border-slate-400 text-slate-700 dark:text-white px-6 py-2 rounded-full font-medium hover:border-slate-600 hover:scale-105 transition-transform"
        >
          🔄 Rethink Idea
        </button>
      </div>
    </div>
  );
}

