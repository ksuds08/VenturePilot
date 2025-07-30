// SPDX-License-Identifier: MIT

/**
 * Handle POST requests to `/mvp`.  For this temporary diagnostic version,
 * we ignore the incoming request and return a fixed plan string.
 * This allows you to verify that the frontend will display the `plan` value.
 */
export async function mvpHandler(request, env) {
  // Allow only POST requests
  if (request.method.toUpperCase() !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // You can optionally validate the body here, but for this test we skip it.
  // Immediately return a hard‑coded plan to confirm the UI wiring.
  return new Response(
    JSON.stringify({
      plan:
        '✅ Hello from the Worker! If you’re seeing this, your UI is wired correctly.',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}