/**
 * The keys whose values differ between two snapshots, removed keys included.
 * Both snapshots (the standard fields, the custom keys) hold only strings,
 * `null` and enums, so a shallow compare is exact.
 */
export function changedKeys<T extends object>(
  previous: T | null,
  next: T,
): readonly (keyof T & string)[] {
  const keys = Object.keys(next) as (keyof T & string)[];
  if (!previous) return keys;
  const all = new Set([...(Object.keys(previous) as (keyof T & string)[]), ...keys]);
  return [...all].filter((key) => previous[key] !== next[key]);
}
