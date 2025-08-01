// utils/handleConfirmBuild.ts
import type { BrandingData } from "../types";

export default async function handleConfirmBuild(
  idea: any,
  setIdeas: React.Dispatch<React.SetStateAction<any[]>>,
  setDeployLogs: React.Dispatch<React.SetStateAction<string[]>>,
  sanitizeMessages: (msgs: any[]) => any[]
) {
  const { getMvpStream } = await import("../lib/api");

  const appendLog = (line: string) => {
    setIdeas((prev) =>
      prev.map((i) =>
        i.id !== idea.id
          ? i
          : {
              ...i,
              messages: [...(i.messages || []), { role: "assistant", content: line }],
            }
      )
    );
  };

  setDeployLogs([]);
  appendLog("🚀 Beginning MVP build and deployment...");

  try {
    await getMvpStream(
      idea.id,
      idea.takeaways?.branding as BrandingData,
      sanitizeMessages(idea.messages),
      (log) => appendLog(log),
      (data) => {
        const { pagesUrl, repoUrl, plan } = data || {};
        if (pagesUrl) {
          appendLog(
            `✅ Deployment successful!\n\n🔗 [Live Site](${pagesUrl})  \n📁 [GitHub Repo](${repoUrl || "https://github.com"})`
          );
          setIdeas((prev) =>
            prev.map((i) =>
              i.id !== idea.id
                ? i
                : {
                    ...i,
                    deploying: false,
                    deployed: true,
                    repoUrl: repoUrl || "",
                    pagesUrl,
                  }
            )
          );
        } else if (plan) {
          appendLog("✅ Here’s the MVP build plan:\n\n" + plan);
          setIdeas((prev) =>
            prev.map((i) =>
              i.id !== idea.id
                ? i
                : {
                    ...i,
                    deploying: false,
                    takeaways: {
                      ...i.takeaways,
                      finalPlan: plan,
                    },
                  }
            )
          );
        } else {
          appendLog("⚠️ Deployment completed but no URL or plan was returned.");
        }
      },
      (errMsg) => {
        appendLog(`❌ Deployment failed: ${errMsg}`);
      }
    );
  } catch (err: any) {
    appendLog(`❌ Deployment failed: ${err.message}`);
  }
}