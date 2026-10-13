/**
 * Development-time guardrails. Every warning fires once per process (keyed),
 * says what is wrong and what to do instead, and compiles out of production
 * builds ({@link isDev}).
 */
const warned = new Set<string>();

/**
 * Whether this is a development build, as the app's bundler says: every bundler replaces
 * `process.env.NODE_ENV`, with `"production"` in a production build, so there this is `false`
 * and the warnings behind it compile out. A page with no bundler has no `process` at all, and
 * counts as development: the warnings help most while you try the package out.
 */
export function isDev(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

/** Warn once per key. No-op in production. */
export function devWarn(key: string, message: string): void {
  if (!isDev() || warned.has(key)) return;
  warned.add(key);
  console.warn(`[embedpdf] ${message}`);
}

/** Test seam: forget every warning so a suite can assert one fires again. */
export function resetDevWarnings(): void {
  warned.clear();
}
