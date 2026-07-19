/**
 * The two durable ways to address an annotation across reads.
 *
 * `objectNumber` is the PDF indirect object number, returned by
 * `EPDFAnnot_GetObjectNumber(annotPtr)`. It is `> 0` for indirect objects
 * (the overwhelming common case) and `0` for direct objects (rare, legacy
 * PDFs). When the engine sees `0` it falls back to `nm` if present, or
 * promotes the annotation to a weak ref (`AnnotationRef.kind === 'index'`).
 *
 * `nm` is the value of the annotation's `/NM` entry. The v3 engine never
 * writes `/NM` on read — clients can opt into symbolic IDs by passing one to
 * `create()`, but reads never mutate the document.
 */
export type AnnotationStableId =
  | { kind: 'objectNumber'; value: number }
  | { kind: 'nm'; value: string };

/**
 * URL-safe encoding of a stable id, used by the cloud HTTP surface as the
 * `:annotKey` route parameter. Decoded by the server back into an
 * `AnnotationStableId` via `decodeStableIdKey`.
 *
 * Format:
 *   `{ kind: 'objectNumber', value: 42 }` -> `'obj:42'`
 *   `{ kind: 'nm', value: 'foo bar' }`    -> `'nm:foo bar'`
 *
 * The caller is responsible for `encodeURIComponent`-ing the result before
 * splicing it into a URL path; `wirePaths.layerAnnotationByKey` already does
 * that. /NM values are opaque strings and may contain anything; the
 * `nm:` prefix lets the decoder distinguish them from numeric ids
 * unambiguously.
 */
export function encodeStableIdKey(id: AnnotationStableId): string {
  if (id.kind === 'objectNumber') {
    if (!Number.isInteger(id.value) || id.value <= 0) {
      throw new RangeError(
        `encodeStableIdKey: objectNumber must be a positive integer, got ${id.value}`,
      );
    }
    return `obj:${id.value}`;
  }
  return `nm:${id.value}`;
}

/**
 * Inverse of `encodeStableIdKey`. Returns `null` for malformed input so
 * the server can answer 400 InvalidArg with a useful message instead of
 * throwing.
 *
 * The input is the already-`decodeURIComponent`-ed segment from the route
 * path. Empty `/NM` values are rejected: `nm:` with no suffix is not a
 * valid identity.
 */
export function decodeStableIdKey(key: string): AnnotationStableId | null {
  if (key.startsWith('obj:')) {
    const rest = key.slice('obj:'.length);
    const n = Number.parseInt(rest, 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== rest) return null;
    return { kind: 'objectNumber', value: n };
  }
  if (key.startsWith('nm:')) {
    const value = key.slice('nm:'.length);
    if (value.length === 0) return null;
    return { kind: 'nm', value };
  }
  return null;
}
