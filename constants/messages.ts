import type { VentureStage as StageType } from "../types";

/**
 * Initial greeting shown when a new chat idea is created. Moving this
 * out of the component prevents it from being recreated on every render
 * and centralises it for easier editing.
 */
export const GREETING =
  "Hi! I'm your AI cofounder. Let's build something together.\n\n" +
  "To start, tell me about the startup idea you're exploring — even if it's rough.";

/**
 * Defines the order in which ideas progress through the venture stages.  The
 * hook reads from this array to determine what the next stage should be
 * when advancing.  Should you wish to reorder or add stages in the
 * future, you only need to update this array.
 */
export const STAGE_ORDER: StageType[] = [
  "ideation",
  "validation",
  "branding",
  "mvp",
  "generatePlan",
];

/**
 * Human‑readable messages displayed during deployment of an MVP.
 * Messages are appended to the chat log to give users feedback on the
 * build process.
 */
export const DEPLOYMENT_STEPS = [
  "Planning project structure…",
  "Generating backend code…",
  "Generating frontend code…",
  "Packaging files…",
  "Deploying to Cloudflare Pages…",
];
