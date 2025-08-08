// Central truth for interfaces used across planner/batcher/build pipeline.

import { z } from "zod";

/** What the planner must return */
export const PlannerResultSchema = z.object({
  plan: z.string(),
  targetFiles: z.array(
    z.object({
      path: z.string(),
      description: z.string(),
    })
  ),
});
export type PlannerResult = z.infer<typeof PlannerResultSchema>;

/** What generateCodeBatch must receive as its second arg */
export const GenerateBatchOptionsSchema = z.object({
  plan: z.string(),
  alreadyGenerated: z.array(
    z.object({
      path: z.string(),
      content: z.string(),
    })
  ),
  env: z.record(z.string()),
});
export type GenerateBatchOptions = z.infer<typeof GenerateBatchOptionsSchema>;

/** What generateCodeBatch returns */
export const GeneratedFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});
export type GeneratedFile = z.infer<typeof GeneratedFileSchema>;
export const GeneratedFilesSchema = z.array(GeneratedFileSchema);

/** Runtime helpers (schema asserts) */
export function assertPlannerResult(value: unknown): asserts value is PlannerResult {
  PlannerResultSchema.parse(value);
}
export function assertGenerateBatchOptions(value: unknown): asserts value is GenerateBatchOptions {
  GenerateBatchOptionsSchema.parse(value);
}