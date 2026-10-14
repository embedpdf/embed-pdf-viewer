/**
 * Whether two plain values (JSON-like: primitives, arrays, plain objects) are
 * equal by value. Object keys compare as a set, whatever their order; a key
 * whose value is `undefined` counts as absent. Keys named in `ignore` are
 * left out at the top level.
 */
export function valuesEqual(a: unknown, b: unknown, ignore: ReadonlySet<string> = NONE): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((item, i) => valuesEqual(item, b[i]));
  }
  const left = presentKeys(a, ignore);
  const right = presentKeys(b, ignore);
  if (left.length !== right.length) return false;
  const record = (value: object) => value as Record<string, unknown>;
  return left.every((key) => right.includes(key) && valuesEqual(record(a)[key], record(b)[key]));
}

const NONE: ReadonlySet<string> = new Set();

function presentKeys(value: object, ignore: ReadonlySet<string>): string[] {
  return Object.entries(value)
    .filter(([key, entry]) => entry !== undefined && !ignore.has(key))
    .map(([key]) => key);
}
