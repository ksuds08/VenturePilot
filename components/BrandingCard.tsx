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
      {logoUrl && (
        <div className="mb-4 text-center">
          <img
            src={logoUrl}
            alt="Generated Logo"
            className="mx-auto max-h-40 object-contain rounded-lg shadow-md"
          />
        </div>
      )}

      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
        {name}
      </h3>
      <p className="text-slate-700 dark:text-slate-300 text-lg mb-4">{tagline}</p>

      <div className="mb-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">Suggested Colors:</p>
        <div className="flex gap-2 mt-1">
          {colors?.map((color) => (
            <span
              key={color}
              className="w-6 h-6 rounded-full border border-slate-300"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      </div>

      <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
        <strong>Logo Concept:</strong> {logoDesc}
      </p>

      <div className="flex flex-wrap gap-4">
        <button
          onClick={onAccept}
          className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:scale-105 transition-transform"
        >
          ✅ Accept & Build
        </button>
        <button
          onClick={onRegenerate}
          className="border border-slate-400 text-slate-700 dark:text-white px-6 py-2 rounded-full font-medium hover:border-slate-600 hover:scale-105 transition-transform"
        >
          🔁 Regenerate Branding
        </button>
        <button
          onClick={onRestart}
          className="text-red-600 border border-red-500 px-6 py-2 rounded-full font-medium hover:scale-105 transition-transform"
        >
          🔄 Start Over
        </button>
      </div>
    </div>
  );
}
