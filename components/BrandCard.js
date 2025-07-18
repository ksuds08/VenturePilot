import React from 'react';

const BrandCard = ({ name, tagline, colors, onCopy }) => (
  <div className="bg-white dark:bg-slate-800 shadow-md rounded-lg p-6 flex flex-col">
    <h2 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">{name}</h2>
    <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{tagline}</p>

    <div className="flex gap-2 mb-4">
      {colors.map((c) => (
        <div
          key={c}
          className="w-6 h-6 rounded border"
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
    </div>

    <button
      onClick={() => onCopy(name)}
      className="mt-auto bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 text-sm"
    >
      Copy Name
    </button>
  </div>
);

export default BrandCard;
