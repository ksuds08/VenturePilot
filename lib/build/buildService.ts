import { commitToGitHub } from './commitToGitHub';
import { generateSimpleApp } from './generateSimpleApp';
import type { BuildPayload } from './types';

export async function buildAndDeployApp(payload: BuildPayload) {
  const fallbackPlan =
    payload.plan || payload.ideaSummary?.description || 'No plan provided';

  const projectName = `mvp-${payload.ideaId}`;
  const files = generateSimpleApp(
    fallbackPlan,
    payload.branding,
    projectName
  );

  const repoUrl = await commitToGitHub(payload.ideaId, files);

  return {
    pagesUrl: `https://${projectName}.promptpulse.workers.dev`,
    repoUrl,
    plan: fallbackPlan,
  };
}
