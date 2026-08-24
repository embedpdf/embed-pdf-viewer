import type { CharMapAnchor } from '../text/charmap';

/**
 * Per-page text snapshot returned by `PageHandle.text.read()` and over
 * the wire as the `GET …/text/pages/:pon/data@<contentVersion>` body.
 *
 * `text` is the full extracted page text in display order, UTF-16 faithful
 * (supplementary-plane characters are surrogate pairs, never dropped).
 *
 * `charCount` is the size of the page's CHARACTER space — PDFium's internal
 * character list, the same space geometry runs tile
 * (`PageGeometryRun.charStart`) and selection ranges live in. It is NOT the
 * length of `text`: a non-printing character occupies a character slot but
 * contributes zero text units, and a supplementary character contributes
 * two. `charMap` encodes exactly those deviations; absent/empty means the
 * two spaces are identical (`charCount === text.length`), which is the
 * common case and costs nothing on the wire. All translation goes through
 * the helpers in `text/charmap.ts` (`boundaryTextOffset`,
 * `charRangeForTextOffsets`, `sliceTextByChars`) — consumers never
 * interpret anchors directly, and the wire schema rejects maps that violate
 * the invariants documented there.
 *
 * This snapshot is pure content, addressed and cached by `contentVersion`.
 * It deliberately carries NO annotation liveness envelope (`PageState`):
 * the caller already knows the `pageObjectNumber` it requested, and
 * annotation `revision` / weak-state changes on a different cadence than
 * `contentVersion`, so baking liveness into this content-cached body would
 * be a stale-data hazard. Liveness lives on annotation reads instead.
 */
export interface PageTextSnapshot {
  text: string;
  charCount: number;
  /** Character→text anchors; absent/empty = identity. See `text/charmap.ts`. */
  charMap?: ReadonlyArray<CharMapAnchor>;
}
