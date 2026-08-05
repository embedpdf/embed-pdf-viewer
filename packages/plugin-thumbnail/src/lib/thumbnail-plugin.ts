import { BasePlugin, createScopedEmitter, PluginRegistry, REFRESH_PAGES } from '@embedpdf/core';
import {
  ScrollToOptions,
  ThumbMeta,
  ThumbnailPluginConfig,
  WindowState,
  ThumbnailCapability,
  ThumbnailScope,
  WindowChangeEvent,
  ScrollToEvent,
  RefreshPagesEvent,
  ThumbnailState,
  ThumbnailDocumentState,
} from './types';
import { ignore, PdfErrorReason, Task, TaskStage } from '@embedpdf/models';
import { RenderCapability, RenderPlugin } from '@embedpdf/plugin-render';
import { ScrollCapability, ScrollPlugin } from '@embedpdf/plugin-scroll';
import {
  initThumbnailState,
  cleanupThumbnailState,
  setWindowState,
  updateViewportMetrics,
  ThumbnailAction,
} from './actions';
import { initialDocumentState } from './reducer';

// LRU cache size - should this be a config option?
const THUMBNAIL_CACHE_SIZE = 30;

export class ThumbnailPlugin extends BasePlugin<
  ThumbnailPluginConfig,
  ThumbnailCapability,
  ThumbnailState,
  ThumbnailAction
> {
  static readonly id = 'thumbnail' as const;

  private renderCapability: RenderCapability;
  private scrollCapability: ScrollCapability | null = null;

  // Per-document LRU task cache (serves both dedup and caching)
  // In-flight tasks dedup concurrent requests; resolved tasks serve cached bitmaps.
  // Map insertion-order is used for LRU eviction.
  private readonly thumbCaches = new Map<string, Map<number, Task<ImageBitmap, PdfErrorReason>>>();

  // Per-document auto-scroll tracking
  private readonly canAutoScroll = new Map<string, boolean>();

  private readonly window$ = createScopedEmitter<WindowState, WindowChangeEvent, string>(
    (documentId, window) => ({ documentId, window }),
  );
  private readonly scrollTo$ = createScopedEmitter<ScrollToOptions, ScrollToEvent, string>(
    (documentId, options) => ({ documentId, options }),
  );
  private readonly refreshPages$ = createScopedEmitter<number[], RefreshPagesEvent, string>(
    (documentId, pages) => ({ documentId, pages }),
    { cache: false },
  );

  constructor(
    id: string,
    registry: PluginRegistry,
    public cfg: ThumbnailPluginConfig,
  ) {
    super(id, registry);

    this.renderCapability = this.registry.getPlugin<RenderPlugin>('render')!.provides();
    this.scrollCapability = this.registry.getPlugin<ScrollPlugin>('scroll')?.provides() ?? null;

    this.coreStore.onAction(REFRESH_PAGES, (action) => {
      const documentId = action.payload.documentId ?? this.getActiveDocumentId();
      const pages = action.payload.pageIndexes;

      this.refreshPages$.emit(documentId, pages);

      // Evict affected pages from cache (close resolved bitmaps to free GPU memory)
      const cache = this.thumbCaches.get(documentId);
      if (cache) {
        for (const pageIndex of pages) {
          this.evictEntry(cache, pageIndex);
        }
      }
    });

    // Auto-scroll thumbnails when the main scroller's current page changes
    if (this.scrollCapability && this.cfg.autoScroll !== false) {
      this.scrollCapability.onPageChangeState(({ documentId, state }) => {
        this.canAutoScroll.set(documentId, !state.isChanging);
        if (!state.isChanging) {
          this.scrollToThumb(state.targetPage - 1, documentId);
        }
      });
      this.scrollCapability.onPageChange(({ documentId, pageNumber }) => {
        if (this.canAutoScroll.get(documentId) !== false) {
          this.scrollToThumb(pageNumber - 1, documentId);
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize state for this document
    this.dispatch(
      initThumbnailState(documentId, {
        ...initialDocumentState,
      }),
    );

    // Initialize cache
    this.thumbCaches.set(documentId, new Map());
    this.canAutoScroll.set(documentId, true);

    this.logger.debug(
      'ThumbnailPlugin',
      'DocumentOpened',
      `Initialized thumbnail state for document: ${documentId}`,
    );
  }

  protected override onDocumentLoaded(documentId: string): void {
    // Calculate initial window state after document is fully loaded
    this.calculateWindowState(documentId);
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup state
    this.dispatch(cleanupThumbnailState(documentId));

    // Cleanup cache (abort in-flight, close resolved bitmaps)
    const cache = this.thumbCaches.get(documentId);
    if (cache) {
      cache.forEach((task) => {
        this.closeCacheEntry(task);
      });
      cache.clear();
      this.thumbCaches.delete(documentId);
    }

    this.canAutoScroll.delete(documentId);
    this.window$.clearScope(documentId);
    this.scrollTo$.clearScope(documentId);
    this.refreshPages$.clearScope(documentId);
    this.logger.debug(
      'ThumbnailPlugin',
      'DocumentClosed',
      `Cleaned up thumbnail state for document: ${documentId}`,
    );
  }

  protected override onRotationChanged(documentId: string): void {
    // Recalculate window state when rotation changes
    this.calculateWindowState(documentId);
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): ThumbnailCapability {
    return {
      // Active document operations
      scrollToThumb: (pageIdx) => this.scrollToThumb(pageIdx),
      renderThumb: (idx, dpr) => this.renderThumb(idx, dpr),
      updateWindow: (scrollY, viewportH) => this.updateWindow(scrollY, viewportH),
      getWindow: () => this.getWindow(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createThumbnailScope(documentId),

      // Events
      onWindow: this.window$.onGlobal,
      onScrollTo: this.scrollTo$.onGlobal,
      onRefreshPages: this.refreshPages$.onGlobal,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createThumbnailScope(documentId: string): ThumbnailScope {
    return {
      scrollToThumb: (pageIdx) => this.scrollToThumb(pageIdx, documentId),
      renderThumb: (idx, dpr) => this.renderThumb(idx, dpr, documentId),
      updateWindow: (scrollY, viewportH) => this.updateWindow(scrollY, viewportH, documentId),
      getWindow: () => this.getWindow(documentId),
      onWindow: this.window$.forScope(documentId),
      onScrollTo: this.scrollTo$.forScope(documentId),
      onRefreshPages: this.refreshPages$.forScope(documentId),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────

  private getDocumentState(documentId?: string): ThumbnailDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  // ─────────────────────────────────────────────────────────
  // LRU Cache Helpers
  // ─────────────────────────────────────────────────────────

  /** Touch an entry to mark it as most-recently-used (re-insert at end). */
  private lruTouch(
    cache: Map<number, Task<ImageBitmap, PdfErrorReason>>,
    key: number,
    task: Task<ImageBitmap, PdfErrorReason>,
  ): void {
    cache.delete(key);
    cache.set(key, task);
  }

  /** Evict oldest entries until the cache is within capacity. */
  private lruEvict(cache: Map<number, Task<ImageBitmap, PdfErrorReason>>): void {
    while (cache.size > THUMBNAIL_CACHE_SIZE) {
      const oldest = cache.keys().next().value!;
      const task = cache.get(oldest)!;
      cache.delete(oldest);
      this.closeCacheEntry(task);
    }
  }

  /**
   * Close the bitmap inside a resolved task, or abort if still pending.
   * Rejected tasks need no cleanup — no bitmap was produced.
   */
  private closeCacheEntry(task: Task<ImageBitmap, PdfErrorReason>): void {
    if (task.state.stage === TaskStage.Resolved) {
      task.state.result.close();
    } else if (task.state.stage === TaskStage.Pending) {
      task.abort({ code: 'cancelled' as any, message: 'evicted' });
    }
  }

  /** Remove a single entry from the cache, closing its bitmap. */
  private evictEntry(cache: Map<number, Task<ImageBitmap, PdfErrorReason>>, key: number): void {
    const task = cache.get(key);
    if (task) {
      this.closeCacheEntry(task);
      cache.delete(key);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private calculateWindowState(documentId: string) {
    const coreDoc = this.coreState.core.documents[documentId];
    if (!coreDoc?.document) return;

    const OUTER_W = this.cfg.width ?? 120;
    const L = this.cfg.labelHeight ?? 16;
    const GAP = this.cfg.gap ?? 8;
    const P = this.cfg.imagePadding ?? 0;
    const PADDING_Y = this.cfg.paddingY ?? 0;

    // Inner bitmap width cannot go below 1px
    const INNER_W = Math.max(1, OUTER_W - 2 * P);

    let offset = PADDING_Y; // Start with top padding
    const thumbs: ThumbMeta[] = coreDoc.document.pages.map((p) => {
      // Apply page rotation to get correct dimensions (90° or 270° swaps width/height)
      const isRotated90or270 = p.rotation % 2 === 1;
      const effectiveWidth = isRotated90or270 ? p.size.height : p.size.width;
      const effectiveHeight = isRotated90or270 ? p.size.width : p.size.height;
      const ratio = effectiveHeight / effectiveWidth;
      const imgH = Math.round(INNER_W * ratio);
      const wrapH = P + imgH + P + L; // padding + image + padding + label

      const meta: ThumbMeta = {
        pageIndex: p.index,
        width: INNER_W, // bitmap width (for <img> size)
        height: imgH, // bitmap height (for <img> size)
        wrapperHeight: wrapH, // full row height used by virtualizer
        top: offset, // top of the row
        labelHeight: L,
        padding: P,
      };
      offset += wrapH + GAP;
      return meta;
    });

    const window: WindowState = {
      start: -1,
      end: -1,
      items: [],
      totalHeight: offset - GAP + PADDING_Y, // Add bottom padding to total height
    };

    const docState = this.getDocumentState(documentId);
    if (!docState) return;

    // Update state with new thumbs and window
    this.dispatch(
      initThumbnailState(documentId, {
        ...docState,
        thumbs,
        window,
      }),
    );

    // Update window based on current viewport metrics
    if (docState.viewportH > 0) {
      this.updateWindow(docState.scrollY, docState.viewportH, documentId);
    } else {
      this.window$.emit(documentId, window);
    }
  }

  public updateWindow(scrollY: number, viewportH: number, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentState(id);
    if (!docState || !docState.window || docState.thumbs.length === 0) return;

    const BUF = this.cfg.buffer ?? 3;

    // Update viewport metrics
    this.dispatch(updateViewportMetrics(id, scrollY, viewportH));

    /* find first visible */
    let low = 0,
      high = docState.thumbs.length - 1,
      first = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const m = docState.thumbs[mid];
      if (m.top + m.wrapperHeight < scrollY) low = mid + 1;
      else {
        first = mid;
        high = mid - 1;
      }
    }

    /* find last visible + buffer */
    let last = first;
    const limit = scrollY + viewportH;
    while (last + 1 < docState.thumbs.length && docState.thumbs[last].top < limit) last++;
    last = Math.min(docState.thumbs.length - 1, last + BUF);

    const start = Math.max(0, first - BUF);
    if (start === docState.window.start && last === docState.window.end) return;

    const newWindow: WindowState = {
      start,
      end: last,
      items: docState.thumbs.slice(start, last + 1),
      totalHeight: docState.window.totalHeight,
    };

    this.dispatch(setWindowState(id, newWindow));
    this.window$.emit(id, newWindow);
  }

  private getWindow(documentId?: string): WindowState | null {
    const docState = this.getDocumentState(documentId);
    return docState?.window ?? null;
  }

  private scrollToThumb(pageIdx: number, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentState(id);
    if (!docState || !docState.window) return;

    const item = docState.thumbs[pageIdx];
    if (!item) return;

    const behavior = this.cfg.scrollBehavior ?? 'smooth';
    const PADDING_Y = this.cfg.paddingY ?? 0;

    if (docState.viewportH <= 0) {
      // Center the thumbnail in the viewport
      const top = Math.max(PADDING_Y, item.top - item.wrapperHeight);
      this.scrollTo$.emit(id, { top, behavior });
      return;
    }

    const margin = 8;
    const top = item.top;
    const bottom = item.top + item.wrapperHeight;

    const needsUp = top < docState.scrollY + margin + PADDING_Y;
    const needsDown = bottom > docState.scrollY + docState.viewportH - margin;

    if (needsUp) {
      this.scrollTo$.emit(id, {
        top: Math.max(0, top - PADDING_Y),
        behavior,
      });
    } else if (needsDown) {
      this.scrollTo$.emit(id, {
        top: Math.max(0, bottom - docState.viewportH + PADDING_Y),
        behavior,
      });
    }
  }

  /**
   * Return a cached (or newly created) thumbnail render task.
   * Deduplicates concurrent requests: in-flight tasks are reused.
   * Resolved tasks serve cached bitmaps until LRU-evicted.
   */
  private renderThumb(idx: number, dpr: number, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const cache = this.thumbCaches.get(id);
    if (!cache) {
      throw new Error(`Thumb cache not found for document: ${id}`);
    }

    // Cache hit (in-flight or resolved) — touch for LRU and return
    const existing = cache.get(idx);
    if (existing) {
      this.lruTouch(cache, idx, existing);
      return existing;
    }

    // Cache miss — render
    const coreDoc = this.coreState.core.documents[id];
    if (!coreDoc?.document) {
      throw new Error(`Document not found: ${id}`);
    }

    const page = coreDoc.document.pages[idx];
    if (!page) {
      throw new Error(`Page ${idx} not found in document: ${id}`);
    }

    const OUTER_W = this.cfg.width ?? 120;
    const P = this.cfg.imagePadding ?? 0;
    const INNER_W = Math.max(1, OUTER_W - 2 * P);

    const scale = INNER_W / page.size.width;

    const task = this.renderCapability.forDocument(id).renderPageRectBitmap({
      pageIndex: idx,
      rect: { origin: { x: 0, y: 0 }, size: page.size },
      options: {
        scaleFactor: scale,
        dpr,
        rotation: page.rotation,
      },
    });

    cache.set(idx, task);
    // On failure, remove so next request retries
    task.wait(ignore, () => cache.delete(idx));
    // Evict oldest if over capacity
    this.lruEvict(cache);
    return task;
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.logger.info('ThumbnailPlugin', 'Initialize', 'Thumbnail plugin initialized');
  }

  async destroy(): Promise<void> {
    this.window$.clear();
    this.refreshPages$.clear();
    this.scrollTo$.clear();

    // Cleanup all caches (abort in-flight, close resolved bitmaps)
    this.thumbCaches.forEach((cache) => {
      cache.forEach((task) => {
        this.closeCacheEntry(task);
      });
      cache.clear();
    });
    this.thumbCaches.clear();

    this.canAutoScroll.clear();

    super.destroy();
  }
}
