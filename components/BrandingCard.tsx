import React from "react";

interface BrandingCardProps {
  name: string;
  tagline: string;
  colors: string[];
  logoDesc: string;
  logoUrl?: string;
  onAccept: () => void;
  onRegenerate: () => void;
  onRestart: () => void;
}

export default function BrandingCard({
  name,
  tagline,
  colors,
  logoDesc,
  logoUrl,
  onAccept,
  onRegenerate,
  onRestart,
}: BrandingCardProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg mt-6 max-w-3xl mx-auto">
      <div className="text-center mb-6">
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Generated logo"
            className="w-32 h-32 object-contain mx-auto rounded-xl shadow mb-4"
          />
        )}
        <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white">
          {name}
        </h3>
        <p className="text-lg text-slate-600 dark:text-slate-300 mt-2">{tagline}</p>
      </div>

      <div className="mb-4">
        <h4 className="font-semibold text-slate-800 dark:text-white mb-1">Colors:</h4>
        <div className="flex gap-2">
          {colors.map((color, idx) => (
            <div
              key={idx}
              className="w-6 h-6 rounded-full border"
              style={{ backgroundColor: color }}
              title={color}
            ></div>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <h4 className="font-semibold text-slate-800 dark:text-white mb-1">Logo Concept:</h4>
        <p className="text-slate-700 dark:text-slate-300 text-sm">{logoDesc}</p>
      </div>

      <div className="flex flex-wrap gap-4 justify-center">
        <button
          onClick={onAccept}
          className="bg-blue-600 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:bg-blue-700 transition"
        >
          ✅ Accept & Build
        </button>
        <button
          onClick={onRegenerate}
          className="border border-slate-400 text-slate-700 dark:text-white px-6 py-2 rounded-full font-medium hover:border-slate-600 hover:scale-105 transition"
        >
          🔁 Regenerate
        </button>
        <button
          onClick={onRestart}
          className="text-red-600 dark:text-red-400 font-medium hover:underline"
        >
          🔙 Restart
        </button>
      </div>
    </div>
  );
}
