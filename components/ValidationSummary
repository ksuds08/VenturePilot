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
    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-6 shadow-md mt-6">
      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        ✅ Validation Summary
      </h3>

      <p className="text-gray-700 dark:text-gray-300 mb-4">{summary}</p>

      {fullText && (
        <details className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          <summary className="cursor-pointer underline">Show full analysis</summary>
          <p className="mt-2 whitespace-pre-wrap">{fullText}</p>
        </details>
      )}

      <div className="flex gap-4">
        <button
          onClick={onContinue}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          Continue to Branding →
        </button>
        <button
          onClick={onRestart}
          className="border border-gray-400 hover:border-gray-600 text-gray-800 dark:text-white font-medium py-2 px-4 rounded-lg transition"
        >
          🔁 Rethink Idea
        </button>
      </div>
    </div>
  );
}
