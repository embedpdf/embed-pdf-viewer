/**
 * The two shapes a reader returns, and the derived value both are made of.
 *
 * - One value is `{ current }`, like Svelte's own `MediaQuery`: `pages.current`.
 * - A record of named values (a plugin's state, its settings) is a reactive object whose fields
 *   are getters: `state.zoomLevel`. Each field is its own `$derived`, so a template or an effect
 *   that reads `zoomLevel` runs again only when `zoomLevel` changes.
 */

/** A value that changes: read `current` in a template, a `$derived` or an effect. */
export interface CurrentValue<T> {
  readonly current: T;
}

/** An argument that may change: the value, or a function that returns it (`() => note.ref`). */
export type MaybeGetter<T> = T | (() => T);

/** The value of a {@link MaybeGetter}. Only for values that are never functions themselves. */
export function valueOf<T>(value: MaybeGetter<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

/**
 * A `$derived` that keeps its last value while `isEqual` says the new one is the same, so a value
 * built fresh on every read (an object a selector returns) passes nothing on until a field changes.
 */
export function derivedValue<T>(
  compute: () => T,
  isEqual: (left: T, right: T) => boolean = Object.is,
): () => T {
  let last: { value: T } | null = null;
  const value = $derived.by(() => {
    const next = compute();
    if (last !== null && isEqual(last.value, next)) return last.value;
    last = { value: next };
    return next;
  });
  return () => value;
}

/** `{ current }` over a getter. */
export function currentOf<T>(read: () => T): CurrentValue<T> {
  return {
    get current() {
      return read();
    },
  };
}

/** One field of a record, as its own `$derived`: it passes a change on only when the field changed. */
function fieldOf<Record extends object, Key extends keyof Record>(
  whole: () => Record,
  key: Key,
): () => Record[Key] {
  const field = $derived(whole()[key]);
  return () => field;
}

/**
 * A reactive object with `keys` as getters over `whole()`, each its own derived value. The keys
 * are fixed when it is made: a declared state's `empty`, or the settings it starts with.
 */
export function reactiveRecord<Record extends object>(
  whole: () => Record,
  keys: readonly (keyof Record)[],
): Readonly<Record> {
  const record = {} as Record;
  for (const key of keys) {
    Object.defineProperty(record, key, { get: fieldOf(whole, key), enumerable: true });
  }
  return record;
}
