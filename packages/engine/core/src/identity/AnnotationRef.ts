import type { PageRef } from './PageRef';

/**
 * How callers address an annotation, and how the engine names one. Every
 * annotation has one name for life:
 *
 *   - `objectNumber`: an annotation born as a PDF object, in the uploaded
 *     file or written later. Object numbers are never reused.
 *   - `baseIndex`: an annotation born inline in the uploaded file (a
 *     dictionary in the page's `/Annots`, with no object number of its own).
 *     Its name is its position in that page's `/Annots` in the uploaded
 *     file, which never changes. It keeps this name after a write gives it
 *     an object number.
 *
 * An annotation's `/NM` is data, not a name: files can carry the same one
 * twice. A ref that names no annotation on its page fails with `NotFound`.
 */
export type AnnotationRef =
  | {
      kind: 'objectNumber';
      page: PageRef;
      objectNumber: number;
    }
  | {
      kind: 'baseIndex';
      page: PageRef;
      baseIndex: number;
    };

/**
 * URL-safe encoding of a ref without its page, used by the cloud HTTP
 * surface as the `:annotKey` route parameter beside `:pageKey`
 * (`encodePageKey`). Decoded by `decodeAnnotKey`.
 *
 *   `{ kind: 'objectNumber', objectNumber: 42 }` -> `'obj:42'`
 *   `{ kind: 'baseIndex', baseIndex: 2 }`        -> `'base:2'`
 */
export function encodeAnnotKey(ref: AnnotationRef): string {
  if (ref.kind === 'objectNumber') {
    if (!Number.isInteger(ref.objectNumber) || ref.objectNumber <= 0) {
      throw new RangeError(
        `encodeAnnotKey: objectNumber must be a positive integer, got ${ref.objectNumber}`,
      );
    }
    return `obj:${ref.objectNumber}`;
  }
  if (!Number.isInteger(ref.baseIndex) || ref.baseIndex < 0) {
    throw new RangeError(
      `encodeAnnotKey: baseIndex must be a non-negative integer, got ${ref.baseIndex}`,
    );
  }
  return `base:${ref.baseIndex}`;
}

/**
 * Inverse of `encodeAnnotKey`, on the page the route names. Returns `null`
 * for malformed input so the server can answer 400 InvalidArg with a useful
 * message instead of throwing. The input is the already-`decodeURIComponent`-ed
 * segment from the route path.
 */
export function decodeAnnotKey(page: PageRef, key: string): AnnotationRef | null {
  const number = (prefix: string, min: number): number | null => {
    if (!key.startsWith(prefix)) return null;
    const rest = key.slice(prefix.length);
    const n = Number.parseInt(rest, 10);
    return Number.isInteger(n) && n >= min && String(n) === rest ? n : null;
  };
  const objectNumber = number('obj:', 1);
  if (objectNumber !== null) return { kind: 'objectNumber', page, objectNumber };
  const baseIndex = number('base:', 0);
  if (baseIndex !== null) return { kind: 'baseIndex', page, baseIndex };
  return null;
}
