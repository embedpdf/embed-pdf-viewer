import {
  EngineError,
  EngineErrorCode,
  type PageDeleteResult,
  type PageMoveResult,
  type PageObjectNumber,
  type PageRotateResult,
  type PageRotation,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { PagesReader } from './PagesReader';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';

/**
 * Synchronous orchestrator for page-level reads and reorder mutations.
 * Lives next to `AnnotationMutator` (one orchestrator per
 * mutation domain) so both worker hosts (browser Web Worker and Node
 * `worker_thread`) share the same code path.
 *
 * Architectural anchor — locked with the user, do not loosen without
 * re-reading the doc comments on `PageMoveResult` and `RevisionAuthority`:
 *
 *   - Pages are addressed by their durable `pageObjectNumber`. There is
 *     no "weak page ref" model in the engine; therefore there is no
 *     document-level revision token, no `DocumentRevisionStore`, and no
 *     "doc-level shouldRefetch" semantic. Anything that *is* listed
 *     here must remain stable across every reorder permutation.
 *
 *   - Per-page `RevisionToken`s do NOT bump on `move()`. The /Annots
 *     array of each affected page is untouched (PDFium just rewrites
 *     pointer entries in the doc-level pages tree), so weak
 *     `AnnotationRef.kind === 'index'` references the caller is
 *     holding remain valid across a page reorder. This is the right
 *     semantic for an editing UI: shuffling pages must NOT silently
 *     break a pending highlight edit.
 *
 *   - Identity strengthening (the opportunistic `/NM` stamping that
 *     applies to weak annotations on `update()` / `move()`) is also
 *     intentionally absent here. Pages are durable by construction;
 *     there is nothing to upgrade.
 */
export class PagesMutator {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
  ) {}

  /**
   * Reorder pages. Mirrors `FPDF_MovePages`: detach the supplied pages,
   * then re-insert them as a contiguous block at `destIndex` in the
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
   *   - `destIndex` in `[0, pageCount - len]`.
   */
  move(
    pageObjectNumbers: PageObjectNumber[],
    destIndex: number,
    signal: AbortSignal,
  ): PageMoveResult {
    throwIfAborted(signal);
    this.requireUniquePons('pages.move', pageObjectNumbers);
    if (destIndex < 0 || !Number.isInteger(destIndex)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.move destIndex must be a non-negative integer (got ${destIndex})`,
      );
    }

    const { fn, mem } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    const totalPages = fn.FPDF_GetPageCount(docPtr);
    const postRemoval = totalPages - pageObjectNumbers.length;
    if (destIndex > postRemoval) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.move destIndex ${destIndex} out of range; post-removal page count is ${postRemoval}`,
      );
    }

    // Resolve every pon to its current pageIndex via the session
    // registry. Bad pons throw `NotFound` from the session, which is
    // exactly what we want — the caller asked to move a page that does
    // not exist.
    const fromIndices = pageObjectNumbers.map((pon) => {
      throwIfAborted(signal);
      return this.session.recordByObjectNumber(pon).pageIndex;
    });

    // Marshal int[] and call the helper.
    const arrPtr = mem.alloc(4 * fromIndices.length);
    let ok: boolean;
    try {
      for (let i = 0; i < fromIndices.length; i++) {
        mem.poke(arrPtr, 'i32', fromIndices[i], 4 * i);
      }
      ok = fn.FPDF_MovePages(docPtr, arrPtr, fromIndices.length, destIndex);
    } finally {
      mem.free(arrPtr);
    }

    if (!ok) {
      // FPDF_MovePages validates atomically: a `false` return means no
      // change happened. Most likely cause is a contiguous-block
      // overlap our up-front checks did not catch — surface it cleanly.
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `FPDF_MovePages rejected the request (destIndex=${destIndex}, fromIndices=[${fromIndices.join(
          ',',
        )}])`,
      );
    }

    // Page positions changed; rebuild the index<->pon map. Per-page
    // revisions and weak-flag bookkeeping survive — both keyed by pon,
    // both untouched by the reorder.
    this.session.refreshPageRegistry();

    // A move returns geometry, not liveness: read the new layout off the
    // reordered session via the shared reader (identical output local +
    // cloud). `cache` is null — local engines have no manifest/CDN.
    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, cache: null };
  }

  /**
   * Set the ABSOLUTE display rotation of the supplied pages. Rotation is
   * presentation metadata over normalized content (pages always load with
   * rotation forced to 0 — see `PagePtrPool`), so:
   *   - no cached render, text run, or geometry coordinate changes;
   *   - per-page `RevisionToken`s do NOT bump;
   *   - page identity and order are untouched — no registry refresh.
   *
   * Atomicity: every PON is resolved up front (`NotFound` on caller error),
   * so the apply loop below operates on validated pages only and each write
   * is absolute + idempotent — a retry after an unexpected mid-loop engine
   * fault converges to the requested state. Abort is honored BEFORE the
   * loop, never inside it.
   */
  rotate(
    pageObjectNumbers: PageObjectNumber[],
    rotation: PageRotation,
    signal: AbortSignal,
  ): PageRotateResult {
    throwIfAborted(signal);
    this.requireUniquePons('pages.rotate', pageObjectNumbers);
    if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `pages.rotate rotation must be 0, 90, 180 or 270 (got ${rotation})`,
      );
    }

    const { fn } = this.runtime;
    const docPtr = this.session.requireDocPtr();
    for (const pon of pageObjectNumbers) {
      this.session.recordByObjectNumber(pon); // NotFound on unknown pon
    }

    // The EPDF helper takes quarter-turns (0..3); the wire speaks degrees.
    const quarterTurns = rotation / 90;
    for (const pon of pageObjectNumbers) {
      if (!fn.EPDFDoc_SetPageRotationByObjectNumber(docPtr, pon, quarterTurns)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFDoc_SetPageRotationByObjectNumber rejected page ${pon} after validation`,
        );
      }
    }

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, cache: null };
  }

  /**
   * Delete pages. Deleted object numbers are RETIRED — the engine nulls the
   * page object rather than freeing the number — so per-page state keyed by
   * PON can never silently attach to an unrelated future page; we still drop
   * the session's revision/weak entries as hygiene. Surviving pages keep
   * their identity and `RevisionToken`s.
   *
   * Guards:
   *   - a document must keep at least one page (`InvalidArg`);
   *   - every PON must resolve (`NotFound`);
   *   - no target page may have a live pooled `pagePtr`. Thread confinement
   *     means no other job can be mid-flight, so a held ptr here is a leaked
   *     `acquire` — an internal bug we surface loudly instead of deleting
   *     under a live handle.
   *
   * Abort is honored BEFORE the apply loop, never inside it.
   */
  delete(pageObjectNumbers: PageObjectNumber[], signal: AbortSignal): PageDeleteResult {
    throwIfAborted(signal);
    this.requireUniquePons('pages.delete', pageObjectNumbers);

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
    for (const pon of pageObjectNumbers) {
      this.session.recordByObjectNumber(pon); // NotFound on unknown pon
      if (pool.isHeld(pon)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `internal invariant violation: pagePtr for page ${pon} is still held during pages.delete`,
        );
      }
    }

    for (const pon of pageObjectNumbers) {
      if (!fn.EPDFDoc_DeletePageByObjectNumber(docPtr, pon)) {
        throw new EngineError(
          EngineErrorCode.Unknown,
          `EPDFDoc_DeletePageByObjectNumber rejected page ${pon} after validation`,
        );
      }
      this.session.dropPageState(pon);
    }

    // Page count and order changed; rebuild the index<->pon map. Surviving
    // pages' revisions and weak-flag bookkeeping stay put (keyed by pon).
    this.session.refreshPageRegistry();

    const layout = new PagesReader(this.runtime, this.session).read(signal);
    return { layout, cache: null };
  }

  /** Shared input check: non-empty, no duplicate PONs. */
  private requireUniquePons(op: string, pageObjectNumbers: PageObjectNumber[]): void {
    if (pageObjectNumbers.length === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, `${op} requires at least one page`);
    }
    const seen = new Set<PageObjectNumber>();
    for (const pon of pageObjectNumbers) {
      if (seen.has(pon)) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `${op} was given duplicate page object number ${pon}`,
        );
      }
      seen.add(pon);
    }
  }
}
