import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import type { IdlePageCache } from './IdlePageCache';

/**
 * Manages pagePtr lifetime for a single open `DocumentSession`.
 *
 * `acquire(pon)` returns a loaded pagePtr for the given PDF object number,
 * loading it via `EPDFDoc_LoadPageByObjectNumberNormalized` (rotation forced
 * to 0deg so render/text/geometry/annotation coordinates all share one
 * normalized space) if not already in the pool. `release(pon)` decrements the
 * refcount; `closeAll()` is called by `DocumentSession.close()`.
 *
 * While at least one holder is active the pagePtr is shared (refcounted),
 * so overlapping `acquire(pon)` calls for the same page reuse a single
 * load. Once the refcount reaches zero the page goes to the runtime's
 * {@link IdlePageCache} when one is attached and it takes the page, and is
 * closed otherwise; `acquire` takes an idle page back before loading.
 */
export class PagePtrPool {
  private readonly counts = new Map<PageObjectNumber, { ptr: Ptr; refs: number }>();

  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly docPtr: Ptr,
    private readonly idle: IdlePageCache | null = null,
  ) {}

  acquire(pageObjectNumber: PageObjectNumber): Ptr {
    const { fn } = this.runtime;
    const existing = this.counts.get(pageObjectNumber);
    if (existing) {
      existing.refs++;
      return existing.ptr;
    }
    const kept = this.idle?.take(this, pageObjectNumber);
    if (kept) {
      this.counts.set(pageObjectNumber, { ptr: kept, refs: 1 });
      return kept;
    }
    this.idle?.beforeLoad();
    const ptr = fn.EPDFDoc_LoadPageByObjectNumberNormalized(this.docPtr, pageObjectNumber);
    if (!ptr) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no page with object number ${pageObjectNumber}`,
      );
    }
    this.counts.set(pageObjectNumber, { ptr, refs: 1 });
    return ptr;
  }

  /**
   * True while at least one holder has the page open; an idle page is not
   * held. Page-structure
   * mutations (delete) assert on this: thread confinement means no other
   * job can be mid-flight, so a held pagePtr during a structural mutation
   * is a leaked `acquire` (an internal bug) — the mutator fails loudly
   * instead of mutating under a live handle.
   */
  isHeld(pageObjectNumber: PageObjectNumber): boolean {
    return this.counts.has(pageObjectNumber);
  }

  release(pageObjectNumber: PageObjectNumber): void {
    const entry = this.counts.get(pageObjectNumber);
    if (!entry) return;
    entry.refs--;
    if (entry.refs <= 0) {
      this.counts.delete(pageObjectNumber);
      if (!this.idle?.park(this, pageObjectNumber, entry.ptr)) {
        this.runtime.fn.FPDF_ClosePage(entry.ptr);
      }
    }
  }

  closeAll(): void {
    const { fn } = this.runtime;
    for (const { ptr } of this.counts.values()) {
      fn.FPDF_ClosePage(ptr);
    }
    this.counts.clear();
    this.idle?.closeOwner(this);
  }
}
