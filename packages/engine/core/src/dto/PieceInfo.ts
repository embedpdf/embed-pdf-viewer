/**
 * Page-piece metadata (ISO 32000 §14.5): private, application-scoped data
 * under `/PieceInfo` on a page or on the document catalog. The engine
 * round-trips a constrained, wire-safe value vocabulary; anything else in
 * the file is PRESERVED untouched and surfaced as `{ type: 'unknown' }`.
 *
 * Reads are lossless-tagged (a PDF name and a PDF string both arrive as
 * JS strings, so the tag is what keeps them distinguishable); writes take
 * plain JS values, with `{ name: '...' }` as the one wrapper needed to
 * request a PDF name. `/LastModified` bookkeeping (application dict, page
 * dict, doc /Info /ModDate) is engine-managed on every write.
 */

/** One `/Private` value as read from the file. */
export type PieceInfoEntry =
  | { type: 'string'; value: string }
  | { type: 'name'; value: string }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'string-array'; value: string[] }
  /** Present in the file but outside the supported vocabulary — preserved
   *  by writes to sibling keys, not readable through this API. */
  | { type: 'unknown' };

/** A write value: plain JS, `{ name }` requests a PDF name, `null` deletes. */
export type PieceInfoPatchValue = string | number | boolean | readonly string[] | { name: string };

export type PieceInfoPatch = Record<string, PieceInfoPatchValue | null>;

export interface PieceInfoSnapshot {
  /** The application's `/Private` entries, keyed by PDF key name. */
  entries: Record<string, PieceInfoEntry>;
  /** The application data dict's `/LastModified`, as ISO 8601 (null if absent). */
  lastModified: string | null;
}
