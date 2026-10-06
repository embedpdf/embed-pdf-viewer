import {
  EngineError,
  EngineErrorCode,
  type PageDeleteResult,
  type PageMoveResult,
  type PageNameInput,
  type PageNameResult,
  type PageObjectNumber,
  type PageRef,
  type PdfCoordinates,
  type PageRemoveNameInput,
  type PageRotateResult,
  type PdfRotation,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { PagesReader } from './PagesReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { writeUtf16String } from '../../runtime/memory/strings';
import { throwIfAborted } from '../../shared/abort';

/**
 * Synchronous orchestrator for page-level reads and reorder mutations.
 * Lives next to `AnnotationMutator` (one orchestrator per
 * mutation domain) so both worker hosts (browser Web Worker and Node
 * `worker_thread`) share the same code path.
 *
 * Architectural anchor — locked with the user, do not loosen without
 * re-reading the doc comment on `PageMoveResult`:
 *
 *   - Pages are addressed by their durable `pageObjectNumber`, which must
 *     remain stable across every reorder permutation.
 *
 *   - The /Annots array of each page is untouched by `move()` (PDFium just
 *     rewrites pointer entries in the doc-level pages tree), so every
 *     annotation ref the caller is holding stays valid across a page
 *     reorder: shuffling pages must not silently break a pending
 *     highlight edit.
 */
export class PagesMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Reorder pages. Mirrors `FPDF_MovePages`: detach the supplied pages,
   * then re-insert them as a contiguous block at `toIndex` in the
   * post-removal index space, preserving caller order.
   *
   * Atomicity:
   *   - `FPDF_MovePages` rejects atomically: if it returns false, no
   *     change has happened. We surface that as `InvalidArg`.
   *   - On success we refresh the per-session page registry and read the
   *     new layout back, which is what the result returns.
   *
   * Validation done up front (the helper repeats these checks; we do
   * them here for clean error messages):
   *   - non-empty inputs;
   *   - duplicate `pageObjectNumber`s rejected;
   *   - every `pon` resolvable via the session's page registry;
   *   - `toIndex` in `[0, pageCount - len]`.
   */
  move(pages: PageRef[], toIndex: number, signal: AbortSignal): PageMoveResult<PdfCoordinates> {
    const pageObjectNumbers = this.session.resolvePageRefs(pages);
    throwIfAborted(signal);
    this.requireUniquePageObjectNumbers('pages.move', pageObjectNumbers);
    if (toIndex < 0 || !Number.isInteger(toIndex)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.move toIndex must be a non-negative integer (got ${toIndex})`,
      );
    }

    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const totalPages = fn.FPDF_GetPageCount(docPtr);
    const postRemoval = totalPages - pageObjectNumbers.length;
    if (toIndex > postRemoval) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.move toIndex ${toIndex} out of range; post-removal page count is ${postRemoval}`,
      );
    }

    // Resolve every pon to its current pageIndex via the session
    // registry. Bad pons throw `NotFound` from the session, which is
    // exactly what we want — the caller asked to move a page that does
    // not exist.
    const fromIndices = pageObjectNumbers.map((pageObjectNumber) => {
      throwIfAborted(signal);
      return this.session.recordByObjectNumber(pageObjectNumber).pageIndex;
    });

    // Marshal int[] and call the helper.
    const arrPtr = mem.alloc(4 * fromIndices.length);
    let ok: boolean;
    try {
      for (let i = 0; i < fromIndices.length; i++) {
        mem.poke(arrPtr, 'i32', fromIndices[i], 4 * i);
      }
      ok = fn.FPDF_MovePages(docPtr, arrPtr, fromIndices.length, toIndex);
    } finally {
      mem.free(arrPtr);
    }

    if (!ok) {
      // FPDF_MovePages validates atomically: a `false` return means no
      // change happened. Most likely cause is a contiguous-block
      // overlap our up-front checks did not catch — surface it cleanly.
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `FPDF_MovePages rejected the request (toIndex=${toIndex}, fromIndices=[${fromIndices.join(
          ',',
        )}])`,
      );
    }

    // Page positions changed; rebuild the index<->pon map.
    this.session.refreshPageRegistry();

    // A move returns geometry, not liveness: read the new layout off the
    // reordered session via the shared reader (identical output local +
    // cloud). `cache` is null — local engines have no manifest/CDN.
    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, meta: { affectedPages: [], cacheDelta: null } };
  }

  /**
   * Set the absolute display rotation of the supplied pages. Rotation is
   * presentation metadata over normalized content (pages always load with
   * rotation forced to 0 — see `PagePtrPool`), so:
   *   - no cached render, text run, or geometry coordinate changes;
   *   - per-page `RevisionToken`s do not bump;
   *   - page identity and order are untouched — no registry refresh.
   *
   * Atomicity: every page object number is resolved up front (`NotFound` on caller error),
   * so the apply loop below operates on validated pages only and each write
   * is absolute + idempotent — a retry after an unexpected mid-loop engine
   * fault converges to the requested state. Abort is honored before the
   * loop, never inside it.
   */
  rotate(
    pages: PageRef[],
    rotation: PdfRotation,
    signal: AbortSignal,
  ): PageRotateResult<PdfCoordinates> {
    const pageObjectNumbers = this.session.resolvePageRefs(pages);
    throwIfAborted(signal);
    this.requireUniquePageObjectNumbers('pages.rotate', pageObjectNumbers);
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.rotate rotation must be 0, 90, 180 or 270 (got ${rotation})`,
      );
    }

    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    for (const pageObjectNumber of pageObjectNumbers) {
      this.session.recordByObjectNumber(pageObjectNumber); // NotFound on unknown pon
    }

    // The EPDF helper takes quarter-turns (0..3); the wire speaks degrees.
    const quarterTurns = rotation / 90;
    for (const pageObjectNumber of pageObjectNumbers) {
      if (!fn.EPDFDoc_SetPageRotationByObjectNumber(docPtr, pageObjectNumber, quarterTurns)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFDoc_SetPageRotationByObjectNumber rejected page ${pageObjectNumber} after validation`,
        );
      }
    }

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, meta: { affectedPages: [], cacheDelta: null } };
  }

  /**
   * Delete pages. Deleted object numbers are retired — the engine nulls the
   * page object rather than freeing the number — so per-page state keyed by
   * page object number can never silently attach to an unrelated future
   * page. Surviving pages keep their identity, and their annotations their
   * names.
   *
   * Guards:
   *   - a document must keep at least one page (`InvalidArg`);
   *   - every page object number must resolve (`NotFound`);
   *   - no target page may have a live pooled `pagePtr`. Thread confinement
   *     means no other job can be mid-flight, so a held ptr here is a leaked
   *     `acquire` — an internal bug we surface loudly instead of deleting
   *     under a live handle.
   *
   * Abort is honored before the apply loop, never inside it.
   */
  delete(pages: PageRef[], signal: AbortSignal): PageDeleteResult<PdfCoordinates> {
    const pageObjectNumbers = this.session.resolvePageRefs(pages);
    throwIfAborted(signal);
    this.requireUniquePageObjectNumbers('pages.delete', pageObjectNumbers);

    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const totalPages = fn.FPDF_GetPageCount(docPtr);
    if (pageObjectNumbers.length >= totalPages) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.delete would remove every page (${pageObjectNumbers.length} of ${totalPages}); a document must keep at least one`,
      );
    }

    const pool = this.session.pagePool();
    for (const pageObjectNumber of pageObjectNumbers) {
      this.session.recordByObjectNumber(pageObjectNumber); // NotFound on unknown pon
      if (pool.isHeld(pageObjectNumber)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `internal invariant violation: pagePtr for page ${pageObjectNumber} is still held during pages.delete`,
        );
      }
    }

    for (const pageObjectNumber of pageObjectNumbers) {
      if (!fn.EPDFDoc_DeletePageByObjectNumber(docPtr, pageObjectNumber)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFDoc_DeletePageByObjectNumber rejected page ${pageObjectNumber} after validation`,
        );
      }
    }

    // Page count and order changed; rebuild the index<->pon map.
    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, meta: { affectedPages: [], cacheDelta: null } };
  }

  /**
   * Register `name` → page in `/Names /Pages` (create, or replace what the
   * key points at); with `replace`, drop that other key first — a rename as
   * one job. Named pages are layout: page identity and order are untouched
   * (no registry refresh) and the fresh snapshot is
   * returned like `move()`.
   */
  setName(input: PageNameInput, signal: AbortSignal): PageNameResult<PdfCoordinates> {
    throwIfAborted(signal);
    if (input.name.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'pages.setName requires a non-empty name');
    }
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const pageObjectNumber = this.session.resolvePageRef(input.page).pageObjectNumber; // NotFound on an unknown page

    if (input.replace !== undefined && input.replace !== input.name && input.replace.length > 0) {
      writeUtf16String(mem, input.replace, (ptr) => fn.EPDFDoc_RemoveNamedPage(docPtr, ptr));
    }
    const ok = writeUtf16String(mem, input.name, (ptr) =>
      fn.EPDFDoc_SetNamedPage(docPtr, ptr, pageObjectNumber),
    );
    if (!ok) {
      // The fork refuses only what we already validated (empty key, a page
      // outside the tree) — reaching here means the catalog is unwritable.
      throw new EngineError(
        EngineErrorCode.Unknown,
        `EPDFDoc_SetNamedPage rejected '${input.name}' for page ${pageObjectNumber}`,
      );
    }
    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, meta: { affectedPages: [], cacheDelta: null } };
  }

  /** Remove one `/Names /Pages` registration; the page stays. */
  removeName(input: PageRemoveNameInput, signal: AbortSignal): PageNameResult<PdfCoordinates> {
    throwIfAborted(signal);
    if (input.name.length === 0) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        'pages.removeName requires a non-empty name',
      );
    }
    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const removed = writeUtf16String(mem, input.name, (ptr) =>
      fn.EPDFDoc_RemoveNamedPage(docPtr, ptr),
    );
    if (!removed) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `pages.removeName: no /Names /Pages registration '${input.name}'`,
      );
    }
    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, meta: { affectedPages: [], cacheDelta: null } };
  }

  /** Shared input check: non-empty, no duplicate page object numbers. */
  private requireUniquePageObjectNumbers(op: string, pageObjectNumbers: PageObjectNumber[]): void {
    if (pageObjectNumbers.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, `${op} requires at least one page`);
    }
    const seen = new Set<PageObjectNumber>();
    for (const pageObjectNumber of pageObjectNumbers) {
      if (seen.has(pageObjectNumber)) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `${op} was given duplicate page object number ${pageObjectNumber}`,
        );
      }
      seen.add(pageObjectNumber);
    }
  }
}
