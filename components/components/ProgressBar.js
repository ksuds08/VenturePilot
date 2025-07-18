import React from 'react';

const ProgressBar = ({ step = 2, total = 4 }) => {
  const percentage = (step / total) * 100;
  return (
    <div className="mb-4">
      <div className="w-full bg-gray-200 dark:bg-slate-700 h-2 rounded-full">
        <div
          className="bg-indigo-600 h-2 rounded-full"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
        Step {step} of {total}
      </p>
    </div>
  );
};

export default ProgressBar;
