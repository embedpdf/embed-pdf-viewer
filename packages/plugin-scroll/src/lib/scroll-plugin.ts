import {
  BasePlugin,
  PluginRegistry,
  createBehaviorEmitter,
  getPagesWithRotatedSize,
  DocumentState,
  Unsubscribe,
  Listener,
} from '@embedpdf/core';
import { PdfPageObjectWithRotatedSize, Rect, Rotation } from '@embedpdf/models';
import { ViewportCapability, ViewportMetrics, ViewportPlugin } from '@embedpdf/plugin-viewport';

import {
  ScrollCapability,
  ScrollScope,
  ScrollPluginConfig,
  ScrollStrategy,
  ScrollMetrics,
  ScrollState,
  ScrollDocumentState,
  LayoutChangePayload,
  ScrollerLayout,
  ScrollToPageOptions,
  PageChangeEvent,
  ScrollEvent,
  LayoutChangeEvent,
  PageChangeStateEvent,
  LayoutReadyEvent,
  ScrollBehavior,
  PageChangeState,
} from './types';
import { BaseScrollStrategy, ScrollStrategyConfig } from './strategies/base-strategy';
import { VerticalScrollStrategy } from './strategies/vertical-strategy';
import { HorizontalScrollStrategy } from './strategies/horizontal-strategy';
import {
  ScrollAction,
  initScrollState,
  cleanupScrollState,
  updateDocumentScrollState,
  setScrollStrategy,
} from './actions';
import { VirtualItem } from './types/virtual-item';
import { defaultPageChangeState } from './reducer';
import { getScrollerLayout } from './selectors';

export class ScrollPlugin extends BasePlugin<
  ScrollPluginConfig,
  ScrollCapability,
  ScrollState,
  ScrollAction
> {
  static readonly id = 'scroll' as const;

  private viewport: ViewportCapability;

  // Strategies per document
  private strategies = new Map<string, BaseScrollStrategy>();

  // Layout ready tracking per document
  private layoutReady = new Set<string>();

  // Per-document scroller layout emitters (for real-time scroll updates)
  private scrollerLayoutEmitters = new Map<
    string,
    ReturnType<typeof createBehaviorEmitter<ScrollerLayout>>
  >();

  private initialPage?: number;
  private initialPageUsed = false;

  // Event emitters (include documentId)
  private readonly pageChange$ = createBehaviorEmitter<PageChangeEvent>();
  private readonly scroll$ = createBehaviorEmitter<ScrollEvent>();
  private readonly layoutChange$ = createBehaviorEmitter<LayoutChangeEvent>();
  private readonly pageChangeState$ = createBehaviorEmitter<PageChangeStateEvent>();
  private readonly layoutReady$ = createBehaviorEmitter<LayoutReadyEvent>();
  private readonly state$ = createBehaviorEmitter<ScrollDocumentState>();

  constructor(
    public readonly id: string,
    registry: PluginRegistry,
    private config?: ScrollPluginConfig,
  ) {
    super(id, registry);

    this.viewport = this.registry.getPlugin<ViewportPlugin>('viewport')!.provides();
    this.initialPage = this.config?.initialPage;

    // Subscribe to viewport scroll activity (per document)
    this.viewport.onScrollActivity((event) => {
      const docState = this.getDocumentState(event.documentId);
      if (docState?.pageChangeState.isChanging && !event.activity.isSmoothScrolling) {
        this.completePageChange(event.documentId);
      }
    });

    // Subscribe to viewport changes (per document) with throttling
    this.viewport.onViewportChange((event) => {
      const docState = this.getDocumentState(event.documentId);
      if (!docState) return;

      // Compute the metrics based on the incoming event
      const computedMetrics = this.computeMetrics(event.documentId, event.metrics);

      // THE GUARD: Only update the scrollOffset if the layout is already "ready".
      if (this.layoutReady.has(event.documentId)) {
        // Layout is ready, so this is a real scroll event from the user.
        // Commit all metrics, including the new scrollOffset.
        this.commitMetrics(event.documentId, computedMetrics);
      } else {
        // Layout is NOT ready. This is the initial, premature event.
        // We must commit the other metrics (like visible pages for rendering)
        // but EXCLUDE the incorrect scrollOffset to protect our persisted state.
        this.commitMetrics(event.documentId, {
          ...computedMetrics,
          scrollOffset: docState.scrollOffset,
        });
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoaded(documentId: string): void {
    const coreDoc = this.coreState.core.documents[documentId];
    if (!coreDoc || coreDoc.status !== 'loaded') return;

    // Initialize scroll state for this document
    const docState = this.createDocumentState(coreDoc);
    this.dispatch(initScrollState(documentId, docState));

    // Create strategy for this document
    const strategy = this.createStrategy(docState.strategy);
    this.strategies.set(documentId, strategy);

    // Create scroller layout emitter for this document
    this.scrollerLayoutEmitters.set(documentId, createBehaviorEmitter<ScrollerLayout>());

    // Initial layout computation
    this.refreshDocumentLayout(documentId);

    this.logger.debug(
      'ScrollPlugin',
      'DocumentOpened',
      `Initialized scroll state for document: ${documentId}`,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup strategy
    this.strategies.delete(documentId);

    // Cleanup layout ready tracking
    this.layoutReady.delete(documentId);

    // Cleanup scroller layout emitter
    const emitter = this.scrollerLayoutEmitters.get(documentId);
    if (emitter) {
      emitter.clear();
      this.scrollerLayoutEmitters.delete(documentId);
    }

    // Cleanup state
    this.dispatch(cleanupScrollState(documentId));

    this.logger.debug(
      'ScrollPlugin',
      'DocumentClosed',
      `Cleaned up scroll state for document: ${documentId}`,
    );
  }

  protected override onScaleChanged(documentId: string, scale: number): void {
    this.refreshDocumentLayout(documentId);
  }

  protected override onRotationChanged(documentId: string, rotation: number): void {
    this.refreshDocumentLayout(documentId);
  }

  // ─────────────────────────────────────────────────────────
  // Public API for Components (Scroller Layout)
  // ─────────────────────────────────────────────────────────

  /**
   * Subscribe to scroller layout updates for a specific document
   * This is the key method for the Scroller component to stay reactive
   */
  public onScrollerData(
    documentId: string,
    callback: (layout: ScrollerLayout) => void,
  ): Unsubscribe {
    const emitter = this.scrollerLayoutEmitters.get(documentId);
    if (!emitter) {
      throw new Error(`No scroller layout emitter found for document: ${documentId}`);
    }
    return emitter.on(callback);
  }

  /**
   * Get current scroller layout for a document
   */
  public getScrollerLayout(documentId: string): ScrollerLayout {
    const docState = this.getDocumentState(documentId);
    const coreDoc = this.coreState.core.documents[documentId];

    if (!docState || !coreDoc) {
      throw new Error(`Cannot get scroller layout for document: ${documentId}`);
    }

    return getScrollerLayout(docState, coreDoc.scale);
  }

  public setLayoutReady(documentId: string): void {
    // This guard logic is now reliable because the flag gets reset correctly.
    if (this.layoutReady.has(documentId)) {
      return;
    }

    const docState = this.getDocumentState(documentId);
    if (!docState) return;

    this.layoutReady.add(documentId);

    // Only run initialPage logic once on the first document
    if (this.initialPage && !this.initialPageUsed) {
      this.initialPageUsed = true;
      this.scrollToPage({ pageNumber: this.initialPage, behavior: 'instant' }, documentId);
    } else {
      // For subsequent documents or when no initialPage is set, restore the persisted scroll position
      const viewport = this.viewport.forDocument(documentId);
      viewport.scrollTo({ ...docState.scrollOffset, behavior: 'instant' });
    }

    this.layoutReady$.emit({ documentId });
  }

  public clearLayoutReady(documentId: string): void {
    this.layoutReady.delete(documentId);
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): ScrollCapability {
    return {
      // Active document operations
      getCurrentPage: () => this.getCurrentPage(),
      getTotalPages: () => this.getTotalPages(),
      getPageChangeState: () => this.getPageChangeState(),
      scrollToPage: (options) => this.scrollToPage(options),
      scrollToNextPage: (behavior) => this.scrollToNextPage(behavior),
      scrollToPreviousPage: (behavior) => this.scrollToPreviousPage(behavior),
      getMetrics: (viewport) => this.getMetrics(viewport),
      getLayout: () => this.getLayout(),
      getRectPositionForPage: (page, rect, scale, rotation) =>
        this.getRectPositionForPage(page, rect, scale, rotation),

      // Document-scoped operations
      forDocument: (documentId) => this.createScrollScope(documentId),

      // Global settings
      setScrollStrategy: (strategy, documentId) =>
        this.setScrollStrategyForDocument(strategy, documentId),
      getPageGap: () => this.state.defaultPageGap,

      // Events
      onPageChange: this.pageChange$.on,
      onScroll: this.scroll$.on,
      onLayoutChange: this.layoutChange$.on,
      onLayoutReady: this.layoutReady$.on,
      onPageChangeState: this.pageChangeState$.on,
      onStateChange: this.state$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createScrollScope(documentId: string): ScrollScope {
    return {
      getCurrentPage: () => this.getCurrentPage(documentId),
      getTotalPages: () => this.getTotalPages(documentId),
      getPageChangeState: () => this.getPageChangeState(documentId),
      scrollToPage: (options) => this.scrollToPage(options, documentId),
      scrollToNextPage: (behavior) => this.scrollToNextPage(behavior, documentId),
      scrollToPreviousPage: (behavior) => this.scrollToPreviousPage(behavior, documentId),
      getMetrics: (viewport) => this.getMetrics(viewport, documentId),
      getLayout: () => this.getLayout(documentId),
      getRectPositionForPage: (page, rect, scale, rotation) =>
        this.getRectPositionForPage(page, rect, scale, rotation, documentId),
      onPageChange: (listener: Listener<PageChangeEvent>) =>
        this.pageChange$.on((event) => {
          if (event.documentId === documentId) listener(event);
        }),
      onScroll: (listener: Listener<ScrollMetrics>) =>
        this.scroll$.on((event) => {
          if (event.documentId === documentId) listener(event.metrics);
        }),
      onLayoutChange: (listener: Listener<LayoutChangePayload>) =>
        this.layoutChange$.on((event) => {
          if (event.documentId === documentId) listener(event.layout);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────

  private getActiveDocumentId(): string {
    const id = this.coreState.core.activeDocumentId;
    if (!id) throw new Error('No active document');
    return id;
  }

  private getDocumentState(documentId?: string): ScrollDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): ScrollDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Scroll state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  private getStrategy(documentId?: string): BaseScrollStrategy {
    const id = documentId ?? this.getActiveDocumentId();
    const strategy = this.strategies.get(id);
    if (!strategy) {
      throw new Error(`Strategy not found for document: ${id}`);
    }
    return strategy;
  }

  private createStrategy(strategyType: ScrollStrategy): BaseScrollStrategy {
    const config: ScrollStrategyConfig = {
      pageGap: this.state.defaultPageGap,
      viewportGap: this.viewport.getViewportGap(),
      bufferSize: this.state.defaultBufferSize,
    };

    return strategyType === ScrollStrategy.Horizontal
      ? new HorizontalScrollStrategy(config)
      : new VerticalScrollStrategy(config);
  }

  private createDocumentState(coreDoc: DocumentState): ScrollDocumentState {
    return {
      virtualItems: [],
      totalPages: coreDoc.document?.pageCount ?? 0,
      currentPage: 1,
      totalContentSize: { width: 0, height: 0 },
      strategy: this.state.defaultStrategy,
      pageGap: this.state.defaultPageGap,
      scale: coreDoc.scale,
      visiblePages: [],
      pageVisibilityMetrics: [],
      renderedPageIndexes: [],
      scrollOffset: { x: 0, y: 0 },
      startSpacing: 0,
      endSpacing: 0,
      pageChangeState: defaultPageChangeState,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Page Change Management
  // ─────────────────────────────────────────────────────────

  private startPageChange(
    documentId: string,
    targetPage: number,
    behavior: ScrollBehavior = 'smooth',
  ): void {
    const docState = this.getDocumentState(documentId);
    if (!docState) return;

    const pageChangeState: PageChangeState = {
      isChanging: true,
      targetPage,
      fromPage: docState.currentPage,
      startTime: Date.now(),
    };

    this.dispatch(updateDocumentScrollState(documentId, { pageChangeState }));

    if (behavior === 'instant') {
      this.completePageChange(documentId);
    }
  }

  private completePageChange(documentId: string): void {
    const docState = this.getDocumentState(documentId);
    if (!docState || !docState.pageChangeState.isChanging) return;

    const pageChangeState: PageChangeState = {
      isChanging: false,
      targetPage: docState.pageChangeState.targetPage,
      fromPage: docState.pageChangeState.fromPage,
      startTime: docState.pageChangeState.startTime,
    };

    this.dispatch(updateDocumentScrollState(documentId, { pageChangeState }));
  }

  // ─────────────────────────────────────────────────────────
  // Layout & Metrics Computation
  // ─────────────────────────────────────────────────────────

  private computeLayout(
    documentId: string,
    pages: PdfPageObjectWithRotatedSize[][],
  ): {
    virtualItems: VirtualItem[];
    totalContentSize: { width: number; height: number };
  } {
    const strategy = this.getStrategy(documentId);
    const virtualItems = strategy.createVirtualItems(pages);
    const totalContentSize = strategy.getTotalContentSize(virtualItems);
    return { virtualItems, totalContentSize };
  }

  private computeMetrics(documentId: string, vp: ViewportMetrics): ScrollMetrics {
    const docState = this.getDocumentState(documentId);
    const strategy = this.getStrategy(documentId);
    if (!docState) throw new Error(`Document state not found: ${documentId}`);

    return strategy.handleScroll(vp, docState.virtualItems, docState.scale);
  }

  // ─────────────────────────────────────────────────────────
  // Commit (Single Source of Truth)
  // ─────────────────────────────────────────────────────────

  private commitMetrics(documentId: string, metrics: ScrollMetrics): void {
    const docState = this.getDocumentState(documentId);
    if (!docState) return;

    // Update state
    this.dispatch(updateDocumentScrollState(documentId, metrics));

    // Emit scroll event
    this.scroll$.emit({ documentId, metrics });

    // Emit page change if current page changed
    if (metrics.currentPage !== docState.currentPage) {
      this.pageChange$.emit({
        documentId,
        pageNumber: metrics.currentPage,
        totalPages: docState.totalPages,
      });
    }

    // CRITICAL: Push updated scroller layout (for spacing/visible items reactivity)
    this.pushScrollerLayout(documentId);
  }

  private pushScrollerLayout(documentId: string): void {
    const emitter = this.scrollerLayoutEmitters.get(documentId);
    if (!emitter) return;

    try {
      const layout = this.getScrollerLayout(documentId);
      emitter.emit(layout);
    } catch (error) {
      // Document might be closing, ignore
    }
  }

  private refreshDocumentLayout(documentId: string): void {
    const coreDoc = this.coreState.core.documents[documentId];
    const docState = this.getDocumentState(documentId);

    if (!coreDoc || !docState || coreDoc.status !== 'loaded') return;

    const pages = getPagesWithRotatedSize(coreDoc);
    const layout = this.computeLayout(documentId, pages);

    // Get viewport metrics for this document
    const viewport = this.viewport.forDocument(documentId);
    const metrics = this.computeMetrics(documentId, viewport.getMetrics());

    // Update state with layout + metrics
    this.dispatch(
      updateDocumentScrollState(documentId, {
        ...layout,
        ...metrics,
      }),
    );

    // Emit layout change event
    this.layoutChange$.emit({ documentId, layout });

    // Push updated scroller layout
    this.pushScrollerLayout(documentId);
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private getCurrentPage(documentId?: string): number {
    return this.getDocumentStateOrThrow(documentId).currentPage;
  }

  private getTotalPages(documentId?: string): number {
    return this.getDocumentStateOrThrow(documentId).totalPages;
  }

  private getPageChangeState(documentId?: string): PageChangeState {
    return this.getDocumentStateOrThrow(documentId).pageChangeState;
  }

  private scrollToPage(options: ScrollToPageOptions, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const strategy = this.getStrategy(id);
    const coreDoc = this.coreState.core.documents[id];

    const { pageNumber, behavior = 'smooth', pageCoordinates, center = false } = options;

    this.startPageChange(id, pageNumber, behavior);

    const position = strategy.getScrollPositionForPage(
      pageNumber,
      docState.virtualItems,
      docState.scale,
      coreDoc.rotation,
      pageCoordinates,
    );

    if (position) {
      const viewport = this.viewport.forDocument(id);
      viewport.scrollTo({ ...position, behavior, center });
    } else {
      this.completePageChange(id);
    }
  }

  private scrollToNextPage(behavior: ScrollBehavior = 'smooth', documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const strategy = this.getStrategy(id);
    const coreDoc = this.coreState.core.documents[id];

    const currentItemIndex = docState.virtualItems.findIndex((item) =>
      item.pageNumbers.includes(docState.currentPage),
    );

    if (currentItemIndex >= 0 && currentItemIndex < docState.virtualItems.length - 1) {
      const nextItem = docState.virtualItems[currentItemIndex + 1];
      const targetPage = nextItem.pageNumbers[0];

      this.startPageChange(id, targetPage, behavior);

      const position = strategy.getScrollPositionForPage(
        targetPage,
        docState.virtualItems,
        docState.scale,
        coreDoc.rotation,
      );

      if (position) {
        const viewport = this.viewport.forDocument(id);
        viewport.scrollTo({ ...position, behavior });
      } else {
        this.completePageChange(id);
      }
    }
  }

  private scrollToPreviousPage(behavior: ScrollBehavior = 'smooth', documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const strategy = this.getStrategy(id);
    const coreDoc = this.coreState.core.documents[id];

    const currentItemIndex = docState.virtualItems.findIndex((item) =>
      item.pageNumbers.includes(docState.currentPage),
    );

    if (currentItemIndex > 0) {
      const prevItem = docState.virtualItems[currentItemIndex - 1];
      const targetPage = prevItem.pageNumbers[0];

      this.startPageChange(id, targetPage, behavior);

      const position = strategy.getScrollPositionForPage(
        targetPage,
        docState.virtualItems,
        docState.scale,
        coreDoc.rotation,
      );

      if (position) {
        const viewport = this.viewport.forDocument(id);
        viewport.scrollTo({ ...position, behavior });
      } else {
        this.completePageChange(id);
      }
    }
  }

  private getMetrics(viewport?: ViewportMetrics, documentId?: string): ScrollMetrics {
    const id = documentId ?? this.getActiveDocumentId();

    if (viewport) {
      return this.computeMetrics(id, viewport);
    }

    const viewportScope = this.viewport.forDocument(id);
    return this.computeMetrics(id, viewportScope.getMetrics());
  }

  private getLayout(documentId?: string): LayoutChangePayload {
    const docState = this.getDocumentStateOrThrow(documentId);
    return {
      virtualItems: docState.virtualItems,
      totalContentSize: docState.totalContentSize,
    };
  }

  private getRectPositionForPage(
    pageIndex: number,
    rect: Rect,
    scale?: number,
    rotation?: Rotation,
    documentId?: string,
  ): Rect | null {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const strategy = this.getStrategy(id);
    const coreDoc = this.coreState.core.documents[id];

    return strategy.getRectPositionForPage(
      pageIndex + 1,
      docState.virtualItems,
      scale ?? docState.scale,
      rotation ?? coreDoc.rotation,
      rect,
    );
  }

  private setScrollStrategyForDocument(newStrategy: ScrollStrategy, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentState(id);

    if (!docState || docState.strategy === newStrategy) return;

    // Create new strategy
    const strategy = this.createStrategy(newStrategy);
    this.strategies.set(id, strategy);

    // Update state
    this.dispatch(setScrollStrategy(id, newStrategy));

    // Recalculate layout
    this.refreshDocumentLayout(id);
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(prevState: ScrollState, newState: ScrollState): void {
    // Emit state changes and push scroller layout for each changed document
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];

      if (prevDoc !== newDoc) {
        this.state$.emit(newDoc);

        if (prevDoc?.pageChangeState !== newDoc.pageChangeState) {
          this.pageChangeState$.emit({
            documentId,
            state: newDoc.pageChangeState,
          });
        }

        // Push scroller layout on any state change
        this.pushScrollerLayout(documentId);
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.logger.info('ScrollPlugin', 'Initialize', 'Scroll plugin initialized');
  }

  async destroy(): Promise<void> {
    this.strategies.clear();
    this.layoutReady.clear();

    // Clear all scroller layout emitters
    for (const emitter of this.scrollerLayoutEmitters.values()) {
      emitter.clear();
    }
    this.scrollerLayoutEmitters.clear();

    this.pageChange$.clear();
    this.scroll$.clear();
    this.layoutChange$.clear();
    this.pageChangeState$.clear();
    this.layoutReady$.clear();
    this.state$.clear();

    super.destroy();
  }
}
