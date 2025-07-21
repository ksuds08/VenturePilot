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
    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-6 shadow-md mt-4">
      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        {name}
      </h3>
      <p className="text-gray-700 dark:text-gray-300 mb-4">{description}</p>
      <div className="flex gap-4">
        <button
          onClick={onConfirm}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          ✅ Confirm & Continue
        </button>
        <button
          onClick={onEdit}
          className="border border-gray-400 hover:border-gray-600 text-gray-800 dark:text-white font-medium py-2 px-4 rounded-lg transition"
        >
          ✏️ Edit Idea
        </button>
      </div>
    </div>
  );
}
