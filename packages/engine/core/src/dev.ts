/**
 * Development-time warnings for engines: each fires once per key, says what
 * is wrong and what to do instead, and compiles out of production builds
 * ({@link isDev}).
 */

// Module-scoped so the check compiles without Node's ambient types; bundlers
// still see the literal `process.env.NODE_ENV` and replace it.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

const warned = new Set<string>();

/**
 * Whether this is a development build, as the app's bundler says: every bundler replaces
 * `process.env.NODE_ENV`, with `"production"` in a production build, so there this is `false`
 * and the warnings behind it compile out. A page with no bundler has no `process` at all, and
 * counts as development: the warnings help most while you try the package out.
 */
export function isDev(): boolean {
  try {
    return process?.env?.NODE_ENV !== 'production';
  } catch {
    return true;
  }
}

/** Warn once per key, the message as it is. No-op in production. */
export function devWarn(key: string, message: string): void {
  if (!isDev() || warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

/** Test seam: forget every warning so a suite can assert one fires again. */
export function resetDevWarnings(): void {
  warned.clear();
}
