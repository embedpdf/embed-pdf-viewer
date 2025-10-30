import {
  BasePlugin,
  createBehaviorEmitter,
  createEmitter,
  Listener,
  PluginRegistry,
  REFRESH_PAGES,
} from '@embedpdf/core';
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
import { ignore, PdfErrorReason, Task } from '@embedpdf/models';
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

export class ThumbnailPlugin extends BasePlugin<
  ThumbnailPluginConfig,
  ThumbnailCapability,
  ThumbnailState,
  ThumbnailAction
> {
  static readonly id = 'thumbnail' as const;

  private renderCapability: RenderCapability;
  private scrollCapability: ScrollCapability | null = null;

  // Per-document task caches
  private readonly taskCaches = new Map<string, Map<number, Task<Blob, PdfErrorReason>>>();

  // Per-document auto-scroll tracking
  private readonly canAutoScroll = new Map<string, boolean>();

  private readonly window$ = createBehaviorEmitter<WindowChangeEvent>();
  private readonly refreshPages$ = createEmitter<RefreshPagesEvent>();
  private readonly scrollTo$ = createBehaviorEmitter<ScrollToEvent>();

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

      this.refreshPages$.emit({ documentId, pages });

      const taskCache = this.taskCaches.get(documentId);
      if (taskCache) {
        for (const pageIndex of pages) {
          taskCache.delete(pageIndex);
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

    // Initialize task cache
    this.taskCaches.set(documentId, new Map());
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

    // Cleanup task cache
    const taskCache = this.taskCaches.get(documentId);
    if (taskCache) {
      taskCache.forEach((task) => {
        task.abort({
          code: 'cancelled' as any,
          message: 'Document closed',
        });
      });
      taskCache.clear();
      this.taskCaches.delete(documentId);
    }

    this.canAutoScroll.delete(documentId);

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
      onWindow: this.window$.on,
      onScrollTo: this.scrollTo$.on,
      onRefreshPages: this.refreshPages$.on,
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
      onWindow: (listener: Listener<WindowState | null>) =>
        this.window$.on((event) => {
          if (event.documentId === documentId) listener(event.window);
        }),
      onScrollTo: (listener: Listener<ScrollToOptions>) =>
        this.scrollTo$.on((event) => {
          if (event.documentId === documentId) listener(event.options);
        }),
      onRefreshPages: (listener: Listener<number[]>) =>
        this.refreshPages$.on((event) => {
          if (event.documentId === documentId) listener(event.pages);
        }),
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
      const ratio = p.size.height / p.size.width;
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
      this.window$.emit({ documentId, window });
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
    this.window$.emit({ documentId: id, window: newWindow });
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
      this.scrollTo$.emit({ documentId: id, options: { top, behavior } });
      return;
    }

    const margin = 8;
    const top = item.top;
    const bottom = item.top + item.wrapperHeight;

    const needsUp = top < docState.scrollY + margin + PADDING_Y;
    const needsDown = bottom > docState.scrollY + docState.viewportH - margin;

    if (needsUp) {
      this.scrollTo$.emit({
        documentId: id,
        options: { top: Math.max(0, top - PADDING_Y), behavior },
      });
    } else if (needsDown) {
      this.scrollTo$.emit({
        documentId: id,
        options: { top: Math.max(0, bottom - docState.viewportH + PADDING_Y), behavior },
      });
    }
  }

  private renderThumb(idx: number, dpr: number, documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const taskCache = this.taskCaches.get(id);
    if (!taskCache) {
      throw new Error(`Task cache not found for document: ${id}`);
    }

    if (taskCache.has(idx)) return taskCache.get(idx)!;

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

    const task = this.renderCapability.forDocument(id).renderPageRect({
      pageIndex: idx,
      rect: { origin: { x: 0, y: 0 }, size: page.size },
      options: {
        scaleFactor: scale,
        dpr,
      },
    });

    taskCache.set(idx, task);
    task.wait(ignore, () => taskCache.delete(idx));
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

    // Cleanup all task caches
    this.taskCaches.forEach((cache) => {
      cache.forEach((task) => {
        task.abort({
          code: 'cancelled' as any,
          message: 'Plugin destroyed',
        });
      });
      cache.clear();
    });
    this.taskCaches.clear();
    this.canAutoScroll.clear();

    super.destroy();
  }
}
