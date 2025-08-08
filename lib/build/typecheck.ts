// Compile-time + lightweight runtime self-test to ensure our modules agree.
// This file has zero Node globals and is safe in Workers/edge builds.

import type { PlannerResult, GenerateBatchOptions, GeneratedFile } from "./contracts";

// Import *types* from the actual modules to cross-check. These imports won’t run code.
import type { planProjectFiles as planProjectFilesFn } from "./planProjectFiles";
import type { generateCodeBatch as generateCodeBatchFn } from "./generateCodeBatch";

// ---- compile-time structural checks (will fail the build if shapes drift) ----

// Plan function must resolve to PlannerResult
type _PlanReturnCheck = Awaited<ReturnType<typeof planProjectFilesFn>> extends PlannerResult
  ? true
  : never;

// Batch function must accept GenerateBatchOptions and return GeneratedFile[]
// arg 2 is options
type _BatchParamCheck =
  Parameters<typeof generateCodeBatchFn>[1] extends GenerateBatchOptions ? true : never;
type _BatchReturnCheck =
  Awaited<ReturnType<typeof generateCodeBatchFn>> extends GeneratedFile[] ? true : never;

// If any of the above becomes `never`, TypeScript will error here.
export const __types_ok: _PlanReturnCheck & _BatchParamCheck & _BatchReturnCheck = true as const;

// ---- minimal runtime sanity (no-op cost) ----
export function runInterfaceSelfTest() {
  // Nothing to do at runtime — compile-time checks above are the main guard.
  // Keeping a callable so buildService can import & call (ensures file is included in build).
  return true as const;
}