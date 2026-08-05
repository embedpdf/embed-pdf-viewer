import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PdfRotation } from '../geometry/primitives';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageMoveResult } from '../mutation/PageMoveResult';
import type { PageRotateResult } from '../mutation/PageRotateResult';
import type { PageFlattenResult, PageFlattenUsage } from '../mutation/PageFlattenResult';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Document-scoped page service exposed via `DocumentHandle.pages`.
 *
 * Mirrors the shape of `DocumentAnnotationsService` so that anything
 * touching "many things at the document level" lives in one place. The
 * structure verbs are `move`, `rotate`, and `delete`; the surface is
 * designed for `insert` to slot in without API churn.
 *
 * Identity rule: pages are addressed by indirect `pageObjectNumber`
 * everywhere except `list()`, which exposes display order through
 * `PageState.pageIndex`. There is no "weak page ref" model — structure
 * verbs therefore do not bump per-page revisions and do not invalidate
 * any in-flight annotation refs on surviving pages.
 */
export interface DocumentPagesService {
  /**
   * Snapshot of every page in display order. Cheap; never acquires a
   * `pagePtr`.
   */
  list(): AbortablePromise<PageListSnapshot>;

  /**
   * Reorder pages. The supplied pages are detached and re-inserted as
   * a contiguous block starting at `destIndex` in the post-removal
   * index space, preserving caller order. Per-page `RevisionToken`s
   * survive — index-based annotation refs the caller is holding remain
   * valid across a page reorder.
   *
   * @param pageObjectNumbers Pages to move, in the order they should
   *                          appear after the move.
   * @param destIndex Insertion point in `[0, pageCount - len]`.
   */
  move(pageObjectNumbers: PageObjectNumber[], destIndex: number): AbortablePromise<PageMoveResult>;

  /**
   * Set the ABSOLUTE display rotation of the supplied pages (one value
   * for all — the multi-select thumbnail gesture). Pure presentation
   * metadata: content coordinates are normalized, so cached renders,
   * annotation refs, and `RevisionToken`s all survive untouched. See
   * `PageRotateInput` for why the wire is absolute, never relative.
   */
  rotate(
    pageObjectNumbers: PageObjectNumber[],
    rotation: PdfRotation,
  ): AbortablePromise<PageRotateResult>;

  /**
   * Delete pages. Deleting every page is rejected (`InvalidArg`) — a
   * document must keep at least one. Deleted PONs are retired, never
   * recycled; surviving pages keep their identity and revisions.
   */
  delete(pageObjectNumbers: PageObjectNumber[]): AbortablePromise<PageDeleteResult>;

  /**
   * Paint eligible annotation appearances into page content and remove only
   * those annotations that were painted. This changes content and annotation
   * liveness, not layout. The default usage is normal display.
   */
  flatten?(
    pageObjectNumbers: PageObjectNumber[],
    usage?: PageFlattenUsage,
  ): AbortablePromise<PageFlattenResult>;

  /**
   * Export the given pages, in the supplied order, as a standalone PDF
   * (bytes of a new document containing copies of those pages). A READ:
   * the source document is untouched — no revisions bump, no event is
   * published. This is how a page becomes a portable asset (a vector
   * stamp, a signature) that re-enters a document as a stamp draft's
   * `source` bytes.
   *
   * Optional while the cloud endpoint ships (the `downloadLayer?`
   * pattern): the local engine implements it; the cloud engine omits it
   * until the server exposes extraction. Feature-detect with
   * `pages.extract !== undefined`.
   */
  extract?(pageObjectNumbers: PageObjectNumber[]): AbortablePromise<Uint8Array>;

  /**
   * Insert every page of a standalone PDF (`bytes`) at `destIndex`
   * (omitted → append). The pages are COPIED in; the inserted copies get
   * fresh object numbers, returned in insertion order. Bytes are a call
   * ARGUMENT (the same law as annotation binaries): the local engine
   * transfers them to its worker, the cloud engine will ship them as a
   * multipart mutation.
   *
   * Slated REQUIRED-parity (a cloud viewer must be able to add pages);
   * optional only until the server endpoint ships — feature-detect with
   * `pages.insert !== undefined`.
   */
  insert?(bytes: Uint8Array | ArrayBuffer, destIndex?: number): AbortablePromise<PageInsertResult>;
}
