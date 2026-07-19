/**
 * Generic recursive flattener for nested option objects into dotted-key flat
 * maps, and its inverse. The wire format (token + query) is a flat key/value
 * shape, but SDK option types (e.g. `PageImageOptions`) are nested with
 * discriminated unions. Keeping these conversions generic means new options
 * never require bespoke encoder/decoder code — they're just shape changes to
 * the schema.
 *
 * Rules:
 *   - Nested object keys are joined with `.` (e.g. `viewport.kind`,
 *     `target.rect.left`).
 *   - `undefined` and `null` are dropped.
 *   - Arrays are not supported (the wire format has no list grammar yet).
 *   - Scalar leaves must be `string | number | boolean`.
 *   - Round-trip: `unflatten(flatten(x))` equals `x` modulo dropped
 *     `undefined`/`null` and array leaves.
 *
 * The path separator `.` is reserved in field names by the token codec, which
 * lets us distinguish wire-level structure from value content (values may
 * still contain `.` for decimals — values are not split on `.`).
 */

export type WireScalar = string | number | boolean;
export type WireFlat = Record<string, WireScalar>;

const PATH_SEPARATOR = '.';

export function flatten(value: unknown, prefix = ''): WireFlat {
  const out: WireFlat = {};
  flattenInto(value, prefix, out);
  return out;
}

function flattenInto(value: unknown, prefix: string, out: WireFlat): void {
  if (value === undefined || value === null) return;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    if (!prefix) throw new Error('flatten: root value must be an object, not a scalar');
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`flatten: non-finite number at "${prefix}"`);
    }
    out[prefix] = value;
    return;
  }
  if (Array.isArray(value)) {
    throw new Error(`flatten: arrays are not supported (at "${prefix || '<root>'}")`);
  }
  if (typeof value !== 'object') {
    throw new Error(`flatten: unsupported value type at "${prefix || '<root>'}"`);
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.includes(PATH_SEPARATOR)) {
      throw new Error(`flatten: object key "${k}" must not contain "${PATH_SEPARATOR}"`);
    }
    flattenInto(v, prefix ? `${prefix}${PATH_SEPARATOR}${k}` : k, out);
  }
}

/**
 * Inverse of `flatten`. Takes a flat string-or-scalar map and reconstructs a
 * nested object using `.` as the path separator. Values are passed through
 * unchanged — downstream schema validation (e.g. Zod with `.coerce`) is
 * responsible for type coercion from `string` to numbers/booleans when the
 * input came from a token or query string.
 *
 * Throws on conflicting paths (e.g. having both `viewport` and
 * `viewport.kind` in the same input).
 */
export function unflatten(flat: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (value === undefined) continue;
    if (key.length === 0) throw new Error('unflatten: empty key');
    if (key.startsWith(PATH_SEPARATOR) || key.endsWith(PATH_SEPARATOR)) {
      throw new Error(`unflatten: key "${key}" must not start or end with "${PATH_SEPARATOR}"`);
    }
    if (key.includes(`${PATH_SEPARATOR}${PATH_SEPARATOR}`)) {
      throw new Error(`unflatten: key "${key}" must not contain empty segments`);
    }
    const path = key.split(PATH_SEPARATOR);
    let cur: Record<string, unknown> = root;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const existing = cur[seg];
      if (existing === undefined) {
        const next: Record<string, unknown> = {};
        cur[seg] = next;
        cur = next;
        continue;
      }
      if (existing === null || typeof existing !== 'object' || Array.isArray(existing)) {
        throw new Error(
          `unflatten: conflicting paths at "${path.slice(0, i + 1).join(PATH_SEPARATOR)}"`,
        );
      }
      cur = existing as Record<string, unknown>;
    }
    const leaf = path[path.length - 1];
    if (cur[leaf] !== undefined) {
      throw new Error(`unflatten: duplicate key "${key}"`);
    }
    cur[leaf] = value;
  }
  return root;
}
