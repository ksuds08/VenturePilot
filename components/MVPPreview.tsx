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
  deploying,
  deployedUrl,
}: MVPPreviewProps) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl p-6 shadow-md mt-6">
      <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        🚀 MVP Preview
      </h3>

      <p className="text-gray-800 dark:text-gray-300 mb-4">
        This MVP will bring <strong>{ideaName}</strong> to life as a working prototype, deployed instantly to the web.
      </p>

      {deploying && (
        <div className="text-blue-600 dark:text-blue-300 font-medium mb-4">
          ⏳ Deploying your MVP… This may take 30–60 seconds.
        </div>
      )}

      {!deploying && !deployedUrl && (
        <button
          onClick={onDeploy}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition"
        >
          🚀 Deploy MVP Now
        </button>
      )}

      {deployedUrl && !deploying && (
        <div className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 p-3 rounded-lg">
          ✅ Deployed!{" "}
          <a
            href={deployedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            View Your MVP
          </a>
        </div>
      )}
    </div>
  );
}

