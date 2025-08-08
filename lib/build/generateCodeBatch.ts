// lib/build/generateCodeBatch.ts

import { callGenerateCodeAPI } from './callGenerateCodeAPI';

export async function generateCodeBatch(
  filesToGenerate: { path: string; description: string }[],
  opts: {
    plan: any;
    alreadyGenerated: { path: string; content: string }[];
    env: Record<string, string | undefined>;
  }
) {
  const { plan, alreadyGenerated } = opts;
  return await callGenerateCodeAPI({
    plan,
    contextFiles: alreadyGenerated,
    targetFiles: filesToGenerate
  });
}