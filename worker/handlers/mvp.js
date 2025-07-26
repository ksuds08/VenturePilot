// SPDX-License-Identifier: MIT
//
// Thin wrapper around the internal generate handler.  The original MVP
// generation logic lives in handlers/generate.js; this module simply
// forwards incoming requests to that route.  Splitting the heavy
// generation work into a separate handler makes it easier to offload
// long‑running tasks to a different service or Durable Object in the
// future without changing the public API.

import { generateHandler } from './generate.js';

/**
 * Thin wrapper around the internal generate handler.  The original MVP
 * generation logic lives in handlers/generate.js; this module simply
 * delegates to that function.  Splitting the heavy generation work into
 * a separate handler makes it easier to offload long‑running tasks to a
 * different service or Durable Object in the future.  In the current
 * implementation we call the function directly to avoid issues with
 * intra-worker fetches on custom domains.
 */
export async function mvpHandler(request, env) {
  // Simply invoke the generate handler directly instead of re-fetching
  return generateHandler(request, env);
}
