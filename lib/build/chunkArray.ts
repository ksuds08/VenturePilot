// lib/build/chunkArray.ts

/**
 * Split an array into fixed-size chunks.
 * - Keeps order.
 * - Ignores empty chunks.
 * - Throws if size < 1.
 */
export function chunkArray<T>(arr: T[], size: number): T[][] {
  if (!Array.isArray(arr)) return [];
  const n = Math.floor(size);
  if (n < 1) throw new Error("chunkArray: size must be >= 1");

  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) {
    const chunk = arr.slice(i, i + n);
    if (chunk.length) out.push(chunk);
  }
  return out;
}