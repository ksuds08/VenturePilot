import { commitToGitHub } from './commitToGitHub';
import { generateSimpleApp } from './generateSimpleApp';
import { createKvNamespace } from '../cloudflare/createKvNamespace';
import { sanitizeGeneratedFiles } from './sanitizeGeneratedFiles';
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

  let files: Record<string, string>;

  if (payload.files) {
    const sanitized = sanitizeGeneratedFiles(payload.files);
    files = Object.fromEntries(sanitized.map(f => [f.path, f.content]));

    if (!files['wrangler.toml'] || !files['.github/workflows/deploy.yml']) {
      throw new Error('❌ Missing wrangler.toml or deploy.yml in generated files');
    }
  } else {
    // Fallback to static template
    files = await generateSimpleApp(fallbackPlan, payload.branding, projectName, kvNamespaceId);
  }

  const repoUrl = await commitToGitHub(payload.ideaId, files);

  return {
    pagesUrl: `https://${projectName}.promptpulse.workers.dev`,
    repoUrl,
    plan: fallbackPlan,
  };
}