import { WrappedPdfiumModule } from '@embedpdf/pdfium';
import { MemoryManager } from './core/memory-manager';
import { WasmPointer } from './types/branded';

export interface CacheConfig {
  /** Time-to-live for pages in milliseconds (default: 5000ms) */
  pageTtl?: number;
  /** Maximum number of pages to keep in cache per document (default: 50) */
  maxPagesPerDocument?: number;
}

const DEFAULT_CONFIG: Required<CacheConfig> = {
  pageTtl: 5000, // 5 seconds
  maxPagesPerDocument: 10,
};

export class PdfCache {
  private readonly docs = new Map<string, DocumentContext>();
  private readonly config: Required<CacheConfig>;

  constructor(
    private readonly pdfium: WrappedPdfiumModule,
    private readonly memoryManager: MemoryManager,
    config: CacheConfig = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Open (or re-use) a document */
  setDocument(id: string, filePtr: number, docPtr: number) {
    let ctx = this.docs.get(id);
    if (!ctx) {
      ctx = new DocumentContext(filePtr, docPtr, this.pdfium, this.memoryManager, this.config);
      this.docs.set(id, ctx);
    }
  }

  /** Retrieve the DocumentContext for a given PdfDocumentObject */
  getContext(docId: string): DocumentContext | undefined {
    return this.docs.get(docId);
  }

  /** Close & fully release a document and all its pages */
  closeDocument(docId: string): boolean {
    const ctx = this.docs.get(docId);
    if (!ctx) return false;
    ctx.dispose(); // tears down pages first, then FPDF_CloseDocument, free()
    this.docs.delete(docId);
    return true;
  }

  /** Close all documents */
  closeAllDocuments(): void {
    for (const ctx of this.docs.values()) {
      ctx.dispose();
    }
    this.docs.clear();
  }

  /** Update cache configuration for all existing documents */
  updateConfig(newConfig: CacheConfig): void {
    Object.assign(this.config, newConfig);
    // Update config for all existing document contexts
    for (const ctx of this.docs.values()) {
      ctx.updateConfig(this.config);
    }
  }

  /** Get current cache statistics */
  getCacheStats(): {
    documents: number;
    totalPages: number;
    pagesByDocument: Record<string, number>;
  } {
    const pagesByDocument: Record<string, number> = {};
    let totalPages = 0;

    for (const [docId, ctx] of this.docs.entries()) {
      const pageCount = ctx.getCacheSize();
      pagesByDocument[docId] = pageCount;
      totalPages += pageCount;
    }

    return {
      documents: this.docs.size,
      totalPages,
      pagesByDocument,
    };
  }
}

export class DocumentContext {
  private readonly pageCache: PageCache;

  constructor(
    public readonly filePtr: number,
    public readonly docPtr: number,
    pdfium: WrappedPdfiumModule,
    private readonly memoryManager: MemoryManager,
    config: Required<CacheConfig>,
  ) {
    this.pageCache = new PageCache(pdfium, docPtr, config);
  }

  /** Main accessor for pages */
  acquirePage(pageIdx: number): PageContext {
    return this.pageCache.acquire(pageIdx);
  }

  /** Scoped accessor for one-off / bulk operations */
  borrowPage<T>(pageIdx: number, fn: (ctx: PageContext) => T): T {
    return this.pageCache.borrowPage(pageIdx, fn);
  }

  /** Update cache configuration */
  updateConfig(config: Required<CacheConfig>): void {
    this.pageCache.updateConfig(config);
  }

  /** Get number of pages currently in cache */
  getCacheSize(): number {
    return this.pageCache.size();
  }

  /** Tear down all pages + this document */
  dispose(): void {
    // 1️⃣ release all pages (with their TTL or immediate)
    this.pageCache.forceReleaseAll();

    // 2️⃣ close the PDFium document
    this.pageCache.pdf.FPDF_CloseDocument(this.docPtr);

    // 3️⃣ free the file handle through memory manager for proper tracking
    this.memoryManager.free(WasmPointer(this.filePtr));
  }
}

export class PageCache {
  private readonly cache = new Map<number, PageContext>();
  private readonly accessOrder: number[] = []; // LRU tracking
  private config: Required<CacheConfig>;

  constructor(
    public readonly pdf: WrappedPdfiumModule,
    private readonly docPtr: number,
    config: Required<CacheConfig>,
  ) {
    this.config = config;
  }

  acquire(pageIdx: number): PageContext {
    let ctx = this.cache.get(pageIdx);

    if (!ctx) {
      // Ensure we don't exceed max cache size
      this.evictIfNeeded();

      const pagePtr = this.pdf.FPDF_LoadPage(this.docPtr, pageIdx);
      ctx = new PageContext(this.pdf, this.docPtr, pageIdx, pagePtr, this.config.pageTtl, () => {
        this.cache.delete(pageIdx);
        this.removeFromAccessOrder(pageIdx);
      });
      this.cache.set(pageIdx, ctx);
    }

    // Update LRU order
    this.updateAccessOrder(pageIdx);

    ctx.clearExpiryTimer(); // cancel any pending teardown
    ctx.bumpRefCount(); // bump ref‐count
    return ctx;
  }

  /** Helper: run a function "scoped" to a page.
   *    – if the page was already cached  → .release() (keeps TTL logic)
   *    – if the page was loaded just now → .disposeImmediate() (free right away)
   */
  borrowPage<T>(pageIdx: number, fn: (ctx: PageContext) => T): T {
    const existed = this.cache.has(pageIdx);
    const ctx = this.acquire(pageIdx);
    try {
      return fn(ctx);
    } finally {
      existed ? ctx.release() : ctx.disposeImmediate();
    }
  }

  forceReleaseAll(): void {
    for (const ctx of this.cache.values()) {
      ctx.disposeImmediate();
    }
    this.cache.clear();
    this.accessOrder.length = 0;
  }

  /** Update cache configuration */
  updateConfig(config: Required<CacheConfig>): void {
    this.config = config;

    // Update TTL for all existing pages
    for (const ctx of this.cache.values()) {
      ctx.updateTtl(config.pageTtl);
    }

    // Evict pages if new max size is smaller
    this.evictIfNeeded();
  }

  /** Get current cache size */
  size(): number {
    return this.cache.size;
  }

  /** Evict least recently used pages if cache exceeds max size */
  private evictIfNeeded(): void {
    while (this.cache.size >= this.config.maxPagesPerDocument) {
      const lruPageIdx = this.accessOrder[0];
      if (lruPageIdx !== undefined) {
        const ctx = this.cache.get(lruPageIdx);
        if (ctx) {
          // Only evict if not currently in use (refCount === 0)
          if (ctx.getRefCount() === 0) {
            ctx.disposeImmediate();
            // onFinalDispose callback will remove from cache and accessOrder
          } else {
            // If the LRU page is in use, we can't evict it
            // Move to a different strategy or break to avoid infinite loop
            break;
          }
        } else {
          // Page not in cache but in access order - clean up
          this.removeFromAccessOrder(lruPageIdx);
        }
      } else {
        break;
      }
    }
  }

  /** Update the access order for LRU tracking */
  private updateAccessOrder(pageIdx: number): void {
    // Remove from current position
    this.removeFromAccessOrder(pageIdx);
    // Add to end (most recently used)
    this.accessOrder.push(pageIdx);
  }

  /** Remove a page from the access order array */
  private removeFromAccessOrder(pageIdx: number): void {
    const index = this.accessOrder.indexOf(pageIdx);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
}

export class PageContext {
  private refCount = 0;
  private expiryTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private ttl: number;

  // lazy helpers
  private textPagePtr?: number;
  private formInfoPtr?: number;
  private formHandle?: number;

  constructor(
    private readonly pdf: WrappedPdfiumModule,
    public readonly docPtr: number,
    public readonly pageIdx: number,
    public readonly pagePtr: number,
    ttl: number,
    private readonly onFinalDispose: () => void,
  ) {
    this.ttl = ttl;
  }

  /** Called by PageCache.acquire() */
  bumpRefCount() {
    if (this.disposed) throw new Error('Context already disposed');
    this.refCount++;
  }

  /** Get current reference count */
  getRefCount(): number {
    return this.refCount;
  }

  /** Called by PageCache.acquire() */
  clearExpiryTimer() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }
  }

  /** Update TTL configuration */
  updateTtl(newTtl: number): void {
    this.ttl = newTtl;
    // If there's an active timer and ref count is 0, restart with new TTL
    if (this.expiryTimer && this.refCount === 0) {
      this.clearExpiryTimer();
      this.expiryTimer = setTimeout(() => this.disposeImmediate(), this.ttl);
    }
  }

  /** Called by PageCache.release() internally */
  release() {
    if (this.disposed) return;
    this.refCount--;
    if (this.refCount === 0) {
      // schedule the one-and-only timer for the page
      this.expiryTimer = setTimeout(() => this.disposeImmediate(), this.ttl);
    }
  }

  /** Tear down _all_ sub-pointers & the page. */
  disposeImmediate() {
    if (this.disposed) return;
    this.disposed = true;

    // Clear any pending timer
    this.clearExpiryTimer();

    // 2️⃣ close text-page if opened
    if (this.textPagePtr !== undefined) {
      this.pdf.FPDFText_ClosePage(this.textPagePtr);
    }

    // 3️⃣ close form-fill if opened
    if (this.formHandle !== undefined) {
      this.pdf.FORM_OnBeforeClosePage(this.pagePtr, this.formHandle);
      this.pdf.PDFiumExt_ExitFormFillEnvironment(this.formHandle);
    }
    if (this.formInfoPtr !== undefined) {
      this.pdf.PDFiumExt_CloseFormFillInfo(this.formInfoPtr);
    }

    // 4️⃣ finally close the page itself
    this.pdf.FPDF_ClosePage(this.pagePtr);

    // 5️⃣ remove from the cache
    this.onFinalDispose();
  }

  // ── public helpers ──

  /** Always safe: opens (once) and returns the text-page ptr. */
  getTextPage(): number {
    this.ensureAlive();
    if (this.textPagePtr === undefined) {
      this.textPagePtr = this.pdf.FPDFText_LoadPage(this.pagePtr);
    }
    return this.textPagePtr;
  }

  /** Always safe: opens (once) and returns the form-fill handle. */
  getFormHandle(): number {
    this.ensureAlive();
    if (this.formHandle === undefined) {
      this.formInfoPtr = this.pdf.PDFiumExt_OpenFormFillInfo();
      this.formHandle = this.pdf.PDFiumExt_InitFormFillEnvironment(this.docPtr, this.formInfoPtr);
      this.pdf.FORM_OnAfterLoadPage(this.pagePtr, this.formHandle);
    }
    return this.formHandle;
  }

  /**
   * Safely execute `fn` with an annotation pointer.
   * Pointer is ALWAYS closed afterwards.
   */
  withAnnotation<T>(annotIdx: number, fn: (annotPtr: number) => T): T {
    this.ensureAlive();
    const annotPtr = this.pdf.FPDFPage_GetAnnot(this.pagePtr, annotIdx);
    try {
      return fn(annotPtr);
    } finally {
      this.pdf.FPDFPage_CloseAnnot(annotPtr);
    }
  }

  private ensureAlive() {
    if (this.disposed) throw new Error('PageContext already disposed');
  }
}
