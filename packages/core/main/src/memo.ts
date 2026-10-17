/**
 * Identity-stable reads. A capability read returns the same object until its
 * inputs change, so adapter selectors compare with `Object.is` and re-render
 * only when something really changed. These two helpers are how a plugin
 * builds such reads: name the inputs, and the result is recomputed only when
 * one of them is a different value.
 */

/** The inputs as `compute` receives them; inferred from `inputs()` only, never from `compute`. */
type Computed<Inputs extends readonly unknown[]> = { -readonly [K in keyof Inputs]: NoInfer<Inputs[K]> };

const sameInputs = (left: readonly unknown[], right: readonly unknown[]): boolean =>
  left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

/**
 * Recompute `compute(...inputs())` only when an input changes (compared with
 * `Object.is`, element by element); otherwise return the previous result.
 */
export function memo<const Inputs extends readonly unknown[], Result>(
  inputs: () => Inputs,
  compute: (...inputs: Computed<Inputs>) => Result,
): () => Result {
  let last: { inputs: Inputs; result: Result } | null = null;
  return () => {
    const next = inputs();
    if (last && sameInputs(last.inputs, next)) return last.result;
    const result = compute(...(next as unknown as Computed<Inputs>));
    last = { inputs: next, result };
    return result;
  };
}

/**
 * `memo` per key: each key keeps its own last inputs and result. Keys are
 * compared with `Map` semantics, so use primitives (a page object number, an
 * encoded key), not freshly built objects. `maxEntries` bounds the cache;
 * the oldest key is evicted first.
 */
export function memoByKey<Key, const Inputs extends readonly unknown[], Result>(
  inputs: (key: Key) => Inputs,
  compute: (key: Key, ...inputs: Computed<Inputs>) => Result,
  options: { maxEntries?: number } = {},
): (key: Key) => Result {
  const cache = new Map<Key, { inputs: Inputs; result: Result }>();
  return (key) => {
    const next = inputs(key);
    const cached = cache.get(key);
    if (cached && sameInputs(cached.inputs, next)) return cached.result;
    const result = compute(key, ...(next as unknown as Computed<Inputs>));
    if (cached) cache.delete(key);
    else if (options.maxEntries !== undefined && cache.size >= options.maxEntries) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, { inputs: next, result });
    return result;
  };
}
