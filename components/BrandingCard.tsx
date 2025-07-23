import React from "react";

interface BrandingCardProps {
  name: string;
  tagline: string;
  colors: string[];
  logoDesc: string;
  logoUrl?: string; // ✅ Add this line
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
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg mt-6 max-w-3xl mx-auto">
      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
        🎨 Branding Ready
      </h3>
      <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">
        Here's the branding we generated for your startup:
      </p>

      <div className="space-y-2 mb-6">
        <p className="text-xl font-semibold text-slate-800 dark:text-white">Name:</p>
        <p className="text-slate-700 dark:text-slate-300">{name}</p>

        <p className="text-xl font-semibold text-slate-800 dark:text-white mt-4">Tagline:</p>
        <p className="text-slate-700 dark:text-slate-300">{tagline}</p>

        <p className="text-xl font-semibold text-slate-800 dark:text-white mt-4">Brand Colors:</p>
        <div className="flex gap-3 mt-1">
          {colors.map((color, i) => (
            <div
              key={i}
              className="w-10 h-10 rounded-full border border-slate-300"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>

        <p className="text-xl font-semibold text-slate-800 dark:text-white mt-4">Logo Description:</p>
        <p className="text-slate-700 dark:text-slate-300">{logoDesc}</p>
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          onClick={onAccept}
          className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:scale-105 transition-transform"
        >
          ✅ Accept & Build MVP
        </button>
        <button
          onClick={onRegenerate}
          className="border border-slate-400 text-slate-700 dark:text-white px-6 py-2 rounded-full font-medium hover:border-slate-600 hover:scale-105 transition-transform"
        >
          🔁 Regenerate Branding
        </button>
        <button
          onClick={onRestart}
          className="border border-red-400 text-red-600 dark:text-red-400 px-6 py-2 rounded-full font-medium hover:border-red-600 hover:scale-105 transition-transform"
        >
          🔄 Rethink Idea
        </button>
      </div>
    </div>
  );
}

