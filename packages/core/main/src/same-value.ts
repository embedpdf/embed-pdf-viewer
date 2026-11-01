/** Values compared by what they hold: settings merges and the page view keep what didn't change. */

/** An object literal or a null-prototype object: not an array, a class instance or a date. */
export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const hasOwn = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

/** Equal by value: the same primitive or object, or arrays and plain objects with equal entries. */
export function sameValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => sameValue(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = Object.keys(left);
    return (
      keys.length === Object.keys(right).length &&
      keys.every((key) => hasOwn(right, key) && sameValue(left[key], right[key]))
    );
  }
  return false;
}
