// MVPPreview.tsx
import React from "react";

interface MVPPreviewProps {
  ideaName: string;
  onDeploy: () => Promise<void>;
  deploying?: boolean;
  deployedUrl?: string;
  deployError?: string;
  // New: array of progress messages emitted by the agent while building
  logs?: string[];
}

export default function MVPPreview({
  ideaName,
  onDeploy,
  deploying,
  deployedUrl,
  deployError,
  logs = [],
}: MVPPreviewProps) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg mt-6 max-w-3xl mx-auto">
      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
        ⚙️ MVP Ready to Deploy
      </h3>
      <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">
        We've generated the MVP for{" "}
        <span className="font-semibold">{ideaName}</span>. Click below to
        deploy it as a live site.
      </p>

      {!deployedUrl && (
        <div className="mt-4">
          {deploying ? (
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2">
                {/* Simple spinner */}
                <span className="inline-block h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  Deploying your MVP...
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                This may take a few minutes. Hang tight while we set up your site.
              </p>
              {/* Render progress messages, if any */}
              {logs.length > 0 && (
                <div className="mt-3 w-full rounded bg-gray-50 dark:bg-slate-800 p-2 text-left">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Build progress:
                  </p>
                  <ul className="list-disc pl-5 text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto">
                    {logs.map((log, i) => (
                      <li key={i}>{log}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onDeploy}
              disabled={deploying}
              className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:scale-105 transition-transform disabled:opacity-50"
            >
              Deploy MVP Now
            </button>
          )}
        </div>
      )}

      {deployedUrl && (
        <div className="mt-6">
          <p className="text-green-600 dark:text-green-400 font-medium mb-2">
            ✅ Deployment successful!
          </p>
          <a
            href={deployedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-blue-600 dark:text-blue-400 hover:underline break-words"
          >
            {deployedUrl}
          </a>
        </div>
      )}

      {deployError && (
        <div className="mt-6 text-red-600 dark:text-red-400">
          ❌ Deployment failed: {deployError}
        </div>
      )}
    </div>
  );
}