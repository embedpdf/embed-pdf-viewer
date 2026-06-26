import {
  BasePlugin,
  Listener,
  PluginRegistry,
  REFRESH_PAGES,
  createScopedEmitter,
} from '@embedpdf/core';
import {
  PdfPageGeometry,
  Rect,
  PdfTask,
  PdfTaskHelper,
  PdfErrorCode,
  PdfErrorReason,
  PdfPermissionFlag,
  ignore,
  PageTextSlice,
  Task,
  Position,
} from '@embedpdf/models';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
  PointerEventHandlersWithLifecycle,
  EmbedPdfPointerEvent,
} from '@embedpdf/plugin-interaction-manager';
import { ViewportCapability, ViewportMetrics, ViewportPlugin } from '@embedpdf/plugin-viewport';
import { ScrollCapability, ScrollPlugin } from '@embedpdf/plugin-scroll';

import {
  cachePageGeometry,
  evictPageGeometry,
  setSelection,
  SelectionAction,
  endSelection,
  startSelection,
  clearSelection,
  setRects,
  setSlices,
  initSelectionState,
  cleanupSelectionState,
} from './actions';
import { initialSelectionDocumentState } from './reducer';
import * as selector from './selectors';
import {
  SelectionCapability,
  SelectionPluginConfig,
  SelectionRangeX,
  GlyphPointer,
  SelectionState,
  RegisterSelectionOnPageOptions,
  RegisterMarqueeOnPageOptions,
  SelectionRectsCallback,
  SelectionScope,
  SelectionChangeEvent,
  TextRetrievedEvent,
  CopyToClipboardEvent,
  BeginSelectionEvent,
  EndSelectionEvent,
  SelectionDocumentState,
  SelectionMenuPlacement,
  SelectionMenuPlacementEvent,
  EnableForModeOptions,
  MarqueeChangeEvent,
  MarqueeEndEvent,
  MarqueeScopeEvent,
  MarqueeEndScopeEvent,
  EmptySpaceClickEvent,
  EmptySpaceClickScopeEvent,
} from './types';
import { sliceBounds, rectsWithinSlice, expandToWordBoundary, expandToLineBoundary } from './utils';
import { createTextSelectionHandler } from './handlers/text-selection.handler';
import { createMarqueeSelectionHandler } from './handlers/marquee-selection.handler';

export class SelectionPlugin extends BasePlugin<
  SelectionPluginConfig,
  SelectionCapability,
  SelectionState,
  SelectionAction
> {
  static readonly id = 'selection' as const;

  /** Modes that should trigger text-selection logic, per document (mode -> config) */
  private enabledModesPerDoc = new Map<string, Map<string, EnableForModeOptions>>();

  /* interactive state, per document */
  private selecting = new Map<string, boolean>();
  private anchor = new Map<string, { page: number; index: number } | undefined>();

  /** Whether the text handler has a pending anchor (before drag threshold is met) */
  private hasTextAnchor = new Map<string, boolean>();

  /** Tracks the page a marquee drag started on, per document */
  private marqueePage = new Map<string, number>();

  /** Page callbacks for rect updates, per document */
  private pageCallbacks = new Map<string, Map<number, (data: SelectionRectsCallback) => void>>();

  /** LRU access order for geometry cache, per document (oldest first) */
  private geoAccessOrder = new Map<string, number[]>();

  private readonly menuPlacement$ = createScopedEmitter<
    SelectionMenuPlacement | null,
    SelectionMenuPlacementEvent,
    string
  >((documentId, placement) => ({ documentId, placement }));
  private readonly selChange$ = createScopedEmitter<
    SelectionRangeX | null,
    SelectionChangeEvent,
    string
  >((documentId, selection) => ({
    documentId,
    selection,
    modeId: this.interactionManagerCapability.forDocument(documentId).getActiveMode(),
  }));
  private readonly textRetrieved$ = createScopedEmitter<string[], TextRetrievedEvent, string>(
    (documentId, text) => ({ documentId, text }),
  );
  private readonly copyToClipboard$ = createScopedEmitter<string, CopyToClipboardEvent, string>(
    (documentId, text) => ({ documentId, text }),
    { cache: false },
  );
  private readonly beginSelection$ = createScopedEmitter<
    { page: number; index: number; modeId: string },
    BeginSelectionEvent,
    string
  >(
    (documentId, data) => ({
      documentId,
      page: data.page,
      index: data.index,
      modeId: data.modeId,
    }),
    { cache: false },
  );
  private readonly endSelection$ = createScopedEmitter<
    { modeId: string },
    EndSelectionEvent,
    string
  >((documentId, data) => ({ documentId, modeId: data.modeId }), { cache: false });

  // Marquee selection emitters
  private readonly marqueeChange$ = createScopedEmitter<
    MarqueeScopeEvent,
    MarqueeChangeEvent,
    string
  >(
    (documentId, data) => ({
      documentId,
      pageIndex: data.pageIndex,
      rect: data.rect,
      modeId: data.modeId,
    }),
    { cache: false },
  );
  private readonly marqueeEnd$ = createScopedEmitter<MarqueeEndScopeEvent, MarqueeEndEvent, string>(
    (documentId, data) => ({
      documentId,
      pageIndex: data.pageIndex,
      rect: data.rect,
      modeId: data.modeId,
    }),
    { cache: false },
  );
  private readonly emptySpaceClick$ = createScopedEmitter<
    EmptySpaceClickScopeEvent,
    EmptySpaceClickEvent,
    string
  >(
    (documentId, data) => ({
      documentId,
      pageIndex: data.pageIndex,
      modeId: data.modeId,
    }),
    { cache: false },
  );

  private interactionManagerCapability: InteractionManagerCapability;
  private viewportCapability: ViewportCapability | null = null;
  private scrollCapability: ScrollCapability | null = null;

  private readonly menuHeight: number;
  private readonly config: SelectionPluginConfig;

  constructor(id: string, registry: PluginRegistry, config: SelectionPluginConfig) {
    super(id, registry);
    this.config = config;
    this.menuHeight = config.menuHeight ?? 40;

    const imPlugin = registry.getPlugin<InteractionManagerPlugin>('interaction-manager');
    if (!imPlugin) {
      throw new Error('SelectionPlugin: InteractionManagerPlugin is required.');
    }
    this.interactionManagerCapability = imPlugin.provides();
    this.viewportCapability = registry.getPlugin<ViewportPlugin>('viewport')?.provides() ?? null;
    this.scrollCapability = registry.getPlugin<ScrollPlugin>('scroll')?.provides() ?? null;

    this.coreStore.onAction(REFRESH_PAGES, (action) => {
      const { documentId, pageIndexes } = action.payload;
      const tasks = pageIndexes.map((pageIndex) =>
        this.getNewPageGeometryAndCache(documentId, pageIndex),
      );
      Task.all(tasks).wait(() => {
        // Notify affected pages about geometry updates
        pageIndexes.forEach((pageIndex) => {
          this.notifyPage(documentId, pageIndex);
        });
      }, ignore);
    });

    this.viewportCapability?.onViewportChange(
      (event) => {
        this.recalculateMenuPlacement(event.documentId);
      },
      { mode: 'throttle', wait: 100 },
    );
  }

  /* ── life-cycle ────────────────────────────────────────── */
  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initSelectionState(documentId, initialSelectionDocumentState));
    const marqueeEnabled = this.config.marquee?.enabled !== false;
    this.enabledModesPerDoc.set(
      documentId,
      new Map<string, EnableForModeOptions>([
        [
          'pointerMode',
          {
            enableSelection: true,
            showSelectionRects: true,
            enableMarquee: marqueeEnabled,
            showMarqueeRects: true,
          },
        ],
      ]),
    );
    this.pageCallbacks.set(documentId, new Map());
    this.geoAccessOrder.set(documentId, []);
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.hasTextAnchor.set(documentId, false);
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupSelectionState(documentId));
    this.enabledModesPerDoc.delete(documentId);
    this.pageCallbacks.delete(documentId);
    this.geoAccessOrder.delete(documentId);
    this.selecting.delete(documentId);
    this.hasTextAnchor.delete(documentId);
    this.anchor.delete(documentId);
    this.marqueePage.delete(documentId);
    this.selChange$.clearScope(documentId);
    this.textRetrieved$.clearScope(documentId);
    this.copyToClipboard$.clearScope(documentId);
    this.beginSelection$.clearScope(documentId);
    this.endSelection$.clearScope(documentId);
    this.menuPlacement$.clearScope(documentId);
    this.marqueeChange$.clearScope(documentId);
    this.marqueeEnd$.clearScope(documentId);
    this.emptySpaceClick$.clearScope(documentId);
  }

  async initialize() {}
  async destroy() {
    this.selChange$.clear();
    this.textRetrieved$.clear();
    this.copyToClipboard$.clear();
    this.beginSelection$.clear();
    this.endSelection$.clear();
    this.menuPlacement$.clear();
    this.marqueeChange$.clear();
    this.marqueeEnd$.clear();
    this.emptySpaceClick$.clear();
    super.destroy();
  }

  /* ── capability exposed to UI / other plugins ─────────── */
  buildCapability(): SelectionCapability {
    const getDocId = (documentId?: string) => documentId ?? this.getActiveDocumentId();

    return {
      // Active document operations
      getFormattedSelection: (docId) =>
        selector.getFormattedSelection(this.getDocumentState(getDocId(docId))),
      getFormattedSelectionForPage: (p, docId) =>
        selector.getFormattedSelectionForPage(this.getDocumentState(getDocId(docId)), p),
      getHighlightRectsForPage: (p, docId) =>
        selector.selectRectsForPage(this.getDocumentState(getDocId(docId)), p),
      getHighlightRects: (docId) => this.getDocumentState(getDocId(docId)).rects,
      getBoundingRectForPage: (p, docId) =>
        selector.selectBoundingRectForPage(this.getDocumentState(getDocId(docId)), p),
      getBoundingRects: (docId) =>
        selector.selectBoundingRectsForAllPages(this.getDocumentState(getDocId(docId))),
      getSelectedText: (docId) => this.getSelectedText(getDocId(docId)),
      setSelection: (range, docId) => this.applySelection(getDocId(docId), range),
      clear: (docId) => this.clearSelection(getDocId(docId)),
      copyToClipboard: (docId) => this.copyToClipboard(getDocId(docId)),
      getState: (docId) => this.getDocumentState(getDocId(docId)),
      enableForMode: (modeId, options, docId) =>
        this.enabledModesPerDoc.get(getDocId(docId))?.set(modeId, { ...options }),
      isEnabledForMode: (modeId, docId) =>
        this.enabledModesPerDoc.get(getDocId(docId))?.has(modeId) ?? false,
      setMarqueeEnabled: (enabled, docId) => this.setMarqueeEnabled(getDocId(docId), enabled),
      isMarqueeEnabled: (docId) => this.isMarqueeEnabled(getDocId(docId)),

      // Document-scoped operations
      forDocument: this.createSelectionScope.bind(this),

      // Global events
      onCopyToClipboard: this.copyToClipboard$.onGlobal,
      onSelectionChange: this.selChange$.onGlobal,
      onTextRetrieved: this.textRetrieved$.onGlobal,
      onBeginSelection: this.beginSelection$.onGlobal,
      onEndSelection: this.endSelection$.onGlobal,

      // Marquee selection events
      onMarqueeChange: this.marqueeChange$.onGlobal,
      onMarqueeEnd: this.marqueeEnd$.onGlobal,

      // Empty space click event
      onEmptySpaceClick: this.emptySpaceClick$.onGlobal,
    };
  }

  private createSelectionScope(documentId: string): SelectionScope {
    return {
      getFormattedSelection: () =>
        selector.getFormattedSelection(this.getDocumentState(documentId)),
      getFormattedSelectionForPage: (p) =>
        selector.getFormattedSelectionForPage(this.getDocumentState(documentId), p),
      getHighlightRectsForPage: (p) =>
        selector.selectRectsForPage(this.getDocumentState(documentId), p),
      getHighlightRects: () => this.getDocumentState(documentId).rects,
      getBoundingRectForPage: (p) =>
        selector.selectBoundingRectForPage(this.getDocumentState(documentId), p),
      getBoundingRects: () =>
        selector.selectBoundingRectsForAllPages(this.getDocumentState(documentId)),
      getSelectedText: () => this.getSelectedText(documentId),
      setSelection: (range) => this.applySelection(documentId, range),
      clear: () => this.clearSelection(documentId),
      copyToClipboard: () => this.copyToClipboard(documentId),
      getState: () => this.getDocumentState(documentId),
      setMarqueeEnabled: (enabled) => this.setMarqueeEnabled(documentId, enabled),
      isMarqueeEnabled: () => this.isMarqueeEnabled(documentId),
      onSelectionChange: this.selChange$.forScope(documentId),
      onTextRetrieved: this.textRetrieved$.forScope(documentId),
      onCopyToClipboard: this.copyToClipboard$.forScope(documentId),
      onBeginSelection: this.beginSelection$.forScope(documentId),
      onEndSelection: this.endSelection$.forScope(documentId),
      onMarqueeChange: this.marqueeChange$.forScope(documentId),
      onMarqueeEnd: this.marqueeEnd$.forScope(documentId),
      onEmptySpaceClick: this.emptySpaceClick$.forScope(documentId),
    };
  }

  private getDocumentState(documentId: string): SelectionDocumentState {
    const state = this.state.documents[documentId];
    if (!state) {
      throw new Error(`Selection state not found for document: ${documentId}`);
    }
    return state;
  }

  /**
   * Subscribe to menu placement changes for a specific document
   * @param documentId - The document ID to subscribe to
   * @param listener - Callback function that receives placement updates
   * @returns Unsubscribe function
   */
  public onMenuPlacement(
    documentId: string,
    listener: (placement: SelectionMenuPlacement | null) => void,
  ) {
    return this.menuPlacement$.forScope(documentId)(listener);
  }

  /**
   * Register text selection on a page. Uses `registerAlways` so any plugin
   * can enable text selection for their mode via `enableForMode()`.
   */
  public registerSelectionOnPage(opts: RegisterSelectionOnPageOptions) {
    const { documentId, pageIndex, onRectsChange } = opts;
    const docState = this.state.documents[documentId];

    if (!docState) {
      this.logger.warn(
        'SelectionPlugin',
        'RegisterFailed',
        `Cannot register selection on page ${pageIndex} for document ${documentId}: document state not initialized.`,
      );
      return () => {};
    }

    // Track this callback for the page
    this.pageCallbacks.get(documentId)?.set(pageIndex, onRectsChange);

    const geoTask = this.getOrLoadGeometry(documentId, pageIndex);
    const interactionScope = this.interactionManagerCapability.forDocument(documentId);
    const enabledModes = this.enabledModesPerDoc.get(documentId);

    // Send initial state
    onRectsChange({
      rects: selector.selectRectsForPage(docState, pageIndex),
      boundingRect: selector.selectBoundingRectForPage(docState, pageIndex),
    });

    // When geometry arrives (possibly re-fetched after eviction), recompute
    // rects for this page if it falls within an active selection.
    geoTask.wait((geo) => {
      const currentState = this.getDocumentState(documentId);
      const sel = currentState.selection;
      if (!sel || pageIndex < sel.start.page || pageIndex > sel.end.page) return;

      const sb = sliceBounds(sel, geo, pageIndex);
      if (!sb) return;

      const pageRects = rectsWithinSlice(geo, sb.from, sb.to);
      this.dispatch(setRects(documentId, { ...currentState.rects, [pageIndex]: pageRects }));
      this.dispatch(
        setSlices(documentId, {
          ...currentState.slices,
          [pageIndex]: { start: sb.from, count: sb.to - sb.from + 1 },
        }),
      );
      this.notifyPage(documentId, pageIndex);
    }, ignore);

    // Create text selection handler
    const textHandler = createTextSelectionHandler({
      getGeometry: () => this.getDocumentState(documentId).geometry[pageIndex],
      isEnabled: (modeId) => {
        const config = enabledModes?.get(modeId);
        if (!config) return false;
        return config.enableSelection !== false;
      },
      onBegin: (g, modeId) => this.beginSelection(documentId, pageIndex, g, modeId),
      onUpdate: (g, modeId) => this.updateSelection(documentId, pageIndex, g, modeId),
      onEnd: (modeId) => this.endSelection(documentId, modeId),
      onClear: (modeId) => this.clearSelection(documentId, modeId),
      isSelecting: () => this.selecting.get(documentId) ?? false,
      setCursor: (cursor) =>
        cursor
          ? interactionScope.setCursor('selection-text', cursor, 10)
          : interactionScope.removeCursor('selection-text'),
      onEmptySpaceClick: (modeId) => this.emptySpaceClick$.emit(documentId, { pageIndex, modeId }),
      onWordSelect: (g, modeId) => this.selectWord(documentId, pageIndex, g, modeId),
      onLineSelect: (g, modeId) => this.selectLine(documentId, pageIndex, g, modeId),
      setHasTextAnchor: (active) => this.hasTextAnchor.set(documentId, active),
      minDragDistance: this.config.minSelectionDragDistance,
      toleranceFactor: this.config.toleranceFactor,
    });

    // Register text selection with registerAlways - any plugin can enable it for their mode
    const unregisterHandlers = this.interactionManagerCapability.registerAlways({
      scope: { type: 'page', documentId, pageIndex },
      handlers: textHandler,
    });

    // Return cleanup function
    return () => {
      unregisterHandlers();
      this.pageCallbacks.get(documentId)?.delete(pageIndex);
      geoTask.abort({ code: PdfErrorCode.Cancelled, message: 'Cleanup' });
    };
  }

  /**
   * Register marquee selection on a page. Uses `registerAlways` so any plugin
   * can enable marquee selection for their mode via `enableForMode({ enableMarquee: true })`.
   */
  public registerMarqueeOnPage(opts: RegisterMarqueeOnPageOptions) {
    const { documentId, pageIndex, scale, onRectChange } = opts;
    const docState = this.state.documents[documentId];

    if (!docState) {
      this.logger.warn(
        'SelectionPlugin',
        'RegisterMarqueeFailed',
        `Cannot register marquee on page ${pageIndex} for document ${documentId}: document state not initialized.`,
      );
      return () => {};
    }

    // Get page size from core state (same pattern as ZoomPlugin)
    const coreDoc = this.coreState.core.documents[documentId];
    if (!coreDoc || !coreDoc.document) {
      this.logger.warn(
        'SelectionPlugin',
        'DocumentNotFound',
        `Cannot register marquee on page ${pageIndex}: document not found`,
      );
      return () => {};
    }

    const page = coreDoc.document.pages[pageIndex];
    if (!page) {
      this.logger.warn(
        'SelectionPlugin',
        'PageNotFound',
        `Cannot register marquee on page ${pageIndex}: page not found`,
      );
      return () => {};
    }

    const pageSize = page.size;
    const minDragPx = this.config.marquee?.minDragPx ?? 5;

    const shouldShowRect = () => {
      const mode = this.interactionManagerCapability.forDocument(documentId).getActiveMode();
      const config = this.enabledModesPerDoc.get(documentId)?.get(mode);
      return config?.showMarqueeRects !== false;
    };

    // Create marquee selection handler
    const marqueeHandler = createMarqueeSelectionHandler({
      pageSize,
      scale,
      minDragPx,
      isEnabled: (modeId) => {
        const config = this.enabledModesPerDoc.get(documentId)?.get(modeId);
        return config?.enableMarquee === true;
      },
      isTextSelecting: () =>
        (this.selecting.get(documentId) ?? false) || (this.hasTextAnchor.get(documentId) ?? false),
      onBegin: (pos, modeId) => this.beginMarquee(documentId, pageIndex, pos, modeId),
      onChange: (rect, modeId) => {
        this.updateMarquee(documentId, pageIndex, rect, modeId);
        onRectChange(shouldShowRect() ? rect : null);
      },
      onEnd: (rect, modeId) => {
        this.endMarquee(documentId, pageIndex, rect, modeId);
        onRectChange(null);
      },
      onCancel: (modeId) => {
        this.cancelMarquee(documentId, modeId);
        onRectChange(null);
      },
    });

    // Register marquee with registerAlways - any plugin can enable it for their mode
    const unregisterHandlers = this.interactionManagerCapability.registerAlways({
      scope: { type: 'page', documentId, pageIndex },
      handlers: marqueeHandler,
    });

    return unregisterHandlers;
  }

  /**
   * Helper to calculate viewport relative metrics for a page rect.
   * Returns null if the rect cannot be converted to viewport space.
   */
  private getPlacementMetrics(
    documentId: string,
    pageIndex: number,
    rect: Rect,
    vpMetrics: ViewportMetrics,
  ) {
    // 1. Convert Page Coordinate -> Viewport Coordinate
    // We use the scroll capability to handle rotation, scale, and scroll offset automatically
    const scrollScope = this.scrollCapability?.forDocument(documentId);
    const viewportRect = scrollScope?.getRectPositionForPage(pageIndex, rect);

    if (!viewportRect) return null;

    // 2. Calculate relative positions
    const rectTopInView = viewportRect.origin.y - vpMetrics.scrollTop;
    const rectBottomInView = viewportRect.origin.y + viewportRect.size.height - vpMetrics.scrollTop;

    return {
      pageIndex,
      rect, // Original Page Rect
      spaceAbove: rectTopInView,
      spaceBelow: vpMetrics.clientHeight - rectBottomInView,
      isBottomVisible: rectBottomInView > 0 && rectBottomInView <= vpMetrics.clientHeight,
      isTopVisible: rectTopInView >= 0 && rectTopInView < vpMetrics.clientHeight,
    };
  }

  private emitMenuPlacement(documentId: string, placement: SelectionMenuPlacement | null) {
    this.menuPlacement$.emit(documentId, placement);

    // Update page activity for the selection menu
    if (placement) {
      this.interactionManagerCapability.claimPageActivity(
        documentId,
        'selection-menu',
        placement.pageIndex,
      );
    } else {
      this.interactionManagerCapability.releasePageActivity(documentId, 'selection-menu');
    }
  }

  private recalculateMenuPlacement(documentId: string) {
    const docState = this.state.documents[documentId];
    if (!docState) return;

    // Only show menu when not actively selecting
    if (docState.selecting || docState.selection === null) {
      this.emitMenuPlacement(documentId, null);
      return;
    }

    // 1. Get Bounding Rects for all pages involved in selection.
    // These are implicitly sorted by pageIndex because updateRectsAndSlices
    // populates the map in ascending page order.
    const bounds = selector.selectBoundingRectsForAllPages(docState);

    if (bounds.length === 0) {
      this.emitMenuPlacement(documentId, null);
      return;
    }

    const tail = bounds[bounds.length - 1];

    // Fallback: If viewport/scroll plugins are missing, always default to bottom of the last rect
    if (!this.viewportCapability || !this.scrollCapability) {
      this.emitMenuPlacement(documentId, {
        pageIndex: tail.page,
        rect: tail.rect,
        spaceAbove: 0,
        spaceBelow: Infinity, // Pretend we have infinite space below to prevent auto-flipping
        suggestTop: false,
        isVisible: true, // Assume visible
      });
      return;
    }

    // Use document-scoped viewport to get metrics for this specific document
    const viewportScope = this.viewportCapability.forDocument(documentId);
    const vpMetrics = viewportScope.getMetrics();

    // 2. Calculate metrics for Head (Start) and Tail (End)
    const head = bounds[0];

    const tailMetrics = this.getPlacementMetrics(documentId, tail.page, tail.rect, vpMetrics);
    const headMetrics = this.getPlacementMetrics(documentId, head.page, head.rect, vpMetrics);

    // 3. Apply Heuristic Logic

    // Priority A: Bottom of Tail (Standard selection end)
    // If the bottom of the selection is visible and we have space below.
    if (tailMetrics) {
      if (tailMetrics.isBottomVisible && tailMetrics.spaceBelow > this.menuHeight) {
        this.emitMenuPlacement(documentId, {
          ...tailMetrics,
          suggestTop: false,
          isVisible: true,
        });
        return;
      }
    }

    // Priority B: Top of Head (Selection start, if user scrolled up)
    // If the top of the start selection is visible, put the menu there.
    if (headMetrics) {
      if (headMetrics.isTopVisible) {
        this.emitMenuPlacement(documentId, {
          ...headMetrics,
          suggestTop: true,
          isVisible: true,
        });
        return;
      }
    }

    // Priority C: Fallback to Tail Bottom if visible (even if tight space)
    // It's better to stick to the cursor end than jump to the top if space is tight.
    if (tailMetrics && tailMetrics.isBottomVisible) {
      this.emitMenuPlacement(documentId, {
        ...tailMetrics,
        suggestTop: false,
        isVisible: true,
      });
      return;
    }

    // If completely off screen
    this.emitMenuPlacement(documentId, null);
  }

  private notifyPage(documentId: string, pageIndex: number) {
    const callback = this.pageCallbacks.get(documentId)?.get(pageIndex);
    if (callback) {
      const docState = this.getDocumentState(documentId);
      const mode = this.interactionManagerCapability.forDocument(documentId).getActiveMode();
      const modeConfig = this.enabledModesPerDoc.get(documentId)?.get(mode);

      // Show rects if mode is enabled and showSelectionRects/showRects is not explicitly false
      const shouldShowRects =
        modeConfig && (modeConfig.showSelectionRects ?? modeConfig.showRects) !== false;

      if (shouldShowRects) {
        callback({
          rects: selector.selectRectsForPage(docState, pageIndex),
          boundingRect: selector.selectBoundingRectForPage(docState, pageIndex),
        });
      } else {
        callback({ rects: [], boundingRect: null });
      }
    }
  }

  private notifyAllPages(documentId: string) {
    this.pageCallbacks.get(documentId)?.forEach((_, pageIndex) => {
      this.notifyPage(documentId, pageIndex);
    });
  }

  private getNewPageGeometryAndCache(
    documentId: string,
    pageIdx: number,
  ): PdfTask<PdfPageGeometry> {
    const coreDoc = this.getCoreDocument(documentId);
    if (!coreDoc || !coreDoc.document)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Doc Not Found' });

    const page = coreDoc.document.pages.find((p) => p.index === pageIdx)!;
    const task = this.engine.getPageGeometry(coreDoc.document, page);
    task.wait((geo) => {
      this.dispatch(cachePageGeometry(documentId, pageIdx, geo));
      this.touchGeometry(documentId, pageIdx);
    }, ignore);
    return task;
  }

  /* ── geometry cache ───────────────────────────────────── */
  private getOrLoadGeometry(documentId: string, pageIdx: number): PdfTask<PdfPageGeometry> {
    const cached = this.getDocumentState(documentId).geometry[pageIdx];
    if (cached) {
      this.touchGeometry(documentId, pageIdx);
      return PdfTaskHelper.resolve(cached);
    }

    return this.getNewPageGeometryAndCache(documentId, pageIdx);
  }

  /* ── geometry LRU eviction ──────────────────────────────── */

  private touchGeometry(documentId: string, pageIdx: number): void {
    const order = this.geoAccessOrder.get(documentId);
    if (!order) return;

    const idx = order.indexOf(pageIdx);
    if (idx > -1) order.splice(idx, 1);
    order.push(pageIdx);

    this.evictGeometryIfNeeded(documentId);
  }

  private evictGeometryIfNeeded(documentId: string): void {
    const max = this.config.maxCachedGeometries ?? 50;
    const order = this.geoAccessOrder.get(documentId);
    if (!order || order.length <= max) return;

    const pinned = this.pageCallbacks.get(documentId);
    const toEvict: number[] = [];

    while (order.length - toEvict.length > max) {
      const candidate = order.find((p) => !toEvict.includes(p) && !pinned?.has(p));
      if (candidate === undefined) break;
      toEvict.push(candidate);
    }

    if (toEvict.length === 0) return;

    for (const p of toEvict) {
      const idx = order.indexOf(p);
      if (idx > -1) order.splice(idx, 1);
    }

    this.dispatch(evictPageGeometry(documentId, toEvict));
  }

  /* ── selection state updates ───────────────────────────── */
  private beginSelection(documentId: string, page: number, index: number, modeId: string) {
    this.selecting.set(documentId, true);
    this.anchor.set(documentId, { page, index });
    this.dispatch(startSelection(documentId));
    this.beginSelection$.emit(documentId, { page, index, modeId });
    this.recalculateMenuPlacement(documentId);
  }

  private endSelection(documentId: string, modeId: string) {
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.dispatch(endSelection(documentId));
    this.endSelection$.emit(documentId, { modeId });
    this.recalculateMenuPlacement(documentId);
  }

  private clearSelection(documentId: string, _modeId?: string) {
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.dispatch(clearSelection(documentId));
    this.selChange$.emit(documentId, null);
    this.emitMenuPlacement(documentId, null);
    this.notifyAllPages(documentId);
  }

  /**
   * Programmatically apply (or restore) a text selection without going through
   * the pointer drag flow. Useful for restoring a previously persisted selection
   * or driving selection from code (e.g. search results).
   *
   * Geometry for every page spanned by the range is loaded on demand (the data
   * comes from the WASM engine), so the returned task settles only once the
   * selection rects have actually been computed.
   *
   * Passing `null` is equivalent to calling {@link clearSelection}.
   *
   * @returns a task that resolves once the selection has been applied.
   */
  private applySelection(
    documentId: string,
    range: SelectionRangeX | null,
  ): PdfTask<void> {
    // Ensure the document state exists before doing anything.
    if (!this.state.documents[documentId]) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: `Selection state not found for document: ${documentId}`,
      });
    }

    // Null clears the selection.
    if (range === null) {
      this.clearSelection(documentId);
      return PdfTaskHelper.resolve(undefined);
    }

    // Validate the shape and page bounds of the requested range up-front so we
    // never hand a bogus page to the engine (getPageGeometry assumes the page
    // exists). Glyph indices are range-checked later, once geometry is known.
    const validationError = this.validateRange(documentId, range);
    if (validationError) {
      return PdfTaskHelper.reject(validationError);
    }

    // Normalize the range so start <= end regardless of how the caller built it.
    const normalized = this.normalizeRange(range);

    // Load geometry for every page the selection spans. These may not be cached
    // yet (e.g. when restoring a selection on a freshly opened document), so we
    // wait for the WASM engine to provide them before computing rects.
    const pages: number[] = [];
    for (let p = normalized.start.page; p <= normalized.end.page; p++) {
      pages.push(p);
    }

    const geoTasks = pages.map((p) => this.getOrLoadGeometry(documentId, p));
    const result = PdfTaskHelper.create<void>();

    Task.all(geoTasks).wait(() => {
      // The document may have been closed while geometry was loading.
      if (!this.state.documents[documentId]) {
        result.reject({
          code: PdfErrorCode.NotFound,
          message: `Selection state not found for document: ${documentId}`,
        });
        return;
      }

      // Clamp glyph indices to the actual glyph counts now that geometry is
      // available. This keeps a persisted selection usable even if the caller
      // passed an index past the end of a (possibly changed) page.
      const clamped = this.clampRangeToGeometry(documentId, normalized);
      if (!clamped) {
        result.reject({
          code: PdfErrorCode.NotFound,
          message: `Cannot apply selection: page(s) ${normalized.start.page}-${normalized.end.page} have no text geometry`,
        });
        return;
      }

      this.selecting.set(documentId, false);
      this.anchor.set(documentId, undefined);

      // Remember which pages currently render highlights so we can repaint
      // them too. Otherwise a previous selection on pages outside the new
      // range would leave stale highlight rects on screen.
      const previouslyHighlighted = Object.keys(this.getDocumentState(documentId).rects).map(
        Number,
      );

      this.dispatch(startSelection(documentId));
      this.dispatch(setSelection(documentId, clamped));
      this.updateRectsAndSlices(documentId, clamped);
      this.dispatch(endSelection(documentId));

      this.selChange$.emit(documentId, clamped);

      // Notify the union of previously-highlighted pages and the new range so
      // deselected pages clear their rects and newly-selected pages paint.
      const pagesToNotify = new Set<number>(previouslyHighlighted);
      for (let p = clamped.start.page; p <= clamped.end.page; p++) {
        pagesToNotify.add(p);
      }
      pagesToNotify.forEach((p) => this.notifyPage(documentId, p));

      this.recalculateMenuPlacement(documentId);

      result.resolve(undefined);
    }, (error) => result.reject(error.reason));

    return result;
  }

  /**
   * Validate the structure and page bounds of a programmatic selection range.
   * Returns a rejection reason when the input is invalid, or null when it is
   * structurally sound. Glyph-index bounds are enforced separately, after the
   * page geometry has loaded (see {@link clampRangeToGeometry}).
   */
  private validateRange(documentId: string, range: SelectionRangeX): PdfErrorReason | null {
    const isValidPointer = (g: unknown): g is GlyphPointer =>
      !!g &&
      typeof g === 'object' &&
      Number.isInteger((g as GlyphPointer).page) &&
      Number.isInteger((g as GlyphPointer).index);

    if (!range || typeof range !== 'object' || !range.start || !range.end) {
      return { code: PdfErrorCode.Unknown, message: 'Invalid selection range: expected { start, end }' };
    }
    if (!isValidPointer(range.start) || !isValidPointer(range.end)) {
      return {
        code: PdfErrorCode.Unknown,
        message: 'Invalid selection range: start/end must have integer page and index',
      };
    }
    if (range.start.index < 0 || range.end.index < 0) {
      return { code: PdfErrorCode.Unknown, message: 'Invalid selection range: glyph index cannot be negative' };
    }

    const pageCount = this.getCoreDocument(documentId)?.document?.pageCount ?? 0;
    const minPage = Math.min(range.start.page, range.end.page);
    const maxPage = Math.max(range.start.page, range.end.page);
    if (minPage < 0 || maxPage >= pageCount) {
      return {
        code: PdfErrorCode.NotFound,
        message: `Invalid selection range: page ${minPage < 0 ? minPage : maxPage} out of bounds [0, ${pageCount})`,
      };
    }

    return null;
  }

  /**
   * Clamp the glyph indices of a (normalized) range to the number of glyphs
   * available on the corresponding pages. Returns null when none of the
   * spanned pages have any text geometry to select.
   */
  private clampRangeToGeometry(
    documentId: string,
    range: SelectionRangeX,
  ): SelectionRangeX | null {
    const docState = this.getDocumentState(documentId);

    const lastGlyphIndex = (page: number): number => {
      const geo = docState.geometry[page];
      if (!geo || geo.runs.length === 0) return -1;
      const lastRun = geo.runs[geo.runs.length - 1];
      return lastRun.charStart + lastRun.glyphs.length - 1;
    };

    const startMax = lastGlyphIndex(range.start.page);
    const endMax = lastGlyphIndex(range.end.page);

    // If neither endpoint page has any selectable glyphs, there is nothing to do.
    if (startMax < 0 && endMax < 0) return null;

    const clampIndex = (index: number, max: number) =>
      max < 0 ? 0 : Math.min(Math.max(index, 0), max);

    return {
      start: { page: range.start.page, index: clampIndex(range.start.index, startMax) },
      end: { page: range.end.page, index: clampIndex(range.end.index, endMax) },
    };
  }

  /** Order a range so that `start` never comes after `end`. */
  private normalizeRange(range: SelectionRangeX): SelectionRangeX {
    const { start, end } = range;
    const forward =
      end.page > start.page || (end.page === start.page && end.index >= start.index);
    return forward ? { start, end } : { start: end, end: start };
  }

  private selectWord(documentId: string, page: number, charIndex: number, modeId: string) {
    const geo = this.getDocumentState(documentId).geometry[page];
    if (!geo) return;

    const bounds = expandToWordBoundary(geo, charIndex);
    if (!bounds) return;

    this.applyInstantSelection(documentId, page, bounds.from, bounds.to, modeId);
  }

  private selectLine(documentId: string, page: number, charIndex: number, modeId: string) {
    const geo = this.getDocumentState(documentId).geometry[page];
    if (!geo) return;

    const bounds = expandToLineBoundary(geo, charIndex);
    if (!bounds) return;

    this.applyInstantSelection(documentId, page, bounds.from, bounds.to, modeId);
  }

  /**
   * Set a selection range without going through the drag begin/update/end flow.
   * Used by double-click (word) and triple-click (line) selection.
   */
  private applyInstantSelection(
    documentId: string,
    page: number,
    from: number,
    to: number,
    modeId: string,
  ) {
    const range: SelectionRangeX = {
      start: { page, index: from },
      end: { page, index: to },
    };

    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.dispatch(startSelection(documentId));
    this.dispatch(setSelection(documentId, range));
    this.updateRectsAndSlices(documentId, range);
    this.dispatch(endSelection(documentId));

    this.selChange$.emit(documentId, range);
    this.beginSelection$.emit(documentId, { page, index: from, modeId });
    this.endSelection$.emit(documentId, { modeId });

    for (let p = range.start.page; p <= range.end.page; p++) {
      this.notifyPage(documentId, p);
    }
    this.recalculateMenuPlacement(documentId);
  }

  private updateSelection(documentId: string, page: number, index: number, modeId: string) {
    if (!this.selecting.get(documentId) || !this.anchor.get(documentId)) return;

    const a = this.anchor.get(documentId)!;
    const forward = page > a.page || (page === a.page && index >= a.index);

    const start = forward ? a : { page, index };
    const end = forward ? { page, index } : a;

    const range = { start, end };
    this.dispatch(setSelection(documentId, range));
    this.updateRectsAndSlices(documentId, range);
    this.selChange$.emit(documentId, range);

    // Notify affected pages
    for (let p = range.start.page; p <= range.end.page; p++) {
      this.notifyPage(documentId, p);
    }
  }

  private updateRectsAndSlices(documentId: string, range: SelectionRangeX) {
    const docState = this.getDocumentState(documentId);
    const allRects: Record<number, Rect[]> = {};
    const allSlices: Record<number, { start: number; count: number }> = {};

    for (let p = range.start.page; p <= range.end.page; p++) {
      const geo = docState.geometry[p];
      const sb = sliceBounds(range, geo, p);
      if (!sb) continue;

      allRects[p] = rectsWithinSlice(geo!, sb.from, sb.to);
      allSlices[p] = { start: sb.from, count: sb.to - sb.from + 1 };
    }

    this.dispatch(setRects(documentId, allRects));
    this.dispatch(setSlices(documentId, allSlices));
  }

  private getSelectedText(documentId: string): PdfTask<string[]> {
    // Prevent extracting text without permission
    if (!this.checkPermission(documentId, PdfPermissionFlag.CopyContents)) {
      this.logger.debug(
        'SelectionPlugin',
        'GetSelectedText',
        `Cannot get selected text: document ${documentId} lacks CopyContents permission`,
      );
      return PdfTaskHelper.reject({
        code: PdfErrorCode.Security,
        message: 'Document lacks CopyContents permission',
      });
    }

    const coreDoc = this.getCoreDocument(documentId);
    const docState = this.getDocumentState(documentId);

    if (!coreDoc?.document || !docState.selection) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Doc Not Found or No Selection',
      });
    }

    const sel = docState.selection;
    const req: PageTextSlice[] = [];

    for (let p = sel.start.page; p <= sel.end.page; p++) {
      const s = docState.slices[p];
      if (s) req.push({ pageIndex: p, charIndex: s.start, charCount: s.count });
    }

    if (req.length === 0) return PdfTaskHelper.resolve([] as string[]);

    const task = this.engine.getTextSlices(coreDoc.document, req);

    // Emit the text when it's retrieved
    task.wait((text) => {
      this.textRetrieved$.emit(documentId, text);
    }, ignore);

    return task;
  }

  private copyToClipboard(documentId: string) {
    // Prevent copying text without permission
    if (!this.checkPermission(documentId, PdfPermissionFlag.CopyContents)) {
      this.logger.debug(
        'SelectionPlugin',
        'CopyToClipboard',
        `Cannot copy to clipboard: document ${documentId} lacks CopyContents permission`,
      );
      return;
    }

    const text = this.getSelectedText(documentId);
    text.wait((text) => {
      this.copyToClipboard$.emit(documentId, text.join('\n'));
    }, ignore);
  }

  /* ── marquee selection state updates ─────────────────────── */
  private beginMarquee(
    documentId: string,
    pageIndex: number,
    _startPos: Position,
    _modeId: string,
  ) {
    this.marqueePage.set(documentId, pageIndex);
  }

  private updateMarquee(documentId: string, pageIndex: number, rect: Rect, modeId: string) {
    this.marqueeChange$.emit(documentId, { pageIndex, rect, modeId });
  }

  private endMarquee(documentId: string, pageIndex: number, rect: Rect, modeId: string) {
    this.marqueeEnd$.emit(documentId, { pageIndex, rect, modeId });
    this.marqueeChange$.emit(documentId, { pageIndex, rect: null, modeId });
    this.marqueePage.delete(documentId);
  }

  private cancelMarquee(documentId: string, modeId: string) {
    const pageIndex = this.marqueePage.get(documentId);
    if (pageIndex !== undefined) {
      this.marqueeChange$.emit(documentId, { pageIndex, rect: null, modeId });
      this.marqueePage.delete(documentId);
    }
  }

  /** @deprecated — shim for backward compat; delegates to pointerMode config */
  private setMarqueeEnabled(documentId: string, enabled: boolean) {
    const modes = this.enabledModesPerDoc.get(documentId);
    if (!modes) return;
    const current = modes.get('pointerMode');
    if (current) {
      current.enableMarquee = enabled;
    } else if (enabled) {
      modes.set('pointerMode', { enableMarquee: true });
    }
  }

  /** @deprecated — shim for backward compat; reads pointerMode config */
  private isMarqueeEnabled(documentId: string): boolean {
    const config = this.enabledModesPerDoc.get(documentId)?.get('pointerMode');
    return config?.enableMarquee !== false;
  }
}
