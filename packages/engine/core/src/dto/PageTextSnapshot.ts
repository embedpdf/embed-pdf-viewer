/**
 * Per-page text snapshot returned by `PageHandle.text.read()` and over
 * the wire as the `GET /v1/docs/:docId/pages/:pon/text@contentVersion=N` body.
 *
 * `text` is the full plain-text extraction of the page in display order
 * (UTF-16 → JS string). `charCount` is the PDFium-reported character
 * count and may differ from `text.length` when the page contains
 * astral-plane characters (PDFium counts UTF-16 code units, and JS
 * strings preserve them as surrogate pairs).
 *
 * This snapshot is pure content, addressed and cached by `contentVersion`.
 * It deliberately carries NO annotation liveness envelope (`PageState`):
 * the caller already knows the `pageObjectNumber` it requested, and
 * annotation `revision` / weak-state changes on a different cadence than
 * `contentVersion`, so baking liveness into this content-cached body would
 * be a stale-data hazard. Liveness lives on annotation reads instead.
 *
 * Future extensions (per-character bounding boxes, font runs, search
 * results, etc.) land on `PageTextService` as additional methods; the
 * snapshot shape stays stable so the wire URL and CDN cache remain
 * intact across SDK versions.
 */
export interface PageTextSnapshot {
  text: string;
  charCount: number;
}
