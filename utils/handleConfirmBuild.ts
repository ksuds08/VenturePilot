// utils/handleConfirmBuild.ts
export default function handleConfirmBuildFactory(
  updateIdea: (id: any, updates: any) => void,
  setDeployLogs: (logs: string[]) => void,
  getMvpStream: (
    ideaId: any,
    branding: any,
    messages: any[],
    onLog: (msg: string) => void,
    onDone: (result: { pagesUrl?: string; repoUrl?: string; plan?: string }) => void,
    onError: (err: string) => void
  ) => Promise<void>,
  sanitizeMessages: (msgs: any[]) => any[]
) {
  return async function handleConfirmBuild(current: any) {
    const logs: string[] = [];
    const onLog = (msg: string) => {
      logs.push(msg);
      setDeployLogs([...logs]);
    };

    const onDone = (result: { pagesUrl?: string; repoUrl?: string; plan?: string }) => {
      const update: any = {
        deployedUrl: result.pagesUrl || "",
        repoUrl: result.repoUrl || "",
      };
      if (result.plan) {
        update.finalPlan = result.plan;
      }
      updateIdea(current.id, update);
    };

    const onError = (err: string) => {
      logs.push(`❌ Deployment failed: ${err}`);
      setDeployLogs([...logs]);
    };

    try {
      const branding = current.takeaways?.branding || {};
      const sanitized = sanitizeMessages(current.messages);
      await getMvpStream(current.id, branding, sanitized, onLog, onDone, onError);
    } catch (err: any) {
      onError(err.message || "Unknown error");
    }
  };
}