// utils/sanitizeMessages.ts

/**
 * Helper to prepare messages before sending them to the backend. The
 * agent service expects each message to contain only a role and
 * textual content. Stripping out any additional properties (such as
 * `actions` or `imageUrl`) reduces payload size and prevents parsing
 * errors on the server.
 */
export function sanitizeMessages(msgs: any[]) {
  return msgs.map(({ role, content }) => ({ role, content }));
}