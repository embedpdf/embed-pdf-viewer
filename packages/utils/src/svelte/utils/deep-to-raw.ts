/**
 * Converts Svelte proxy objects to plain JavaScript objects.
 * This is useful when passing data to Web Workers or other contexts
 * that cannot handle Svelte's reactive proxies.
 *
 * Inspired by the Vue implementation, this recursively traverses the object
 * and handles primitives, arrays, and plain objects while stripping reactive proxies.
 */
export function deepToRaw<T extends Record<string, any>>(sourceObj: T): T {
  const objectIterator = (input: any): any => {
    // Handle null and undefined
    if (input === null || input === undefined) {
      return input;
    }

    // Handle primitives (string, number, boolean, bigint, symbol)
    if (typeof input !== 'object') {
      return input;
    }

    // Handle Arrays
    if (Array.isArray(input)) {
      return input.map((item) => objectIterator(item));
    }

    // Handle Date objects
    if (input instanceof Date) {
      return new Date(input.getTime());
    }

    // Handle RegExp
    if (input instanceof RegExp) {
      return new RegExp(input.source, input.flags);
    }

    // Handle plain objects (including Svelte proxies)
    // For Svelte proxies, we recursively extract plain values
    if (Object.prototype.toString.call(input) === '[object Object]') {
      return Object.keys(input).reduce((acc, key) => {
        // Skip non-enumerable properties and functions
        const value = input[key];
        if (typeof value !== 'function') {
          acc[key as keyof typeof acc] = objectIterator(value);
        }
        return acc;
      }, {} as T);
    }

    // For other object types (Map, Set, etc.), use JSON roundtrip as fallback
    // This will convert them to plain objects/arrays
    try {
      return JSON.parse(JSON.stringify(input));
    } catch {
      // If JSON serialization fails, return undefined
      return undefined;
    }
  };

  return objectIterator(sourceObj);
}
