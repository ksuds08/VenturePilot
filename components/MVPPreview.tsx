// MVPPreview.tsx

import React from "react";

interface MVPPreviewProps {
  ideaName: string;
  onDeploy: () => void;
  deploying?: boolean;
  deployedUrl?: string;
}

export default function MVPPreview({
  ideaName,
  onDeploy,
  deploying = false,
  deployedUrl,
}: MVPPreviewProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg mt-6 max-w-3xl mx-auto">
      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
        ⚙️ MVP Ready to Deploy
      </h3>
      <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">
        We’ve generated the MVP for{" "}
        <span className="font-semibold">{ideaName}</span>. Click below to deploy
        it as a live site.
      </p>

      {!deployedUrl ? (
        <button
          onClick={onDeploy}
          disabled={deploying}
          className={`bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 rounded-full shadow-md transition-transform ${
            deploying
              ? "opacity-50 cursor-not-allowed"
              : "hover:scale-105"
          }`}
          aria-busy={deploying}
          aria-disabled={deploying}
        >
          {deploying ? "🚀 Deploying..." : "🚀 Deploy MVP Now"}
        </button>
      ) : (
        <div className="mt-6">
          <p className="text-green-600 dark:text-green-400 font-medium mb-2">
            ✅ Deployment successful!
          </p>
          <a
            href={deployedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-blue-600 dark:text-blue-400 hover:underline break-all"
          >
            🔗 {deployedUrl}
          </a>
        </div>
      )}
    </div>
  );
}
