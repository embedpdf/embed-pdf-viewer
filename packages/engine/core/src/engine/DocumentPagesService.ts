import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { PdfRotation } from '../geometry/primitives';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import type { PageInsertBlankSpec } from '../mutation/PageInsertBlankInput';
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
   * `source` bytes. Gated by `doc.download` (it egresses content), not
   * `doc.pages.assemble`.
   *
   * REQUIRED-parity, delivered: the local engine runs it in the worker,
   * the cloud engine as POST /pages/extract.
   */
  extract(pageObjectNumbers: PageObjectNumber[]): AbortablePromise<Uint8Array>;

  /**
   * Insert every page of a standalone PDF (`bytes`) at `destIndex`
   * (omitted → append). The pages are COPIED in; the inserted copies get
   * fresh object numbers, returned in insertion order. Bytes are a call
   * ARGUMENT (the same law as annotation binaries): the local engine
   * transfers them to its worker, the cloud engine ships them as a
   * multipart mutation (POST /pages/insert).
   *
   * REQUIRED-parity, delivered — a cloud viewer must be able to add pages,
   * so this is a mandatory member: any engine implements it or is not a
   * conforming engine.
   */
  insert(bytes: Uint8Array | ArrayBuffer, destIndex?: number): AbortablePromise<PageInsertResult>;

  /**
   * Create `spec.count` (default 1) blank pages of `spec.size` (PDF points)
   * at `destIndex` (omitted → append). The blank-page sibling of `insert`:
   * same gate (`doc.pages.assemble`), same result shape, same
   * `pages.inserted` event — it is a separate verb because its wire is pure
   * parameters where `insert`'s is a binary payload (cloud: JSON
   * POST /pages/insert-blank). The new pages get fresh, never-recycled
   * object numbers; every pre-existing page keeps its identity and
   * revisions. Mandatory, like `insert`.
   */
  insertBlank(spec: PageInsertBlankSpec, destIndex?: number): AbortablePromise<PageInsertResult>;
}
