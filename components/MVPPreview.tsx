// MVPPreview.tsx

import React, { useState } from "react";

interface MVPPreviewProps {
  ideaName: string;
  ideaId: string;
  branding: any;
  plan: any;
  onDeploymentComplete: (result: { repoUrl: string; pagesUrl: string }) => void;
}

export default function MVPPreview({
  ideaName,
  ideaId,
  branding,
  plan,
  onDeploymentComplete,
}: MVPPreviewProps) {
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState("");

  const handleDeploy = async () => {
    setDeploying(true);
    setError("");

    try {
      const res = await fetch("https://venturepilot-api.promptpulse.workers.dev/mvp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: ideaName,
          ideaId,
          branding,
          plan,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.pagesUrl) {
        setError(data?.error || "Deployment failed");
        setDeploying(false);
        return;
      }

      onDeploymentComplete({
        repoUrl: data.repoUrl,
        pagesUrl: data.pagesUrl,
      });

      setDeploying(false);
    } catch (err: any) {
      console.error("Deployment error:", err);
      setError("An unexpected error occurred.");
      setDeploying(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-lg mt-6 max-w-3xl mx-auto">
      <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-2">
        ⚙️ MVP Ready to Deploy
      </h3>
      <p className="text-lg text-slate-700 dark:text-slate-300 mb-4">
        We've generated the MVP for <span className="font-semibold">{ideaName}</span>. Click below to deploy it as a live site.
      </p>

      <button
        onClick={handleDeploy}
        disabled={deploying}
        className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-6 py-2 rounded-full shadow-md hover:scale-105 transition-transform disabled:opacity-50"
      >
        {deploying ? "Deploying..." : "🚀 Deploy MVP Now"}
      </button>

      {error && (
        <p className="text-red-500 mt-4 font-medium">
          ❌ {error}
        </p>
      )}
    </div>
  );
}
