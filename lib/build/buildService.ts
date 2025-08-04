import { commitToGitHub } from './commitToGitHub';
import { generateSimpleApp } from './generateSimpleApp';
import type { BuildPayload } from './types';

function isProbablyJSON(text: string): boolean {
  return typeof text === 'string' && (
    text.trim().startsWith('{') || text.trim().startsWith('[')
  );
}

export async function buildAndDeployApp(payload: BuildPayload) {
  const rawPlan =
    payload.plan || payload.ideaSummary?.description || '';

  const fallbackPlan = isProbablyJSON(rawPlan)
    ? 'No plan provided'
    : rawPlan;

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