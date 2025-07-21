import React from "react";

interface BrandingCardProps {
  name: string;
  tagline: string;
  colors: string[];
  logoDesc: string;
  onAccept: () => void;
  onRegenerate: () => void;
  onRestart: () => void;
}

export default function BrandingCard({
  name,
  tagline,
  colors,
  logoDesc,
  onAccept,
  onRegenerate,
  onRestart,
}: BrandingCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-6 shadow-md mt-6">
      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        🎨 Branding Package
      </h3>

      <p className="text-gray-800 dark:text-gray-300 mb-2">
        <strong>Name:</strong> {name}
      </p>
      <p className="text-gray-800 dark:text-gray-300 mb-2">
        <strong>Tagline:</strong> {tagline}
      </p>
      <p className="text-gray-800 dark:text-gray-300 mb-2">
        <strong>Logo Description:</strong> {logoDesc}
      </p>

      <div className="mt-4 mb-6">
        <p className="font-medium mb-1 text-gray-800 dark:text-gray-200">Brand Colors:</p>
        <div className="flex gap-3">
          {colors.map((color, idx) => (
            <div
              key={idx}
              className="w-8 h-8 rounded-full border shadow"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onAccept}
          className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          ✅ Use This Branding
        </button>
        <button
          onClick={onRegenerate}
          className="border border-blue-500 hover:border-blue-700 text-blue-700 font-medium py-2 px-4 rounded-lg transition"
        >
          🔁 Regenerate
        </button>
        <button
          onClick={onRestart}
          className="border border-gray-400 hover:border-gray-600 text-gray-800 dark:text-white font-medium py-2 px-4 rounded-lg transition"
        >
          🌀 Rethink Idea
        </button>
      </div>
    </div>
  );
}

