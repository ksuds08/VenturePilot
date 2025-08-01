// utils/sanitizeMessages.ts

/**
 * Prepares an array of message objects for API submission by stripping
 * out any extra properties and ensuring each message contains only
 * `role` and `content`. This helps avoid payload bloat or parser errors.
 */
export function sanitizeMessages(msgs: any[]) {
  return msgs.map(({ role, content }) => ({ role, content }));
}