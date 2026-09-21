/**
 * Development-mode switch for checks that are worth their cost while
 * developing (undeclared dependency resolution, frozen snapshots) and free
 * in production. Bundlers replace `process.env.NODE_ENV`; a plain browser
 * without one reports production, so the checks never throw in a page
 * that has no build step.
 */
// Module-scoped so the check compiles without Node's ambient types; bundlers
// still see the literal `process.env.NODE_ENV` and replace it.
declare const process: { env?: { NODE_ENV?: string } } | undefined;

export function isDev(): boolean {
  try {
    return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}
