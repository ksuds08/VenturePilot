// lib/build/planProjectFiles.ts

import OpenAI from "openai";
import type { BuildPayload } from "./types";

export async function planProjectFiles(payload: BuildPayload) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `
You are LaunchWing's AI project planner.
Plan all files for this project.
Return valid JSON:
{
  "sharedFiles": ["path1", "path2"],
  "files": [
    { "path": "src/index.js", "description": "Main entry point", "dependencies": ["src/App.js"] },
    ...
  ]
}

Project description:
${payload.plan || payload.ideaSummary?.description}
`;

  const resp = await client.chat.completions.create({
    model: process.env.PLANNER_MODEL || "gpt-4o-mini",
    messages: [
      { role: "system", content: "You output only JSON. No prose." },
      { role: "user", content: prompt }
    ],
    temperature: 0
  });

  return JSON.parse(resp.choices[0].message?.content || "{}");
}