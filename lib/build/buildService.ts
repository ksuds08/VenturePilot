import { commitToGitHub } from './commitToGitHub';
import { generateSimpleApp } from './generateSimpleApp';
import { createKvNamespace } from '../cloudflare/createKvNamespace';
import type { BuildPayload } from './types';

function isProbablyJSON(text: string): boolean {
  return typeof text === 'string' && (
    text.trim().startsWith('{') || text.trim().startsWith('[')
  );
}

function extractFallbackPlan(payload: BuildPayload): string {
  const raw =
    payload.plan ||
    payload.ideaSummary?.description ||
    '';

  if (!isProbablyJSON(raw) && raw.trim()) {
    return raw.trim();
  }

  const reversed = [...payload.messages].reverse();
  const lastAssistant = reversed.find(
    (m) => m.role === 'assistant' && !isProbablyJSON(m.content)
  );

  return lastAssistant?.content?.trim() || 'No plan provided';
}

export async function buildAndDeployApp(
  payload: BuildPayload & {
    files?: { path: string; content: string }[];
  },
  env: { CF_API_TOKEN: string; CF_ACCOUNT_ID: string }
) {
  const fallbackPlan = extractFallbackPlan(payload);
  const projectName = `mvp-${payload.ideaId}`;

  const kvTitle = `submissions-${projectName}-${Date.now()}`;
  const kvNamespaceId = await createKvNamespace({
    token: env.CF_API_TOKEN,
    accountId: env.CF_ACCOUNT_ID,
    title: kvTitle,
  });

  const files = payload.files
    ? Object.fromEntries(payload.files.map(f => [f.path, f.content]))
    : await generateSimpleApp(fallbackPlan, payload.branding, projectName, kvNamespaceId);

  const repoUrl = await commitToGitHub(payload.ideaId, files);

  return {
    pagesUrl: `https://${projectName}.promptpulse.workers.dev`,
    repoUrl,
    plan: fallbackPlan,
  };
}