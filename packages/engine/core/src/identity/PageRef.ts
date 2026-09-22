import type { PageObjectNumber } from './PageObjectNumber';
import { isValidPageObjectNumber } from './PageObjectNumber';

/**
 * How callers address a page — the page-plane sibling of `AnnotationRef`
 * and `FormFieldRef`.
 *
 * `objectNumber` is the indirect object number of the page dictionary.
 * ISO 32000-1 §7.7.3.3 requires every `/Kids` entry to be an indirect
 * reference, the layer runtime never renumbers (frozen base + incremental
 * deltas), and a deleted page's number is retired, never recycled — so it
 * is the durable identity for the lifetime of a document. It is what every
 * `PageLayout.ref` and `PageHandle.ref` carries.
 *
 * It is deliberately the only kind. Pages are durable by construction (see
 * `PagesMutator`): a display index is never an identity, a page without an
 * object number is refused at open (`MalformedPdf`), and a `/Names /Pages`
 * key is a registry entry the layout already maps to a number, not a second
 * identity the engine would ever return. The discriminated shape keeps the
 * address consistent with the other refs and leaves room for an additive
 * kind should a real one ever appear.
 *
 * Records that mention a page — `AnnotationRef.pageObjectNumber`, event
 * payloads, per-page results, destinations, search matches — keep the
 * scalar `pageObjectNumber` foreign key; `toPageRef()` turns one into an
 * address.
 */
export type PageRef = { kind: 'objectNumber'; pageObjectNumber: PageObjectNumber };

/** Build the address for a page from its object number. */
export function toPageRef(pageObjectNumber: PageObjectNumber): PageRef {
  return { kind: 'objectNumber', pageObjectNumber };
}

/** Structural equality for two page addresses. */
export function pageRefsEqual(a: PageRef, b: PageRef): boolean {
  return a.kind === b.kind && a.pageObjectNumber === b.pageObjectNumber;
}

/**
 * URL-safe encoding of a `PageRef`, used by the cloud HTTP surface as the
 * `:pageKey` route parameter. Mirrors `encodeStableIdKey` (`obj:42` /
 * `nm:…`) and `encodeFieldRefKey` (`obj:12` / `fqn:…`), so every identity
 * reads the same on the wire:
 *
 *   `{ kind: 'objectNumber', pageObjectNumber: 3 }` -> `'obj:3'`
 *
 * The caller is responsible for `encodeURIComponent`-ing the result before
 * splicing it into a URL path; the `wirePaths` builders already do that.
 */
export function encodePageKey(ref: PageRef): string {
  if (!isValidPageObjectNumber(ref.pageObjectNumber)) {
    throw new RangeError(
      `encodePageKey: pageObjectNumber must be a positive integer, got ${ref.pageObjectNumber}`,
    );
  }
  return `obj:${ref.pageObjectNumber}`;
}

/**
 * Inverse of `encodePageKey`. Returns `null` for malformed input so the
 * server can answer 400 InvalidArg with a useful message instead of
 * throwing. The input is the already-`decodeURIComponent`-ed segment from
 * the route path.
 */
export function decodePageKey(key: string): PageRef | null {
  if (!key.startsWith('obj:')) return null;
  const rest = key.slice('obj:'.length);
  const n = Number.parseInt(rest, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== rest) return null;
  return { kind: 'objectNumber', pageObjectNumber: n };
}
