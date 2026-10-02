/**
 * Development-time guardrails. Every warning fires once per process (keyed), says what is wrong
 * and what to do instead, and compiles out of production builds (`process.env.NODE_ENV`, which
 * bundlers replace).
 */
const warned = new Set<string>();

export const isDev = (): boolean =>
  typeof process === 'undefined' || process.env.NODE_ENV !== 'production';

/** Warn once per key. No-op in production. */
export function devWarn(key: string, message: string): void {
  if (!isDev() || warned.has(key)) return;
  warned.add(key);
  console.warn(`[embedpdf] ${message}`);
}

/** Forget every warning, so a test can assert one fires again. */
export function resetDevWarnings(): void {
  warned.clear();
}
