import React from "react";

interface RefinedIdeaCardProps {
  name: string;
  description: string;
  onConfirm: () => void;
  onEdit: () => void;
}

export default function RefinedIdeaCard({
  name,
  description,
  onConfirm,
  onEdit,
}: RefinedIdeaCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg mt-6 max-w-3xl mx-auto">
      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-4">
        {name}
      </h3>
      <p className="text-slate-700 dark:text-slate-300 text-lg mb-6 whitespace-pre-wrap">
        {description}
      </p>
      <div className="flex flex-wrap gap-4">
        <button
          onClick={onConfirm}
          className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:scale-105 transition-transform"
        >
          ✅ Confirm & Continue
        </button>
        <button
          onClick={onEdit}
          className="border border-slate-400 text-slate-700 dark:text-white px-6 py-2 rounded-full font-medium hover:border-slate-600 hover:scale-105 transition-transform"
        >
          ✏️ Edit Idea
        </button>
      </div>
    </div>
  );
}

