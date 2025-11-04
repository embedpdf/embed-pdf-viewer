/**
 * Converts Svelte proxy objects to plain JavaScript objects.
 * This is useful when passing data to Web Workers or other contexts
 * that cannot handle Svelte's reactive proxies.
 */
export function deepToRaw<T extends Record<string, any>>(sourceObj: T): T {
  // Use structuredClone to strip Svelte proxies while preserving complex objects
  return structuredClone(sourceObj);
}
