import type { PageObjectNumber, WorkingSetPage } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { PageResidency } from './PageResidency';
import type { Slices } from '../../shared/slices';

/**
 * The pages of one open `DocumentSession`, kept by the runtime's
 * {@link PageResidency}.
 *
 * `acquire(pon)` returns the page with that PDF object number, loaded with
 * `EPDFDoc_LoadPageByObjectNumberNormalized` when it isn't kept (rotation
 * forced to 0deg, so render, text, geometry and annotation coordinates all
 * share one normalized space); `acquireInSlices` loads it in slices, for a
 * render. Overlapping acquires of one page share it; `release(pon)` hands it
 * back to the residency, which keeps it parsed while there is room.
 * `closeAll()` is called by `DocumentSession.close()`.
 *
 * A session made without a residency (a one-off render of a file) gets one
 * of its own that keeps nothing: its pages close when released.
 */
export class PagePtrPool {
  private readonly residency: PageResidency;

  constructor(
    runtime: PdfRuntimeModule,
    private readonly docPtr: Ptr,
    residency: PageResidency | null = null,
  ) {
    this.residency = residency ?? new PageResidency(runtime, { budgetBytes: 0, idleMs: 0 });
  }

  acquire(pageObjectNumber: PageObjectNumber): Ptr {
    return this.residency.acquire(this, this.docPtr, pageObjectNumber);
  }

  /** {@link acquire}, loading the page in slices between which `signal` can abort. */
  acquireInSlices(
    pageObjectNumber: PageObjectNumber,
    signal: AbortSignal,
    slices: Slices,
  ): Promise<Ptr> {
    return this.residency.acquireInSlices(this, this.docPtr, pageObjectNumber, signal, slices);
  }

  /**
   * True while at least one holder has the page open; a page the residency
   * keeps between jobs is not held. Page-structure mutations (delete) assert
   * on this: thread confinement means no other job can be mid-flight, so a
   * held pagePtr during a structural mutation is a leaked `acquire` (an
   * internal bug) - the mutator fails loudly instead of mutating under a live
   * handle.
   */
  isHeld(pageObjectNumber: PageObjectNumber): boolean {
    return this.residency.isHeld(this, pageObjectNumber);
  }

  /** True while the residency keeps the page, parsed or loading, held or not. */
  isKept(pageObjectNumber: PageObjectNumber): boolean {
    return this.residency.isKept(this, pageObjectNumber);
  }

  release(pageObjectNumber: PageObjectNumber): void {
    this.residency.release(this, pageObjectNumber);
  }

  /** What `view` shows of the document, replacing its last set (see {@link PageResidency}). */
  setWorkingSet(
    view: string,
    pages: Iterable<
      { pageObjectNumber: PageObjectNumber } & Pick<WorkingSetPage, 'role' | 'pixels'>
    >,
  ): void {
    this.residency.setWorkingSet(this, view, pages);
  }

  /** Closes the pages no job holds: a write changed the document's content in place. */
  closeIdle(): void {
    this.residency.closeIdleOf(this);
  }

  closeAll(): void {
    this.residency.closeOwner(this);
  }
}
