import {
  BasePlugin,
  CoreState,
  PluginRegistry,
  SET_DOCUMENT,
  SET_PAGES,
  SET_ROTATION,
  StoreState,
  Unsubscribe,
  createBehaviorEmitter,
  getPagesWithRotatedSize,
} from '@embedpdf/core';
import { PdfPageObjectWithRotatedSize, Rect, Rotation } from '@embedpdf/models';
import { ViewportCapability, ViewportMetrics, ViewportPlugin } from '@embedpdf/plugin-viewport';
import {
  ScrollCapability,
  ScrollPluginConfig,
  ScrollStrategy,
  ScrollMetrics,
  ScrollState,
  LayoutChangePayload,
  ScrollerLayout,
  ScrollToPageOptions,
  PageChangePayload,
  ScrollBehavior,
  PageChangeState,
} from './types';
import { BaseScrollStrategy, ScrollStrategyConfig } from './strategies/base-strategy';
import { VerticalScrollStrategy } from './strategies/vertical-strategy';
import { HorizontalScrollStrategy } from './strategies/horizontal-strategy';
import { updateScrollState, ScrollAction, updateTotalPages, setPageChangeState } from './actions';
import { VirtualItem } from './types/virtual-item';
import { getScrollerLayout } from './selectors';

type PartialScroll = Partial<ScrollState>;
type Emits = {
  layout?: LayoutChangePayload;
  metrics?: ScrollMetrics;
};

export class ScrollPlugin extends BasePlugin<
  ScrollPluginConfig,
  ScrollCapability,
  ScrollState,
  ScrollAction
> {
  static readonly id = 'scroll' as const;
  private viewport: ViewportCapability;
  private strategy: BaseScrollStrategy;
  private strategyConfig: ScrollStrategyConfig;
  private currentScale: number = 1;
  private currentRotation: Rotation = Rotation.Degree0;
  private initialPage?: number;
  private currentPage: number = 1;
  private layoutReady: boolean = false;

  private readonly pageChangeState$ = createBehaviorEmitter<PageChangeState>();
  private readonly layout$ = createBehaviorEmitter<LayoutChangePayload>();
  private readonly scroll$ = createBehaviorEmitter<ScrollMetrics>();
  private readonly state$ = createBehaviorEmitter<ScrollState>();
  private readonly scrollerLayout$ = createBehaviorEmitter<ScrollerLayout>();
  private readonly pageChange$ = createBehaviorEmitter<PageChangePayload>();
  private readonly layoutReady$ = createBehaviorEmitter<boolean>();

  constructor(
    public readonly id: string,
    registry: PluginRegistry,
    private config?: ScrollPluginConfig,
  ) {
    super(id, registry);

    this.viewport = this.registry.getPlugin<ViewportPlugin>('viewport')!.provides();

    this.strategyConfig = {
      pageGap: this.config?.pageGap ?? 10,
      viewportGap: this.viewport.getViewportGap(),
      bufferSize: this.config?.bufferSize ?? 2,
    };

    this.strategy =
      this.config?.strategy === ScrollStrategy.Horizontal
        ? new HorizontalScrollStrategy(this.strategyConfig)
        : new VerticalScrollStrategy(this.strategyConfig);

    this.initialPage = this.config?.initialPage;
    this.currentScale = this.coreState.core.scale;
    this.currentRotation = this.coreState.core.rotation;
    // Subscribe to viewport scroll activity to detect when smooth scrolling ends
    this.viewport.onScrollActivity((activity) => {
      if (this.state.pageChangeState.isChanging && !activity.isSmoothScrolling) {
        // Smooth scrolling has ended
        this.completePageChange();
      }
    });
    // Subscribe to viewport and page manager events
    this.viewport.onViewportChange((vp) => this.commitMetrics(this.computeMetrics(vp)), {
      mode: 'throttle',
      wait: 100,
    });
    this.coreStore.onAction(SET_DOCUMENT, (_action, state) => {
      const totalPages = state.core.pages.length;
      this.dispatch(updateTotalPages(totalPages));
      this.pageChange$.emit({ pageNumber: this.currentPage, totalPages });
      this.refreshAll(getPagesWithRotatedSize(state.core), this.viewport.getMetrics());
    });
    this.coreStore.onAction(SET_ROTATION, (_action, state) =>
      this.refreshAll(getPagesWithRotatedSize(state.core), this.viewport.getMetrics()),
    );
    this.coreStore.onAction(SET_PAGES, (_action, state) =>
      this.refreshAll(getPagesWithRotatedSize(state.core), this.viewport.getMetrics()),
    );
  }

  private startPageChange(targetPage: number, behavior: ScrollBehavior = 'smooth') {
    const pageChangeState: PageChangeState = {
      isChanging: true,
      targetPage,
      fromPage: this.currentPage,
      startTime: Date.now(),
    };

    this.dispatch(setPageChangeState(pageChangeState));

    // For instant behavior, complete immediately
    if (behavior === 'instant') {
      // Use setTimeout to ensure the scroll happens first
      this.completePageChange();
    }
  }

  private completePageChange() {
    if (!this.state.pageChangeState.isChanging) return;

    const pageChangeState: PageChangeState = {
      isChanging: false,
      targetPage: this.state.pageChangeState.targetPage,
      fromPage: this.state.pageChangeState.fromPage,
      startTime: this.state.pageChangeState.startTime,
    };

    this.dispatch(setPageChangeState(pageChangeState));
  }

  /* ------------------------------------------------------------------ */
  /*  ᴄᴏᴍᴘᴜᴛᴇʀs                                                       */
  /* ------------------------------------------------------------------ */

  private computeLayout(pages: PdfPageObjectWithRotatedSize[][]) {
    const virtualItems = this.strategy.createVirtualItems(pages);
    const totalContentSize = this.strategy.getTotalContentSize(virtualItems);
    return { virtualItems, totalContentSize };
  }

  private computeMetrics(vp: ViewportMetrics, items: VirtualItem[] = this.state.virtualItems) {
    return this.strategy.handleScroll(vp, items, this.currentScale);
  }

  /* ------------------------------------------------------------------ */
  /*  ᴄᴏᴍᴍɪᴛ  (single source of truth)                                  */
  /* ------------------------------------------------------------------ */

  private commit(stateDelta: PartialScroll, emit?: Emits) {
    /* update Redux-like store */
    this.dispatch(updateScrollState(stateDelta));

    /* fire optional events */
    if (emit?.layout) this.layout$.emit(emit.layout);
    if (emit?.metrics) {
      this.scroll$.emit(emit.metrics);

      if (emit.metrics.currentPage !== this.currentPage) {
        this.currentPage = emit.metrics.currentPage;
        this.pageChange$.emit({ pageNumber: this.currentPage, totalPages: this.state.totalPages });
      }
    }

    /* keep scroller-layout reactive */
    this.scrollerLayout$.emit(this.getScrollerLayout());
  }

  /* convenience wrappers */
  private commitMetrics(metrics: ScrollMetrics) {
    this.commit(metrics, { metrics });
  }

  /* full re-compute after page-spread or initialisation */
  private refreshAll(pages: PdfPageObjectWithRotatedSize[][], vp: ViewportMetrics) {
    const layout = this.computeLayout(pages);
    const metrics = this.computeMetrics(vp, layout.virtualItems);

    this.commit({ ...layout, ...metrics }, { layout, metrics });
  }

  private getVirtualItemsFromState(): VirtualItem[] {
    return this.state.virtualItems || [];
  }

  public onScrollerData(callback: (layout: ScrollerLayout) => void): Unsubscribe {
    return this.scrollerLayout$.on(callback);
  }

  public getScrollerLayout(): ScrollerLayout {
    const scale = this.coreState.core.scale;
    return getScrollerLayout(this.state, scale);
  }

  private pushScrollLayout() {
    this.scrollerLayout$.emit(this.getScrollerLayout());
  }

  override onStoreUpdated(prevState: ScrollState, newState: ScrollState): void {
    this.pushScrollLayout();

    if (prevState.pageChangeState !== newState.pageChangeState) {
      this.pageChangeState$.emit(newState.pageChangeState);
    }
  }

  override onCoreStoreUpdated(
    prevState: StoreState<CoreState>,
    newState: StoreState<CoreState>,
  ): void {
    if (prevState.core.scale !== newState.core.scale) {
      this.currentScale = newState.core.scale;
      this.commitMetrics(this.computeMetrics(this.viewport.getMetrics()));
    }
    if (prevState.core.rotation !== newState.core.rotation) {
      this.currentRotation = newState.core.rotation;
    }
  }

  /**
   * Change the scroll strategy at runtime (e.g., vertical <-> horizontal)
   * @param newStrategy ScrollStrategy.Horizontal or ScrollStrategy.Vertical
   */
  private setScrollStrategy(newStrategy: ScrollStrategy) {
    // Only update if the strategy is actually changing
    if (
      (newStrategy === ScrollStrategy.Horizontal &&
        this.strategy instanceof HorizontalScrollStrategy) ||
      (newStrategy === ScrollStrategy.Vertical && this.strategy instanceof VerticalScrollStrategy)
    ) {
      return;
    }

    this.strategy =
      newStrategy === ScrollStrategy.Horizontal
        ? new HorizontalScrollStrategy(this.strategyConfig)
        : new VerticalScrollStrategy(this.strategyConfig);

    // Update state with new strategy
    this.dispatch(
      updateScrollState({
        strategy: newStrategy,
      }),
    );

    // Recalculate layout and scroll metrics
    const pages = getPagesWithRotatedSize(this.coreState.core);
    this.refreshAll(pages, this.viewport.getMetrics());
  }

  public setLayoutReady() {
    if (this.layoutReady) return;

    this.layoutReady = true;
    this.layoutReady$.emit(true);

    if (this.initialPage) {
      this.scrollToPage({ pageNumber: this.initialPage, behavior: 'instant' });
    }
  }

  protected buildCapability(): ScrollCapability {
    return {
      onStateChange: this.state$.on,
      onLayoutChange: this.layout$.on,
      onScroll: this.scroll$.on,
      onPageChange: this.pageChange$.on,
      onLayoutReady: this.layoutReady$.on,
      onPageChangeState: this.pageChangeState$.on,
      getCurrentPage: () => this.currentPage,
      getTotalPages: () => this.state.totalPages,
      getPageChangeState: () => this.state.pageChangeState,
      scrollToPage: this.scrollToPage.bind(this),
      scrollToNextPage: this.scrollToNextPage.bind(this),
      scrollToPreviousPage: this.scrollToPreviousPage.bind(this),
      getMetrics: this.getMetrics.bind(this),
      getLayout: this.getLayout.bind(this),
      getRectPositionForPage: this.getRectPositionForPage.bind(this),
      getPageGap: () => this.state.pageGap,
      setScrollStrategy: (strategy: ScrollStrategy) => this.setScrollStrategy(strategy),
    };
  }

  private scrollToPage(options: ScrollToPageOptions) {
    const { pageNumber, behavior = 'smooth', pageCoordinates, center = false } = options;
    this.startPageChange(pageNumber, behavior);
    const virtualItems = this.getVirtualItemsFromState();
    const position = this.strategy.getScrollPositionForPage(
      pageNumber,
      virtualItems,
      this.currentScale,
      this.currentRotation,
      pageCoordinates,
    );
    if (position) {
      this.viewport.scrollTo({ ...position, behavior, center });
    } else {
      // If we couldn't find the position, complete the page change immediately
      this.completePageChange();
    }
  }

  private scrollToNextPage(behavior: ScrollBehavior = 'smooth') {
    const virtualItems = this.getVirtualItemsFromState();
    const currentItemIndex = virtualItems.findIndex((item) =>
      item.pageNumbers.includes(this.currentPage),
    );
    if (currentItemIndex >= 0 && currentItemIndex < virtualItems.length - 1) {
      const nextItem = virtualItems[currentItemIndex + 1];
      const targetPage = nextItem.pageNumbers[0];
      this.startPageChange(targetPage, behavior);

      const position = this.strategy.getScrollPositionForPage(
        nextItem.pageNumbers[0],
        virtualItems,
        this.currentScale,
        this.currentRotation,
      );
      if (position) {
        this.viewport.scrollTo({ ...position, behavior });
      } else {
        // If we couldn't find the position, complete the page change immediately
        this.completePageChange();
      }
    }
  }

  private scrollToPreviousPage(behavior: ScrollBehavior = 'smooth') {
    const virtualItems = this.getVirtualItemsFromState();
    const currentItemIndex = virtualItems.findIndex((item) =>
      item.pageNumbers.includes(this.currentPage),
    );
    if (currentItemIndex > 0) {
      const prevItem = virtualItems[currentItemIndex - 1];
      const targetPage = prevItem.pageNumbers[0];
      this.startPageChange(targetPage, behavior);

      const position = this.strategy.getScrollPositionForPage(
        prevItem.pageNumbers[0],
        virtualItems,
        this.currentScale,
        this.currentRotation,
      );
      if (position) {
        this.viewport.scrollTo({ ...position, behavior });
      } else {
        // If we couldn't find the position, complete the page change immediately
        this.completePageChange();
      }
    }
  }

  private getMetrics(viewport?: ViewportMetrics): ScrollMetrics {
    const metrics = viewport || this.viewport.getMetrics();
    const virtualItems = this.getVirtualItemsFromState();
    return this.strategy.handleScroll(metrics, virtualItems, this.currentScale);
  }

  private getLayout(): LayoutChangePayload {
    return {
      virtualItems: this.state.virtualItems,
      totalContentSize: this.state.totalContentSize,
    };
  }

  private getRectPositionForPage(
    pageIndex: number,
    rect: Rect,
    scale?: number,
    rotation?: Rotation,
  ): Rect | null {
    return this.strategy.getRectPositionForPage(
      pageIndex + 1,
      this.state.virtualItems,
      scale ?? this.currentScale,
      rotation ?? this.currentRotation,
      rect,
    );
  }

  async initialize(): Promise<void> {
    // No DOM initialization needed; state drives rendering
  }

  async destroy(): Promise<void> {
    this.layout$.clear();
    this.scroll$.clear();
    this.pageChange$.clear();
    this.state$.clear();
    this.scrollerLayout$.clear();
    this.layoutReady$.clear();
    this.pageChangeState$.clear();
    super.destroy();
  }
}
