import { BuildPayload } from "./types";
import { createKvNamespace } from "./createKvNamespace";
import { commitToGitHub } from "./commitToGitHub";
import { generateSimpleApp } from "./generateSimpleApp";

export async function buildAndDeployApp(payload: BuildPayload) {
  const fallbackPlan =
    payload.plan || payload.ideaSummary?.description || "No plan provided";

  const projectName = `mvp-${payload.ideaId}`;
  const kvId = await createKvNamespace(projectName);
  const files = generateSimpleApp(fallbackPlan, payload.branding, projectName, kvId);
  const repoUrl = await commitToGitHub(payload.ideaId, files);

  return {
    pagesUrl: `https://${projectName}.promptpulse.workers.dev`,
    repoUrl,
    plan: fallbackPlan,
  };
}
