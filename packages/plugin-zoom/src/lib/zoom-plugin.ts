import {
  BasePlugin,
  PluginRegistry,
  createEmitter,
  clamp,
  setScale,
  getPagesWithRotatedSize,
  createBehaviorEmitter,
  Listener,
} from '@embedpdf/core';
import { ScrollPlugin, ScrollCapability } from '@embedpdf/plugin-scroll';
import { ViewportPlugin, ViewportCapability, ViewportMetrics } from '@embedpdf/plugin-viewport';

import { initZoomState, cleanupZoomState, setZoomLevel, ZoomAction } from './actions';
import {
  ZoomPluginConfig,
  ZoomState,
  ZoomMode,
  Point,
  ZoomChangeEvent,
  ZoomCapability,
  ZoomPreset,
  ZoomRangeStep,
  VerticalZoomFocus,
  ZoomRequest,
  RegisterMarqueeOnPageOptions,
  ZoomScope,
  StateChangeEvent,
  ZoomDocumentState,
} from './types';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
} from '@embedpdf/plugin-interaction-manager';
import { Rect, rotateRect } from '@embedpdf/models';
import { createMarqueeHandler } from './handlers';
import { initialDocumentState } from './reducer';

export class ZoomPlugin extends BasePlugin<
  ZoomPluginConfig,
  ZoomCapability,
  ZoomState,
  ZoomAction
> {
  static readonly id = 'zoom' as const;

  private readonly zoom$ = createEmitter<ZoomChangeEvent>();
  private readonly state$ = createBehaviorEmitter<StateChangeEvent>();
  private readonly viewport: ViewportCapability;
  private readonly viewportPlugin: ViewportPlugin;
  private readonly scroll: ScrollCapability;
  private readonly interactionManager: InteractionManagerCapability | null;
  private readonly presets: ZoomPreset[];
  private readonly zoomRanges: ZoomRangeStep[];
  private readonly defaultZoomLevel: ZoomMode | number;

  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly zoomStep: number;

  constructor(id: string, registry: PluginRegistry, cfg: ZoomPluginConfig) {
    super(id, registry);

    this.viewportPlugin = registry.getPlugin<ViewportPlugin>('viewport')!;
    this.viewport = this.viewportPlugin.provides();
    this.scroll = registry.getPlugin<ScrollPlugin>('scroll')!.provides();
    const interactionManager = registry.getPlugin<InteractionManagerPlugin>('interaction-manager');
    this.interactionManager = interactionManager?.provides() ?? null;

    this.minZoom = cfg.minZoom ?? 0.25;
    this.maxZoom = cfg.maxZoom ?? 10;
    this.zoomStep = cfg.zoomStep ?? 0.1;
    this.defaultZoomLevel = cfg.defaultZoomLevel;
    this.presets = cfg.presets ?? [];
    this.zoomRanges = this.normalizeRanges(cfg.zoomRanges ?? []);

    // Keep automatic modes up to date per document
    this.viewport.onViewportResize(
      (event) => this.recalcAuto(event.documentId, VerticalZoomFocus.Top),
      { mode: 'debounce', wait: 150 },
    );

    // Register marquee zoom mode
    this.interactionManager?.registerMode({
      id: 'marqueeZoom',
      scope: 'page',
      exclusive: true,
      cursor: 'zoom-in',
    });
  }

  // ─────────────────────────────────────────────────────────
  // Document Lifecycle Hooks (from BasePlugin)
  // ─────────────────────────────────────────────────────────

  protected override onDocumentLoadingStarted(documentId: string): void {
    this.viewport.gate('zoom', documentId);
    // Initialize zoom state for this document
    const docState: ZoomDocumentState = {
      ...initialDocumentState,
      zoomLevel: this.defaultZoomLevel,
    };

    this.dispatch(initZoomState(documentId, docState));

    this.logger.debug(
      'ZoomPlugin',
      'DocumentOpened',
      `Initialized zoom state for document: ${documentId}`,
    );
  }

  protected override onDocumentLoaded(documentId: string): void {
    // Apply initial zoom after document is fully loaded
    this.recalcAuto(documentId, VerticalZoomFocus.Top);
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupZoomState(documentId));

    this.logger.debug(
      'ZoomPlugin',
      'DocumentClosed',
      `Cleaned up zoom state for document: ${documentId}`,
    );
  }

  protected override onRotationChanged(documentId: string): void {
    // Recalculate auto modes when rotation changes
    this.recalcAuto(documentId, VerticalZoomFocus.Top);
  }

  /*
  protected override onPagesChanged(documentId: string): void {
    // Recalculate auto modes when pages change
    this.recalcAuto(documentId, VerticalZoomFocus.Top);
  }*/

  // ─────────────────────────────────────────────────────────
  // Capability
  // ─────────────────────────────────────────────────────────

  protected buildCapability(): ZoomCapability {
    return {
      // Active document operations
      requestZoom: (level, c) => this.requestZoom(level, c),
      requestZoomBy: (d, c) => this.requestZoomBy(d, c),
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      zoomToArea: (pageIndex, rect) => this.zoomToArea(pageIndex, rect),
      enableMarqueeZoom: () => this.enableMarqueeZoom(),
      disableMarqueeZoom: () => this.disableMarqueeZoom(),
      toggleMarqueeZoom: () => this.toggleMarqueeZoom(),
      isMarqueeZoomActive: () => this.isMarqueeZoomActive(),
      getState: () => this.getDocumentStateOrThrow(),

      // Document-scoped operations
      forDocument: (documentId: string) => this.createZoomScope(documentId),

      // Global
      registerMarqueeOnPage: (opts) => this.registerMarqueeOnPage(opts),
      getPresets: () => this.presets,

      // Events
      onZoomChange: this.zoom$.on,
      onStateChange: this.state$.on,
    };
  }

  // ─────────────────────────────────────────────────────────
  // Document Scoping
  // ─────────────────────────────────────────────────────────

  private createZoomScope(documentId: string): ZoomScope {
    return {
      requestZoom: (level, c) => this.requestZoom(level, c, documentId),
      requestZoomBy: (d, c) => this.requestZoomBy(d, c, documentId),
      zoomIn: () => this.zoomIn(documentId),
      zoomOut: () => this.zoomOut(documentId),
      zoomToArea: (pageIndex, rect) => this.zoomToArea(pageIndex, rect, documentId),
      enableMarqueeZoom: () => this.enableMarqueeZoom(documentId),
      disableMarqueeZoom: () => this.disableMarqueeZoom(documentId),
      toggleMarqueeZoom: () => this.toggleMarqueeZoom(documentId),
      isMarqueeZoomActive: () => this.isMarqueeZoomActive(documentId),
      getState: () => this.getDocumentStateOrThrow(documentId),
      onZoomChange: (listener: Listener<ZoomChangeEvent>) =>
        this.zoom$.on((event) => {
          if (event.documentId === documentId) listener(event);
        }),
      onStateChange: (listener: Listener<ZoomDocumentState>) =>
        this.state$.on((event) => {
          if (event.documentId === documentId) listener(event.state);
        }),
    };
  }

  // ─────────────────────────────────────────────────────────
  // State Helpers
  // ─────────────────────────────────────────────────────────

  private getActiveDocumentId(): string {
    const id = this.state.activeDocumentId ?? this.coreState.core.activeDocumentId;
    if (!id) throw new Error('No active document');
    return id;
  }

  private getDocumentState(documentId?: string): ZoomDocumentState | null {
    const id = documentId ?? this.getActiveDocumentId();
    return this.state.documents[id] ?? null;
  }

  private getDocumentStateOrThrow(documentId?: string): ZoomDocumentState {
    const state = this.getDocumentState(documentId);
    if (!state) {
      throw new Error(`Zoom state not found for document: ${documentId ?? 'active'}`);
    }
    return state;
  }

  // ─────────────────────────────────────────────────────────
  // Core Operations
  // ─────────────────────────────────────────────────────────

  private requestZoom(level: ZoomMode | number, center?: Point, documentId?: string): void {
    this.handleRequest({ level, center }, documentId);
  }

  private requestZoomBy(delta: number, center?: Point, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const cur = docState.currentZoomLevel;
    const target = this.toZoom(cur + delta);
    this.handleRequest({ level: target, center }, id);
  }

  private zoomIn(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const cur = docState.currentZoomLevel;
    this.handleRequest({ level: cur, delta: this.stepFor(cur) }, id);
  }

  private zoomOut(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const cur = docState.currentZoomLevel;
    this.handleRequest({ level: cur, delta: -this.stepFor(cur) }, id);
  }

  private zoomToArea(pageIndex: number, rect: Rect, documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.handleZoomToArea(id, pageIndex, rect);
  }

  private enableMarqueeZoom(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.interactionManager?.forDocument(id).activate('marqueeZoom');
  }

  private disableMarqueeZoom(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    this.interactionManager?.forDocument(id).activateDefaultMode();
  }

  private toggleMarqueeZoom(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const scope = this.interactionManager?.forDocument(id);
    if (scope?.getActiveMode() === 'marqueeZoom') {
      scope.activateDefaultMode();
    } else {
      scope?.activate('marqueeZoom');
    }
  }

  private isMarqueeZoomActive(documentId?: string): boolean {
    const id = documentId ?? this.getActiveDocumentId();
    return this.interactionManager?.forDocument(id).getActiveMode() === 'marqueeZoom';
  }

  // ─────────────────────────────────────────────────────────
  // Main Zoom Logic
  // ─────────────────────────────────────────────────────────

  private handleRequest(
    { level, delta = 0, center, focus = VerticalZoomFocus.Center, align = 'keep' }: ZoomRequest,
    documentId?: string,
  ) {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const coreDoc = this.coreState.core.documents[id];
    if (!coreDoc) return;

    const viewport = this.viewport.forDocument(id);
    const metrics = viewport.getMetrics();
    const oldZoom = docState.currentZoomLevel;

    if (metrics.clientWidth === 0 || metrics.clientHeight === 0) {
      return;
    }

    // Step 1: Resolve target numeric zoom
    const base = typeof level === 'number' ? level : this.computeZoomForMode(id, level, metrics);

    if (base === false) return;

    const exactZoom = clamp(base + delta, this.minZoom, this.maxZoom);
    const newZoom = Math.floor(exactZoom * 100) / 100;

    // Step 2: Figure out viewport point to keep under focus
    const focusPoint: Point = center ?? {
      vx: metrics.clientWidth / 2,
      vy: focus === VerticalZoomFocus.Top ? 0 : metrics.clientHeight / 2,
    };

    // Step 3: Compute desired scroll offsets
    const { desiredScrollLeft, desiredScrollTop } = this.computeScrollForZoomChange(
      id,
      metrics,
      oldZoom,
      newZoom,
      focusPoint,
      align,
    );

    // Step 4: Dispatch and notify
    if (!isNaN(desiredScrollLeft) && !isNaN(desiredScrollTop)) {
      this.viewportPlugin.setViewportScrollMetrics(id, {
        scrollLeft: desiredScrollLeft,
        scrollTop: desiredScrollTop,
      });
    }

    this.dispatch(setZoomLevel(id, typeof level === 'number' ? newZoom : level, newZoom));
    this.dispatchCoreAction(setScale(newZoom, id));
    if (this.viewport.isGated(id)) {
      this.viewport.releaseGate('zoom', id);
    }

    viewport.scrollTo({
      x: desiredScrollLeft,
      y: desiredScrollTop,
      behavior: 'instant',
    });

    const evt: ZoomChangeEvent = {
      documentId: id,
      oldZoom,
      newZoom,
      level,
      center: focusPoint,
      desiredScrollLeft,
      desiredScrollTop,
      viewport: metrics,
    };

    this.zoom$.emit(evt);
  }

  private computeZoomForMode(
    documentId: string,
    mode: ZoomMode,
    vp: ViewportMetrics,
  ): number | false {
    const coreDoc = this.coreState.core.documents[documentId];
    if (!coreDoc) return false;

    const spreads = getPagesWithRotatedSize(coreDoc);
    if (!spreads.length) return false;

    const scrollScope = this.scroll.forDocument(documentId);
    const pgGap = scrollScope ? this.scroll.getPageGap() : 0;
    const vpGap = this.viewport.getViewportGap();

    if (vp.clientWidth === 0 || vp.clientHeight === 0) return false;

    const availableWidth = vp.clientWidth - 2 * vpGap;
    const availableHeight = vp.clientHeight - 2 * vpGap;

    if (availableWidth <= 0 || availableHeight <= 0) return false;

    let maxContentW = 0,
      maxContentH = 0;

    spreads.forEach((spread) => {
      const contentW = spread.reduce((s, p, i) => s + p.rotatedSize.width + (i ? pgGap : 0), 0);
      const contentH = Math.max(...spread.map((p) => p.rotatedSize.height));
      maxContentW = Math.max(maxContentW, contentW);
      maxContentH = Math.max(maxContentH, contentH);
    });

    switch (mode) {
      case ZoomMode.FitWidth:
        return availableWidth / maxContentW;
      case ZoomMode.FitPage:
        return Math.min(availableWidth / maxContentW, availableHeight / maxContentH);
      case ZoomMode.Automatic:
        return Math.min(availableWidth / maxContentW, 1);
      default:
        return 1;
    }
  }

  private computeScrollForZoomChange(
    documentId: string,
    vp: ViewportMetrics,
    oldZoom: number,
    newZoom: number,
    focus: Point,
    align: 'keep' | 'center' = 'keep',
  ) {
    const scrollScope = this.scroll.forDocument(documentId);
    const layout = scrollScope.getLayout();
    const vpGap = this.viewport.getViewportGap();

    const contentW = layout.totalContentSize.width;
    const contentH = layout.totalContentSize.height;

    const availableWidth = vp.clientWidth - 2 * vpGap;
    const availableHeight = vp.clientHeight - 2 * vpGap;

    const off = (availableSpace: number, cw: number, zoom: number) =>
      cw * zoom < availableSpace ? (availableSpace - cw * zoom) / 2 : 0;

    const offXold = off(availableWidth, contentW, oldZoom);
    const offYold = off(availableHeight, contentH, oldZoom);

    const offXnew = off(availableWidth, contentW, newZoom);
    const offYnew = off(availableHeight, contentH, newZoom);

    const cx = (vp.scrollLeft + focus.vx - vpGap - offXold) / oldZoom;
    const cy = (vp.scrollTop + focus.vy - vpGap - offYold) / oldZoom;

    const baseLeft = cx * newZoom + vpGap + offXnew;
    const baseTop = cy * newZoom + vpGap + offYnew;

    const desiredScrollLeft =
      align === 'center' ? baseLeft - vp.clientWidth / 2 : baseLeft - focus.vx;
    const desiredScrollTop =
      align === 'center' ? baseTop - vp.clientHeight / 2 : baseTop - focus.vy;

    return {
      desiredScrollLeft: Math.max(0, desiredScrollLeft),
      desiredScrollTop: Math.max(0, desiredScrollTop),
    };
  }

  private handleZoomToArea(documentId: string, pageIndex: number, rect: Rect) {
    const coreDoc = this.coreState.core.documents[documentId];
    if (!coreDoc) return;

    const rotation = coreDoc.rotation;
    const viewport = this.viewport.forDocument(documentId);
    const vp = viewport.getMetrics();
    const vpGap = this.viewport.getViewportGap();
    const docState = this.getDocumentStateOrThrow(documentId);
    const oldZ = docState.currentZoomLevel;

    const availableW = vp.clientWidth - 2 * vpGap;
    const availableH = vp.clientHeight - 2 * vpGap;

    const scrollScope = this.scroll.forDocument(documentId);
    const layout = scrollScope.getLayout();

    const vItem = layout.virtualItems.find((it) =>
      it.pageLayouts.some((p) => p.pageIndex === pageIndex),
    );
    if (!vItem) return;

    const pageRel = vItem.pageLayouts.find((p) => p.pageIndex === pageIndex)!;

    const rotatedRect = rotateRect(
      { width: pageRel.width, height: pageRel.height },
      rect,
      rotation,
    );

    const targetZoom = this.toZoom(
      Math.min(availableW / rotatedRect.size.width, availableH / rotatedRect.size.height),
    );

    const pageAbsX = vItem.x + pageRel.x;
    const pageAbsY = vItem.y + pageRel.y;

    const cxContent = pageAbsX + rotatedRect.origin.x + rotatedRect.size.width / 2;
    const cyContent = pageAbsY + rotatedRect.origin.y + rotatedRect.size.height / 2;

    const off = (avail: number, cw: number, z: number) =>
      cw * z < avail ? (avail - cw * z) / 2 : 0;

    const offXold = off(availableW, layout.totalContentSize.width, oldZ);
    const offYold = off(availableH, layout.totalContentSize.height, oldZ);

    const centerVX = vpGap + offXold + cxContent * oldZ - vp.scrollLeft;
    const centerVY = vpGap + offYold + cyContent * oldZ - vp.scrollTop;

    this.handleRequest(
      {
        level: targetZoom,
        center: { vx: centerVX, vy: centerVY },
        align: 'center',
      },
      documentId,
    );
  }

  private recalcAuto(documentId: string, focus?: VerticalZoomFocus) {
    const docState = this.getDocumentState(documentId);
    if (!docState) return;

    if (
      docState.zoomLevel === ZoomMode.Automatic ||
      docState.zoomLevel === ZoomMode.FitPage ||
      docState.zoomLevel === ZoomMode.FitWidth
    ) {
      this.handleRequest({ level: docState.zoomLevel, focus }, documentId);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────

  private normalizeRanges(ranges: ZoomRangeStep[]): ZoomRangeStep[] {
    return [...ranges].filter((r) => r.step > 0 && r.max > r.min).sort((a, b) => a.min - b.min);
  }

  private stepFor(zoom: number): number {
    const r = this.zoomRanges.find((r) => zoom >= r.min && zoom < r.max);
    return r ? r.step : this.zoomStep;
  }

  private toZoom(v: number) {
    return parseFloat(clamp(v, this.minZoom, this.maxZoom).toFixed(2));
  }

  // ─────────────────────────────────────────────────────────
  // Marquee Zoom
  // ─────────────────────────────────────────────────────────

  public registerMarqueeOnPage(opts: RegisterMarqueeOnPageOptions) {
    if (!this.interactionManager) {
      this.logger.warn(
        'ZoomPlugin',
        'MissingDependency',
        'Interaction manager plugin not loaded, marquee zoom disabled',
      );
      return () => {};
    }

    const coreDoc = this.coreState.core.documents[opts.documentId];
    if (!coreDoc || !coreDoc.document) {
      this.logger.warn('ZoomPlugin', 'DocumentNotFound', 'Document not found');
      return () => {};
    }

    const page = coreDoc.document.pages[opts.pageIndex];
    if (!page) {
      this.logger.warn('ZoomPlugin', 'PageNotFound', `Page ${opts.pageIndex} not found`);
      return () => {};
    }

    const handlers = createMarqueeHandler({
      pageSize: page.size,
      scale: opts.scale,
      onPreview: opts.callback.onPreview,
      onCommit: (rect) => {
        this.zoomToArea(opts.pageIndex, rect, opts.documentId);
        opts.callback.onCommit?.(rect);
      },
      onSmallDrag: () => {
        this.zoomIn(opts.documentId);
        opts.callback.onSmallDrag?.();
      },
    });

    const off = this.interactionManager.registerHandlers({
      documentId: opts.documentId,
      modeId: 'marqueeZoom',
      handlers,
      pageIndex: opts.pageIndex,
    });

    return off;
  }

  // ─────────────────────────────────────────────────────────
  // Store Update Handlers
  // ─────────────────────────────────────────────────────────

  override onStoreUpdated(prevState: ZoomState, newState: ZoomState): void {
    // Emit state changes for each changed document
    for (const documentId in newState.documents) {
      const prevDoc = prevState.documents[documentId];
      const newDoc = newState.documents[documentId];

      if (
        prevDoc &&
        newDoc &&
        (prevDoc.currentZoomLevel !== newDoc.currentZoomLevel ||
          prevDoc.zoomLevel !== newDoc.zoomLevel)
      ) {
        this.state$.emit({
          documentId,
          state: newDoc,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    this.logger.info('ZoomPlugin', 'Initialize', 'Zoom plugin initialized');
  }

  async destroy() {
    this.zoom$.clear();
    this.state$.clear();
    super.destroy();
  }
}
