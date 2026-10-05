import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';

import { withScratch } from '../../runtime/memory/scratch';
import { peekU64 } from '../../runtime/memory/u64';
import { throwIfAborted } from '../../shared/abort';
import type { Slices } from '../../shared/slices';

/**
 * The parsed pages of every document on one runtime - one WASM heap, or one
 * server thread - kept within a budget of bytes.
 *
 * Parsing a page is the costly part of using it: seconds for a page of
 * millions of vector objects, where one tile of it renders in milliseconds.
 * So a page stays parsed after the job that used it, for the next one, as long
 * as memory allows:
 * - A page costs what its parse made (`EPDFPage_GetParsedSize`) and a fixed
 *   overhead for the page itself.
 * - Room is made before a page loads, for its size when it was last open, and
 *   again after every slice of a load, as the page grows. Pages close least
 *   recently used first. A page a job holds never closes, so one page may be
 *   over the budget on its own: the one a job needs.
 * - A render loads its page in slices, between which its job can be aborted.
 *   An aborted load is set aside half parsed, and the next job that needs the
 *   page goes on with it.
 * - A page whose content changed since it was parsed closes when it is next
 *   taken (`EPDFPage_IsContentCurrent`). That sees writes made in layer
 *   transactions; the worker host closes a document's pages around the writes
 *   that change content in place.
 * - A page's image cache is emptied when its last job releases it, so its next
 *   job renders images as a newly loaded page does.
 * - Pages no job uses close after a while, giving their memory back to the
 *   allocator.
 *
 * Pages belong to an owner, one per open document ({@link PagePtrPool}).
 */
export interface PageResidencyPolicy {
  /** Bytes of parsed pages kept at once; a page a job holds may be over it alone. */
  budgetBytes: number;
  /** Pages no job uses close after this many milliseconds; 0 disables the timer. */
  idleMs: number;
}

/**
 * 384 MB: what a server thread of the hosted plan can spare, and well inside
 * the heap a phone browser allows a tab (see the page-residency plan, D1).
 */
export const DEFAULT_PAGE_RESIDENCY_POLICY: PageResidencyPolicy = {
  budgetBytes: 384 * 1024 * 1024,
  idleMs: 30_000,
};

/** What a page costs besides its objects: the page itself and its caches. */
export const PAGE_OVERHEAD_BYTES = 64 * 1024;

/** `EPDF_PAGE_PARSED_SIZE`: 40 bytes on every platform, the bytes at 24. */
const PARSED_SIZE_BYTES = 40;
const PARSED_SIZE_ESTIMATED_BYTES_OFFSET = 24;

/** A budget that finishes any load in one call. */
const WHOLE_LOAD_MS = 0x3fffffff;

interface ResidentPage {
  readonly owner: object;
  readonly pageObjectNumber: PageObjectNumber;
  readonly ptr: Ptr;
  /** Jobs holding the page; it never closes while held. */
  refs: number;
  /** False while its parse goes on in slices. */
  loaded: boolean;
  /** What it costs, as last measured. */
  bytes: number;
  /** When it was last taken or released, for least-recently-used order. */
  lastUsed: number;
}

export class PageResidency {
  private readonly pages = new Map<object, Map<PageObjectNumber, ResidentPage>>();
  /** What each closed page cost when it was last open: the room its next load needs. */
  private readonly closedSizes = new Map<object, Map<PageObjectNumber, number>>();
  private totalBytes = 0;
  private clock = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly policy: PageResidencyPolicy = DEFAULT_PAGE_RESIDENCY_POLICY,
    /**
     * True while a job is between two of its steps, such as a page render
     * between slices, when nothing else may use PDFium: the idle timer then
     * waits another period instead of closing pages.
     */
    private readonly busy: () => boolean = () => false,
  ) {}

  /** The page, loaded in one go when it isn't parsed; held until {@link release}. */
  acquire(owner: object, docPtr: Ptr, pageObjectNumber: PageObjectNumber): Ptr {
    let page = this.take(owner, pageObjectNumber);
    if (!page) {
      this.makeRoom(this.expectedBytes(owner, pageObjectNumber));
      const ptr = this.runtime.fn.EPDFDoc_LoadPageByObjectNumberNormalized(
        docPtr,
        pageObjectNumber,
      );
      if (!ptr) throw noPage(pageObjectNumber);
      page = this.add(owner, pageObjectNumber, ptr, true);
    }
    page.refs++;
    if (!page.loaded) {
      if (this.runtime.fn.EPDFPage_ContinueLoad(page.ptr, WHOLE_LOAD_MS) !== 1) {
        this.drop(page);
        throw loadFailed(pageObjectNumber);
      }
      page.loaded = true;
    }
    this.measure(page);
    this.makeRoom(0);
    return page.ptr;
  }

  /**
   * The page, loaded in slices when it isn't parsed: between slices the
   * caller's thread receives messages, and an abort stops the load there. An
   * aborted load is set aside, to go on when a job next needs the page. Held
   * until {@link release}.
   */
  async acquireInSlices(
    owner: object,
    docPtr: Ptr,
    pageObjectNumber: PageObjectNumber,
    signal: AbortSignal,
    slices: Slices,
  ): Promise<Ptr> {
    throwIfAborted(signal);
    const { fn } = this.runtime;
    let page = this.take(owner, pageObjectNumber);
    if (!page) {
      this.makeRoom(this.expectedBytes(owner, pageObjectNumber));
      const ptr = fn.EPDFDoc_StartLoadPageByObjectNumber(docPtr, pageObjectNumber, true);
      if (!ptr) throw noPage(pageObjectNumber);
      page = this.add(owner, pageObjectNumber, ptr, false);
    }
    // Held while it loads, so making room never closes it.
    page.refs++;
    while (!page.loaded) {
      const result = fn.EPDFPage_ContinueLoad(page.ptr, slices.budgetMs);
      if (result < 0) {
        this.drop(page);
        throw loadFailed(pageObjectNumber);
      }
      page.loaded = result === 1;
      this.measure(page);
      this.makeRoom(0);
      if (page.loaded) break;
      try {
        await slices.between();
        throwIfAborted(signal);
      } catch (error) {
        this.release(owner, pageObjectNumber);
        throw error;
      }
    }
    return page.ptr;
  }

  /** A job is done with the page; it stays parsed while there is room. */
  release(owner: object, pageObjectNumber: PageObjectNumber): void {
    const page = this.pages.get(owner)?.get(pageObjectNumber);
    if (!page || page.refs <= 0) return;
    page.refs--;
    if (page.refs > 0) return;
    page.lastUsed = ++this.clock;
    // A page half loaded has drawn nothing yet. A page whose image cache
    // can't be emptied (a render of it is still open) can't be kept.
    if (page.loaded && !this.runtime.fn.EPDFPage_ResetRenderCache(page.ptr)) {
      this.close(page);
      return;
    }
    this.armTimer();
    this.makeRoom(0);
  }

  /** True while a job holds the page; an idle page is not held. */
  isHeld(owner: object, pageObjectNumber: PageObjectNumber): boolean {
    return (this.pages.get(owner)?.get(pageObjectNumber)?.refs ?? 0) > 0;
  }

  /** Closes every page of `owner`, held or not: its document closes. */
  closeOwner(owner: object): void {
    for (const page of [...(this.pages.get(owner)?.values() ?? [])]) this.close(page);
    this.pages.delete(owner);
    this.closedSizes.delete(owner);
  }

  /** Closes the pages of `owner` no job holds: a write changed its content in place. */
  closeIdleOf(owner: object): void {
    for (const page of [...(this.pages.get(owner)?.values() ?? [])]) {
      if (page.refs === 0) this.close(page);
    }
  }

  /** Closes every page no job holds. */
  closeIdle(): void {
    for (const owned of [...this.pages.values()]) {
      for (const page of [...owned.values()]) {
        if (page.refs === 0) this.close(page);
      }
    }
  }

  /** Pages kept, held or not (tests and diagnostics). */
  get size(): number {
    let count = 0;
    for (const owned of this.pages.values()) count += owned.size;
    return count;
  }

  /** What the pages kept cost, as last measured (tests and diagnostics). */
  get bytes(): number {
    return this.totalBytes;
  }

  /** The page when it is kept, unless its content changed meanwhile. */
  private take(owner: object, pageObjectNumber: PageObjectNumber): ResidentPage | null {
    const page = this.pages.get(owner)?.get(pageObjectNumber);
    if (!page) return null;
    if (page.refs === 0 && !this.runtime.fn.EPDFPage_IsContentCurrent(page.ptr)) {
      this.close(page);
      return null;
    }
    page.lastUsed = ++this.clock;
    return page;
  }

  private add(
    owner: object,
    pageObjectNumber: PageObjectNumber,
    ptr: Ptr,
    loaded: boolean,
  ): ResidentPage {
    const page: ResidentPage = {
      owner,
      pageObjectNumber,
      ptr,
      refs: 0,
      loaded,
      bytes: PAGE_OVERHEAD_BYTES,
      lastUsed: ++this.clock,
    };
    let owned = this.pages.get(owner);
    if (!owned) {
      owned = new Map();
      this.pages.set(owner, owned);
    }
    owned.set(pageObjectNumber, page);
    this.totalBytes += page.bytes;
    return page;
  }

  private measure(page: ResidentPage): void {
    const { fn, mem } = this.runtime;
    const parsed = withScratch(mem, PARSED_SIZE_BYTES, (size) =>
      fn.EPDFPage_GetParsedSize(page.ptr, size)
        ? peekU64(mem, size, PARSED_SIZE_ESTIMATED_BYTES_OFFSET)
        : 0,
    );
    const bytes = PAGE_OVERHEAD_BYTES + parsed;
    this.totalBytes += bytes - page.bytes;
    page.bytes = bytes;
  }

  private expectedBytes(owner: object, pageObjectNumber: PageObjectNumber): number {
    return this.closedSizes.get(owner)?.get(pageObjectNumber) ?? PAGE_OVERHEAD_BYTES;
  }

  /** Closes pages no job holds, least recently used first, until `incoming` more fits. */
  private makeRoom(incoming: number): void {
    while (this.totalBytes + incoming > this.policy.budgetBytes) {
      let victim: ResidentPage | null = null;
      for (const owned of this.pages.values()) {
        for (const page of owned.values()) {
          if (page.refs === 0 && (!victim || page.lastUsed < victim.lastUsed)) victim = page;
        }
      }
      if (!victim) return;
      this.close(victim);
    }
  }

  private close(page: ResidentPage): void {
    if (page.loaded) {
      let sizes = this.closedSizes.get(page.owner);
      if (!sizes) {
        sizes = new Map();
        this.closedSizes.set(page.owner, sizes);
      }
      sizes.set(page.pageObjectNumber, page.bytes);
    }
    this.drop(page);
  }

  /** Closes the page without remembering its size. */
  private drop(page: ResidentPage): void {
    this.runtime.fn.FPDF_ClosePage(page.ptr);
    const owned = this.pages.get(page.owner);
    owned?.delete(page.pageObjectNumber);
    if (owned?.size === 0) this.pages.delete(page.owner);
    this.totalBytes -= page.bytes;
    if (this.totalBytes <= 0) this.disarmTimer();
  }

  private armTimer(): void {
    if (this.policy.idleMs <= 0) return;
    this.disarmTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.busy()) this.armTimer();
      else this.closeIdle();
    }, this.policy.idleMs);
    // A Node worker thread must be able to exit while pages are idle.
    (this.timer as { unref?: () => void }).unref?.();
  }

  private disarmTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function noPage(pageObjectNumber: PageObjectNumber): EngineError {
  return new EngineError(
    EngineErrorCode.NotFound,
    `no page with object number ${pageObjectNumber}`,
  );
}

function loadFailed(pageObjectNumber: PageObjectNumber): EngineError {
  return new EngineError(
    EngineErrorCode.RuntimeUnavailable,
    `failed to load page object ${pageObjectNumber}`,
  );
}
