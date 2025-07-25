import {
  BasePlugin,
  PluginRegistry,
  createEmitter,
  createBehaviorEmitter,
  Listener,
  EventListener,
} from '@embedpdf/core';

import {
  ViewportAction,
  setViewportMetrics,
  setViewportScrollMetrics,
  setViewportGap,
  setScrollActivity,
} from './actions';
import {
  ViewportPluginConfig,
  ViewportState,
  ViewportCapability,
  ViewportMetrics,
  ViewportScrollMetrics,
  ViewportInputMetrics,
  ScrollToPayload,
} from './types';
import { Rect } from '@embedpdf/models';

export class ViewportPlugin extends BasePlugin<
  ViewportPluginConfig,
  ViewportCapability,
  ViewportState,
  ViewportAction
> {
  static readonly id = 'viewport' as const;

  private readonly viewportResize$ = createBehaviorEmitter<ViewportMetrics>();
  private readonly viewportMetrics$ = createBehaviorEmitter<ViewportMetrics>();
  private readonly scrollMetrics$ = createBehaviorEmitter<ViewportScrollMetrics>();
  private readonly scrollReq$ = createEmitter<{
    x: number;
    y: number;
    behavior?: ScrollBehavior;
  }>();
  private readonly scrollActivity$ = createBehaviorEmitter<boolean>();

  /* ------------------------------------------------------------------ */
  /* “live rect” infrastructure                                          */
  /* ------------------------------------------------------------------ */
  private rectProvider: (() => Rect) | null = null;

  private scrollEndTimer?: number;
  private readonly scrollEndDelay: number;

  constructor(
    public readonly id: string,
    registry: PluginRegistry,
    config: ViewportPluginConfig,
  ) {
    super(id, registry);

    if (config.viewportGap) {
      this.dispatch(setViewportGap(config.viewportGap));
    }

    this.scrollEndDelay = config.scrollEndDelay || 300;
  }

  protected buildCapability(): ViewportCapability {
    return {
      getViewportGap: () => this.state.viewportGap,
      getMetrics: () => this.state.viewportMetrics,
      getBoundingRect: (): Rect =>
        this.rectProvider?.() ?? {
          origin: { x: 0, y: 0 },
          size: { width: 0, height: 0 },
        },
      scrollTo: (pos: ScrollToPayload) => this.scrollTo(pos),
      isScrolling: () => this.state.isScrolling,
      onScrollChange: this.scrollMetrics$.on,
      onViewportChange: this.viewportMetrics$.on,
      onViewportResize: this.viewportResize$.on,
      onScrollActivity: this.scrollActivity$.on,
    };
  }

  public setViewportResizeMetrics(viewportMetrics: ViewportInputMetrics) {
    this.dispatch(setViewportMetrics(viewportMetrics));
    this.viewportResize$.emit(this.state.viewportMetrics);
  }

  public setViewportScrollMetrics(scrollMetrics: ViewportScrollMetrics) {
    if (
      scrollMetrics.scrollTop !== this.state.viewportMetrics.scrollTop ||
      scrollMetrics.scrollLeft !== this.state.viewportMetrics.scrollLeft
    ) {
      this.dispatch(setViewportScrollMetrics(scrollMetrics));
      this.bumpScrollActivity();
      this.scrollMetrics$.emit({
        scrollTop: scrollMetrics.scrollTop,
        scrollLeft: scrollMetrics.scrollLeft,
      });
    }
  }

  public onScrollRequest(listener: Listener<ScrollToPayload>) {
    return this.scrollReq$.on(listener);
  }

  public registerBoundingRectProvider(provider: (() => Rect) | null) {
    this.rectProvider = provider;
  }

  private bumpScrollActivity() {
    this.debouncedDispatch(setScrollActivity(false), this.scrollEndDelay);
  }

  private scrollTo(pos: ScrollToPayload) {
    const { x, y, center, behavior = 'auto' } = pos;

    if (center) {
      const metrics = this.state.viewportMetrics;
      // Calculate the centered position by adding half the viewport dimensions
      const centeredX = x - metrics.clientWidth / 2;
      const centeredY = y - metrics.clientHeight / 2;

      this.scrollReq$.emit({
        x: centeredX,
        y: centeredY,
        behavior,
      });
    } else {
      this.scrollReq$.emit({
        x,
        y,
        behavior,
      });
    }
  }

  // Subscribe to store changes to notify onViewportChange
  override onStoreUpdated(prevState: ViewportState, newState: ViewportState): void {
    if (prevState !== newState) {
      this.viewportMetrics$.emit(newState.viewportMetrics);
      if (prevState.isScrolling !== newState.isScrolling) {
        this.scrollActivity$.emit(newState.isScrolling);
      }
    }
  }

  async initialize(_config: ViewportPluginConfig) {
    // No initialization needed
  }

  async destroy(): Promise<void> {
    super.destroy();
    // Clear out any handlers
    this.viewportMetrics$.clear();
    this.viewportResize$.clear();
    this.scrollMetrics$.clear();
    this.scrollReq$.clear();
    this.scrollActivity$.clear();
    this.rectProvider = null;
    if (this.scrollEndTimer) clearTimeout(this.scrollEndTimer);
  }
}
