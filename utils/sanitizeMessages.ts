// utils/sanitizeMessages.ts
export default function sanitizeMessages(msgs: any[]) {
  return msgs.map(({ role, content }) => ({ role, content }));
}