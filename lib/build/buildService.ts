// src/lib/build/buildService.ts
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

// ✅ Updated to accept env
export async function buildAndDeployApp(payload: BuildPayload, env: Env) {
  const fallbackPlan = extractFallbackPlan(payload);
  const projectName = `mvp-${payload.ideaId}`;

  // ✅ Use env instead of process.env
  const kvNamespaceId = await createKvNamespace({
    token: env.CLOUDFLARE_API_TOKEN,
    accountId: env.CLOUDFLARE_ACCOUNT_ID,
    title: 'SUBMISSIONS_KV',
  });

  const files = generateSimpleApp(
    fallbackPlan,
    payload.branding,
    projectName,
    kvNamespaceId
  );

  const repoUrl = await commitToGitHub(payload.ideaId, files);

  return {
    pagesUrl: `https://${projectName}.promptpulse.workers.dev`,
    repoUrl,
    plan: fallbackPlan,
  };
}