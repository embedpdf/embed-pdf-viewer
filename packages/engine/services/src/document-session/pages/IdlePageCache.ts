import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

/**
 * Loaded pages kept open between jobs, for every document on one runtime.
 *
 * Loading a page parses its whole content stream, which for a page of
 * millions of vector objects takes seconds, while one tile of it renders in a
 * fraction of that. A {@link PagePtrPool} hands a page it no longer holds to
 * this cache, and takes it back on the next acquire.
 *
 * Output stays byte-identical to loading the page again:
 * - a page is only kept when the job that released it is read-only (see
 *   {@link beginJob}); a page a mutation touched is closed and loads again;
 * - every other job closes all idle pages before it runs, so a change to the
 *   document can never meet a page parsed before it;
 * - a kept page's image cache is emptied (`EPDFPage_ResetRenderCache`), so its
 *   next job renders images as a newly loaded page does.
 *
 * One cache serves every session of the runtime, because they share one heap.
 * A page's size is unknown until it is parsed, so before a page that is not
 * cached is loaded, every heavy idle page is closed: at most one heavy page is
 * kept, and only while its document is the one being worked on.
 */
export interface IdlePageCachePolicy {
  /** A page with more page objects than this is heavy. */
  heavyObjects: number;
  /** The most light pages kept at once. */
  maxLightPages: number;
  /** Idle pages close after this many milliseconds without use; 0 disables the timer. */
  idleMs: number;
}

export const DEFAULT_IDLE_PAGE_POLICY: IdlePageCachePolicy = {
  heavyObjects: 100_000,
  maxLightPages: 8,
  idleMs: 30_000,
};

interface IdlePage {
  readonly owner: object;
  readonly pageObjectNumber: PageObjectNumber;
  readonly ptr: Ptr;
  readonly heavy: boolean;
}

export class IdlePageCache {
  /** Least recently released first. */
  private readonly pages: IdlePage[] = [];
  private admitting = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** False on a runtime without `EPDFPage_ResetRenderCache`: nothing is kept. */
  readonly enabled: boolean;

  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly policy: IdlePageCachePolicy = DEFAULT_IDLE_PAGE_POLICY,
  ) {
    this.enabled = typeof runtime.fn.EPDFPage_ResetRenderCache === 'function';
  }

  /**
   * Called before every job. A read-only job may reuse idle pages and leaves
   * the pages it releases here; any other job first closes every idle page,
   * and the pages it releases are closed.
   */
  beginJob(readOnly: boolean): void {
    this.admitting = this.enabled && readOnly;
    if (!readOnly) this.closeAll();
  }

  /**
   * Takes over a page its last holder released. Returns false when the caller
   * must close it instead.
   */
  park(owner: object, pageObjectNumber: PageObjectNumber, ptr: Ptr): boolean {
    if (!this.admitting) return false;
    const { fn } = this.runtime;
    if (!fn.EPDFPage_ResetRenderCache(ptr)) return false;
    const heavy = fn.FPDFPage_CountObjects(ptr) > this.policy.heavyObjects;
    this.pages.push({ owner, pageObjectNumber, ptr, heavy });
    this.trim();
    this.armTimer();
    return true;
  }

  /** Hands back the idle page `owner` left for this object number, or null. */
  take(owner: object, pageObjectNumber: PageObjectNumber): Ptr | null {
    const index = this.pages.findIndex(
      (page) => page.owner === owner && page.pageObjectNumber === pageObjectNumber,
    );
    if (index < 0) return null;
    const [page] = this.pages.splice(index, 1);
    return page.ptr;
  }

  /** Called before a page that is not cached is loaded; see the class comment. */
  beforeLoad(): void {
    this.closeWhere((page) => page.heavy);
  }

  closeOwner(owner: object): void {
    this.closeWhere((page) => page.owner === owner);
  }

  closeAll(): void {
    this.closeWhere(() => true);
  }

  /** Number of idle pages (tests and diagnostics). */
  get size(): number {
    return this.pages.length;
  }

  private trim(): void {
    let heavy = this.pages.filter((page) => page.heavy).length;
    let light = this.pages.length - heavy;
    for (const page of [...this.pages]) {
      if (page.heavy ? heavy > 1 : light > this.policy.maxLightPages) {
        this.closeWhere((candidate) => candidate === page);
        if (page.heavy) heavy--;
        else light--;
      }
    }
  }

  private closeWhere(predicate: (page: IdlePage) => boolean): void {
    for (let i = this.pages.length - 1; i >= 0; i--) {
      if (predicate(this.pages[i])) {
        const [page] = this.pages.splice(i, 1);
        this.runtime.fn.FPDF_ClosePage(page.ptr);
      }
    }
    if (this.pages.length === 0) this.disarmTimer();
  }

  private armTimer(): void {
    if (this.policy.idleMs <= 0) return;
    this.disarmTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.closeAll();
    }, this.policy.idleMs);
    // A Node worker thread must be able to exit while pages are idle.
    (this.timer as { unref?: () => void }).unref?.();
  }

  private disarmTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
