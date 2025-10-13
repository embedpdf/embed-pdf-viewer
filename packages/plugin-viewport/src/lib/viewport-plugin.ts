// packages/plugin-viewport/src/lib/viewport-plugin.ts

import {
  BasePlugin,
  PluginRegistry,
  createEmitter,
  createBehaviorEmitter,
  Listener,
} from '@embedpdf/core';
import { Rect } from '@embedpdf/models';

import {
  ViewportAction,
  initViewportState,
  cleanupViewportState,
  registerViewport,
  unregisterViewport,
  setViewportMetrics,
  setViewportScrollMetrics,
  setViewportGap,
  setScrollActivity,
  setSmoothScrollActivity,
} from './actions';
import {
  ViewportPluginConfig,
  ViewportState,
  ViewportCapability,
  ViewportScope,
  ViewportMetrics,
  ViewportScrollMetrics,
  ViewportInputMetrics,
  ScrollToPayload,
  ScrollActivity,
  ViewportEvent,
  ScrollActivityEvent,
  ScrollChangeEvent,
} from './types';

export class ViewportPlugin extends BasePlugin<
  ViewportPluginConfig,
  ViewportCapability,
  ViewportState,
  ViewportAction
> {
  static readonly id = 'viewport' as const;

  private readonly viewportResize$ = createBehaviorEmitter<ViewportEvent>();
  private readonly viewportMetrics$ = createBehaviorEmitter<ViewportEvent>();
  private readonly scrollMetrics$ = createBehaviorEmitter<ScrollChangeEvent>();
  private readonly scrollActivity$ = createBehaviorEmitter<ScrollActivityEvent>();

  // Scroll request emitters per document (persisted with state)
  private readonly scrollRequests$ = new Map<
    string,
    ReturnType<typeof createEmitter<ScrollToPayload>>
  >();

  // Rect providers per document (only for mounted viewports)
  private rectProviders = new Map<string, () => Rect>();

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

    this.scrollEndDelay = config.scrollEndDelay || 100;
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    // Initialize viewport state for this document
    this.dispatch(initViewportState(documentId));

    // Create scroll request emitter
    this.scrollRequests$.set(documentId, createEmitter<ScrollToPayload>());

    this.logger.debug(
      'ViewportPlugin',
      'DocumentOpened',
      `Initialized viewport state for document: ${documentId}`,
    );
  }

  protected override onDocumentClosed(documentId: string): void {
    // Cleanup viewport state
    this.dispatch(cleanupViewportState(documentId));

    // Cleanup scroll request emitter
    this.scrollRequests$.get(documentId)?.clear();
    this.scrollRequests$.delete(documentId);

    // Cleanup rect provider if exists
    this.rectProviders.delete(documentId);

    this.logger.debug(
      'ViewportPlugin',
      'DocumentClosed',
      `Cleaned up viewport state for document: ${documentId}`,
    );
  }

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): ViewportCapability {
    return {
      // Global
      getViewportGap: () => this.state.viewportGap,

      // Active document operations
      getMetrics: () => this.getMetrics(),
      scrollTo: (pos: ScrollToPayload) => this.scrollTo(pos),
      isScrolling: () => this.isScrolling(),
      isSmoothScrolling: () => this.isSmoothScrolling(),
      getBoundingRect: () => this.getBoundingRect(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createViewportScope(documentId),

      // Check if viewport is currently mounted
      isViewportMounted: (documentId: string) => this.state.activeViewports.has(documentId),

      // Events
      onViewportChange: this.viewportMetrics$.on,
      onViewportResize: this.viewportResize$.on,
      onScrollChange: this.scrollMetrics$.on,
      onScrollActivity: this.scrollActivity$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createViewportScope(documentId: string): ViewportScope {
    return {
      getMetrics: () => this.getMetrics(documentId),
      scrollTo: (pos: ScrollToPayload) => this.scrollTo(pos, documentId),
      isScrolling: () => this.isScrolling(documentId),
      isSmoothScrolling: () => this.isSmoothScrolling(documentId),
      getBoundingRect: () => this.getBoundingRect(documentId),
      onViewportChange: (listener: Listener<ViewportMetrics>) =>
        this.viewportMetrics$.on((event) => {
          if (event.documentId === documentId) listener(event.metrics);
        }),
      onScrollChange: (listener: Listener<ViewportScrollMetrics>) =>
        this.scrollMetrics$.on((event) => {
          if (event.documentId === documentId) listener(event.scrollMetrics);
        }),
      onScrollActivity: (listener: Listener<ScrollActivity>) =>
        this.scrollActivity$.on((event) => {
          if (event.documentId === documentId) listener(event.activity);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // Viewport Registration (Public API for components)
  // ─────────────────────────────────────────────────────────

  public registerViewport(documentId: string): void {
    // Check if state exists (document must be opened first)
    if (!this.state.documents[documentId]) {
      throw new Error(
        `Cannot register viewport for ${documentId}: document state not found. ` +
          `Document must be opened before registering viewport.`,
      );
    }

    // Mark as active/mounted
    if (!this.state.activeViewports.has(documentId)) {
      this.dispatch(registerViewport(documentId));

      this.logger.debug(
        'ViewportPlugin',
        'RegisterViewport',
        `Registered viewport (DOM mounted) for document: ${documentId}`,
      );
    }
  }

  public unregisterViewport(documentId: string): void {
    // Mark as inactive/unmounted (but preserve state!)
    if (this.state.activeViewports.has(documentId)) {
      this.dispatch(unregisterViewport(documentId));

      // Remove rect provider (DOM no longer exists)
      this.rectProviders.delete(documentId);

      this.logger.debug(
        'ViewportPlugin',
        'UnregisterViewport',
        `Unregistered viewport (DOM unmounted) for document: ${documentId}. State preserved.`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────
  // Per-Document Operations
  // ─────────────────────────────────────────────────────────

  public setViewportResizeMetrics(documentId: string, metrics: ViewportInputMetrics): void {
    this.dispatch(setViewportMetrics(documentId, metrics));

    const viewport = this.state.documents[documentId];
    if (viewport) {
      this.viewportResize$.emit({
        documentId,
        metrics: viewport.viewportMetrics,
      });
    }
  }

  public setViewportScrollMetrics(documentId: string, scrollMetrics: ViewportScrollMetrics): void {
    const viewport = this.state.documents[documentId];
    if (!viewport) return;

    if (
      scrollMetrics.scrollTop !== viewport.viewportMetrics.scrollTop ||
      scrollMetrics.scrollLeft !== viewport.viewportMetrics.scrollLeft
    ) {
      this.dispatch(setViewportScrollMetrics(documentId, scrollMetrics));
      this.bumpScrollActivity(documentId);

      this.scrollMetrics$.emit({
        documentId,
        scrollMetrics,
      });
    }
  }

  public onScrollRequest(documentId: string, listener: Listener<ScrollToPayload>) {
    const emitter = this.scrollRequests$.get(documentId);
    if (!emitter) {
      throw new Error(
        `Cannot subscribe to scroll requests for ${documentId}: ` +
          `document state not initialized`,
      );
    }
    return emitter.on(listener);
  }

  public registerBoundingRectProvider(documentId: string, provider: (() => Rect) | null): void {
    if (provider) {
      this.rectProviders.set(documentId, provider);
    } else {
      this.rectProviders.delete(documentId);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────

  private getActiveDocumentId(): string {
    const id = this.state.activeDocumentId ?? this.coreState.core.activeDocumentId;
    if (!id) throw new Error('No active document');
    return id;
  }

  private getViewportState(documentId?: string) {
    const id = documentId ?? this.getActiveDocumentId();
    const viewport = this.state.documents[id];
    if (!viewport) {
      throw new Error(`Viewport state not found for document: ${id}`);
    }
    return viewport;
  }

  private getMetrics(documentId?: string): ViewportMetrics {
    return this.getViewportState(documentId).viewportMetrics;
  }

  private isScrolling(documentId?: string): boolean {
    return this.getViewportState(documentId).isScrolling;
  }

  private isSmoothScrolling(documentId?: string): boolean {
    return this.getViewportState(documentId).isSmoothScrolling;
  }

  private getBoundingRect(documentId?: string): Rect {
    const id = documentId ?? this.getActiveDocumentId();
    const provider = this.rectProviders.get(id);

    return (
      provider?.() ?? {
        origin: { x: 0, y: 0 },
        size: { width: 0, height: 0 },
      }
    );
  }

  private scrollTo(pos: ScrollToPayload, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const viewport = this.getViewportState(id);
    const { x, y, center, behavior = 'auto' } = pos;

    if (behavior === 'smooth') {
      this.dispatch(setSmoothScrollActivity(id, true));
    }

    let finalX = x;
    let finalY = y;

    if (center) {
      const metrics = viewport.viewportMetrics;
      finalX = x - metrics.clientWidth / 2;
      finalY = y - metrics.clientHeight / 2;
    }

    const emitter = this.scrollRequests$.get(id);
    if (emitter) {
      emitter.emit({ x: finalX, y: finalY, behavior });
    }
  }

  private bumpScrollActivity(documentId: string): void {
    this.debouncedDispatch(setScrollActivity(documentId, false), this.scrollEndDelay);
    this.debouncedDispatch(setSmoothScrollActivity(documentId, false), this.scrollEndDelay);
  }

  // ─────────────────────────────────────────────────────────
  // State Change Handling
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(prevState: ViewportState, newState: ViewportState): void {
    // Emit viewport change events for each changed document
    for (const documentId in newState.documents) {
      const prevViewport = prevState.documents[documentId];
      const newViewport = newState.documents[documentId];

      if (prevViewport !== newViewport) {
        this.viewportMetrics$.emit({
          documentId,
          metrics: newViewport.viewportMetrics,
        });

        // Emit scroll activity when scrolling state changes
        if (
          prevViewport &&
          (prevViewport.isScrolling !== newViewport.isScrolling ||
            prevViewport.isSmoothScrolling !== newViewport.isSmoothScrolling)
        ) {
          this.scrollActivity$.emit({
            documentId,
            activity: {
              isScrolling: newViewport.isScrolling,
              isSmoothScrolling: newViewport.isSmoothScrolling,
            },
          });
        }
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(_config: ViewportPluginConfig) {
    this.logger.info('ViewportPlugin', 'Initialize', 'Viewport plugin initialized');
  }

  async destroy(): Promise<void> {
    // Clear all emitters
    this.viewportMetrics$.clear();
    this.viewportResize$.clear();
    this.scrollMetrics$.clear();
    this.scrollActivity$.clear();

    this.scrollRequests$.forEach((emitter) => emitter.clear());
    this.scrollRequests$.clear();
    this.rectProviders.clear();

    super.destroy();
  }
}
