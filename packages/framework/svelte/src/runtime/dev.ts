/**
 * Development-time guardrails. Every warning fires once per process (keyed), says what is wrong
 * and what to do instead, and compiles out of production builds ({@link isDev}).
 */
import { DEV } from 'esm-env';

const warned = new Set<string>();

/**
 * Whether this is a development build: `DEV` from `esm-env`, as Svelte and SvelteKit read it.
 * The app's bundler picks it by its `development` or `production` condition, so in a production
 * build this is `false` and the warnings behind it compile out.
 */
export const isDev = (): boolean => DEV;

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
