import {
  BasePlugin,
  PluginRegistry,
  createEmitter,
  clamp,
  setScale,
  createBehaviorEmitter,
  Listener,
} from '@embedpdf/core';
import { ScrollPlugin, ScrollCapability } from '@embedpdf/plugin-scroll';
import { ViewportPlugin, ViewportCapability, ViewportMetrics } from '@embedpdf/plugin-viewport';

import {
  initZoomState,
  cleanupZoomState,
  setZoomLevel,
  ZoomAction,
  setMarqueeZoomActive,
} from './actions';
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
import { SpreadCapability, SpreadPlugin } from '@embedpdf/plugin-spread';
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
  private readonly spread: SpreadCapability | null;
  private readonly presets: ZoomPreset[];
  private readonly zoomRanges: ZoomRangeStep[];
  private readonly defaultZoomLevel: ZoomMode | number;

  private readonly minZoom: number;
  private readonly maxZoom: number;
  private readonly zoomStep: number;
  private readonly usePhysicalScaling: boolean;
  // 1 CSS inch = 96 px, 1 PDF point = 1/72 inch → 1 pt = 96/72 CSS px.
  private static readonly PT_TO_CSS_PX = 96 / 72;

  // Active matchMedia query + listener — stored so destroy() can tear them down.
  private dprMql: MediaQueryList | null = null;
  private dprMqlListener: (() => void) | null = null;
  private dprDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(id: string, registry: PluginRegistry, cfg: ZoomPluginConfig) {
    super(id, registry);

    this.viewportPlugin = registry.getPlugin<ViewportPlugin>('viewport')!;
    this.viewport = this.viewportPlugin.provides();
    this.scroll = registry.getPlugin<ScrollPlugin>('scroll')!.provides();
    const interactionManager = registry.getPlugin<InteractionManagerPlugin>('interaction-manager');
    this.interactionManager = interactionManager?.provides() ?? null;
    const spread = registry.getPlugin<SpreadPlugin>('spread');
    this.spread = spread?.provides() ?? null;

    this.minZoom = cfg.minZoom ?? 0.25;
    this.maxZoom = cfg.maxZoom ?? 10;
    this.zoomStep = cfg.zoomStep ?? 0.1;
    this.defaultZoomLevel = cfg.defaultZoomLevel;
    this.presets = cfg.presets ?? [];
    this.zoomRanges = this.normalizeRanges(cfg.zoomRanges ?? []);
    this.usePhysicalScaling = cfg.usePhysicalScaling ?? false;

    // Set up DPR change listener when usePhysicalScaling is enabled.
    // matchMedia fires once per threshold, so we re-subscribe after each change.
    // The fan-out is debounced (150 ms, matching viewport-resize) to avoid burst
    // recalculations during display-scaling animations.
    if (this.usePhysicalScaling && typeof window !== 'undefined') {
      const onDprChange = () => {
        if (this.dprDebounceTimer !== null) clearTimeout(this.dprDebounceTimer);
        this.dprDebounceTimer = setTimeout(() => {
          this.dprDebounceTimer = null;
          for (const id of Object.keys(this.state.documents)) {
            this.handleRequest({ level: this.state.documents[id].zoomLevel }, id);
          }
        }, 150);
      };
      const subscribe = () => {
        // Explicitly remove the previous listener before overwriting the stored
        // references — safe even if it already auto-removed via { once: true }.
        const prevMql = this.dprMql;
        const prevListener = this.dprMqlListener;
        this.dprMql = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
        const listener = () => {
          onDprChange();
          subscribe();
        };
        this.dprMqlListener = listener;
        this.dprMql.addEventListener('change', listener, { once: true });
        prevMql?.removeEventListener('change', prevListener!);
      };
      subscribe();
    }

    // Keep automatic modes up to date per document
    this.viewport.onViewportResize(
      (event) => this.recalcAuto(event.documentId, VerticalZoomFocus.Top),
      {
        mode: 'debounce',
        wait: 150,
        keyExtractor: (event) => event.documentId,
      },
    );

    // Subscribe to spread changes
    this.spread?.onSpreadChange((event) => {
      this.recalcAuto(event.documentId, VerticalZoomFocus.Top);
    });

    // Register marquee zoom mode
    this.interactionManager?.registerMode({
      id: 'marqueeZoom',
      scope: 'page',
      exclusive: true,
      cursor: 'zoom-in',
    });

    this.interactionManager?.onModeChange((state) => {
      // Track marquee zoom state changes for this document
      const isMarqueeActive = state.activeMode === 'marqueeZoom';
      const docState = this.getDocumentState(state.documentId);

      // Only dispatch if state actually changed
      if (docState && docState.isMarqueeZoomActive !== isMarqueeActive) {
        this.dispatch(setMarqueeZoomActive(state.documentId, isMarqueeActive));
      }
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
      getDpr: () => this.getDpr(),

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
      getDpr: () => this.getDpr(),
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
  // DPR Helper
  // ─────────────────────────────────────────────────────────

  private getDpr(): number {
    if (!this.usePhysicalScaling) return 1;
    if (typeof window === 'undefined') return 1;
    return ZoomPlugin.PT_TO_CSS_PX * (window.devicePixelRatio || 1);
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
    const curUser = docState.currentUserZoomLevel;
    const target = this.toZoom(curUser + delta);
    this.handleRequest({ level: target, center }, id);
  }

  private zoomIn(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const curUser = docState.currentUserZoomLevel;
    this.handleRequest({ level: curUser, delta: this.stepFor(curUser) }, id);
  }

  private zoomOut(documentId?: string): void {
    const id = documentId ?? this.getActiveDocumentId();
    const docState = this.getDocumentStateOrThrow(id);
    const curUser = docState.currentUserZoomLevel;
    this.handleRequest({ level: curUser, delta: -this.stepFor(curUser) }, id);
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

    // Step 1: Resolve target numeric zoom, splitting user-space from effective scale.
    const dpr = this.getDpr();
    let newEffective: number;
    let newUser: number;

    if (typeof level === 'number') {
      // Numeric path: input is user-space, clamped in user-space, then scaled by DPR for effective.
      // Quantise user first, then derive effective from the already-quantised value so that
      // newEffective === newUser * dpr exactly (within the 0.001 precision floor).
      const userBase = clamp(level + delta, this.minZoom, this.maxZoom);
      newUser = Math.floor(userBase * 1000) / 1000;
      newEffective = Math.floor(newUser * dpr * 1000) / 1000;
    } else {
      // Mode path: computeZoomForMode returns effective scale directly (fits viewport).
      // delta on the mode path is unused in current callers (always 0) but we handle
      // it symmetrically: treat delta as user-space, scale by dpr.
      const modeBase = this.computeZoomForMode(id, level, metrics);
      if (modeBase === false) return;
      const effectiveBase = modeBase + delta * dpr;
      newEffective = Math.floor(
        clamp(effectiveBase, this.minZoom * dpr, this.maxZoom * dpr) * 1000,
      ) / 1000;
      newUser = Math.floor((newEffective / dpr) * 1000) / 1000;
    }

    // Step 2: Figure out viewport point to keep under focus
    const focusPoint: Point = center ?? {
      vx: metrics.clientWidth / 2,
      vy: focus === VerticalZoomFocus.Top ? 0 : metrics.clientHeight / 2,
    };

    // Step 3: Compute desired scroll offsets (uses effective scale throughout)
    const { desiredScrollLeft, desiredScrollTop } = this.computeScrollForZoomChange(
      id,
      metrics,
      oldZoom,
      newEffective,
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

    // zoomLevel stores:
    //   - numeric requests: user-space value (so preset "100%" comparisons work on Retina)
    //   - mode requests: the mode string (unchanged)
    this.dispatch(
      setZoomLevel(
        id,
        typeof level === 'number' ? newUser : level,
        newEffective,
        newUser,
      ),
    );
    this.dispatchCoreAction(setScale(newEffective, id));
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
      newZoom: newEffective,
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

    const scrollScope = this.scroll.forDocument(documentId);
    const pgGap = scrollScope ? this.scroll.getPageGap() : 0;
    const vpGap = this.viewport.getViewportGap();

    const spreads = scrollScope.getSpreadPagesWithRotatedSize();
    if (!spreads.length) return false;

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

    // The viewport-fit ratio is an effective scale. Clamp it in effective space
    // (against minZoom*dpr / maxZoom*dpr) so that the full user-space range is
    // reachable, then convert to user-space for handleRequest.
    const dpr = this.getDpr();
    const rawFit = Math.min(
      availableW / rotatedRect.size.width,
      availableH / rotatedRect.size.height,
    );
    const targetUser = Math.floor(
      clamp(rawFit, this.minZoom * dpr, this.maxZoom * dpr) / dpr * 1000,
    ) / 1000;

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
        level: targetUser,
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
          prevDoc.currentUserZoomLevel !== newDoc.currentUserZoomLevel ||
          prevDoc.zoomLevel !== newDoc.zoomLevel ||
          prevDoc.isMarqueeZoomActive !== newDoc.isMarqueeZoomActive)
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
    // Remove the DPR change listener to avoid orphaned listeners on hot-reload.
    if (this.dprMql && this.dprMqlListener) {
      this.dprMql.removeEventListener('change', this.dprMqlListener);
      this.dprMql = null;
      this.dprMqlListener = null;
    }
    // Clear the debounce timer so no post-destroy dispatches occur.
    if (this.dprDebounceTimer !== null) {
      clearTimeout(this.dprDebounceTimer);
      this.dprDebounceTimer = null;
    }
    this.zoom$.clear();
    this.state$.clear();
    super.destroy();
  }
}
