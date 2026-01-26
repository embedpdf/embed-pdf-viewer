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
} from './types';
import { sliceBounds, rectsWithinSlice } from './utils';
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

  /** Marquee state tracking, per document */
  private marqueeEnabled = new Map<string, boolean>();
  private marqueePage = new Map<string, number>();

  /** Page callbacks for rect updates, per document */
  private pageCallbacks = new Map<string, Map<number, (data: SelectionRectsCallback) => void>>();

  private readonly menuPlacement$ = createScopedEmitter<
    SelectionMenuPlacement | null,
    SelectionMenuPlacementEvent,
    string
  >((documentId, placement) => ({ documentId, placement }));
  private readonly selChange$ = createScopedEmitter<
    SelectionRangeX | null,
    SelectionChangeEvent,
    string
  >((documentId, selection) => ({ documentId, selection }));
  private readonly textRetrieved$ = createScopedEmitter<string[], TextRetrievedEvent, string>(
    (documentId, text) => ({ documentId, text }),
  );
  private readonly copyToClipboard$ = createScopedEmitter<string, CopyToClipboardEvent, string>(
    (documentId, text) => ({ documentId, text }),
    { cache: false },
  );
  private readonly beginSelection$ = createScopedEmitter<
    { page: number; index: number },
    BeginSelectionEvent,
    string
  >((documentId, data) => ({ documentId, page: data.page, index: data.index }), { cache: false });
  private readonly endSelection$ = createScopedEmitter<void, EndSelectionEvent, string>(
    (documentId) => ({ documentId }),
    { cache: false },
  );

  // Marquee selection emitters
  private readonly marqueeChange$ = createScopedEmitter<
    MarqueeScopeEvent,
    MarqueeChangeEvent,
    string
  >((documentId, data) => ({ documentId, pageIndex: data.pageIndex, rect: data.rect }), {
    cache: false,
  });
  private readonly marqueeEnd$ = createScopedEmitter<MarqueeEndScopeEvent, MarqueeEndEvent, string>(
    (documentId, data) => ({ documentId, pageIndex: data.pageIndex, rect: data.rect }),
    {
      cache: false,
    },
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
    this.enabledModesPerDoc.set(
      documentId,
      new Map<string, EnableForModeOptions>([['pointerMode', { showRects: true }]]),
    );
    this.pageCallbacks.set(documentId, new Map());
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);

    // Initialize marquee state based on config
    const marqueeConfig = this.config.marquee;
    this.marqueeEnabled.set(documentId, marqueeConfig?.enabled !== false);
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupSelectionState(documentId));
    this.enabledModesPerDoc.delete(documentId);
    this.pageCallbacks.delete(documentId);
    this.selecting.delete(documentId);
    this.anchor.delete(documentId);
    this.marqueeEnabled.delete(documentId);
    this.marqueePage.delete(documentId);
    this.selChange$.clearScope(documentId);
    this.textRetrieved$.clearScope(documentId);
    this.copyToClipboard$.clearScope(documentId);
    this.beginSelection$.clearScope(documentId);
    this.endSelection$.clearScope(documentId);
    this.menuPlacement$.clearScope(documentId);
    this.marqueeChange$.clearScope(documentId);
    this.marqueeEnd$.clearScope(documentId);
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
      clear: (docId) => this.clearSelection(getDocId(docId)),
      copyToClipboard: (docId) => this.copyToClipboard(getDocId(docId)),
      getState: (docId) => this.getDocumentState(getDocId(docId)),
      enableForMode: (modeId, options, docId) =>
        this.enabledModesPerDoc.get(getDocId(docId))?.set(modeId, { showRects: true, ...options }),
      isEnabledForMode: (modeId, docId) =>
        this.enabledModesPerDoc.get(getDocId(docId))?.has(modeId) ?? false,

      // Marquee selection
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

    // Create text selection handler
    const textHandler = createTextSelectionHandler({
      getGeometry: () => this.getDocumentState(documentId).geometry[pageIndex],
      isEnabled: (modeId) => enabledModes?.has(modeId) ?? false,
      onBegin: (g) => this.beginSelection(documentId, pageIndex, g),
      onUpdate: (g) => this.updateSelection(documentId, pageIndex, g),
      onEnd: () => this.endSelection(documentId),
      onClear: () => this.clearSelection(documentId),
      isSelecting: () => this.selecting.get(documentId) ?? false,
      setCursor: (cursor) =>
        cursor
          ? interactionScope.setCursor('selection-text', cursor, 10)
          : interactionScope.removeCursor('selection-text'),
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
   * Register marquee selection on a page. Uses `registerHandlers` with `pointerMode`
   * only - marquee selection is only active in the default pointer mode.
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

    // Create marquee selection handler
    const marqueeHandler = createMarqueeSelectionHandler({
      pageSize,
      scale,
      minDragPx,
      isEnabled: () => this.marqueeEnabled.get(documentId) !== false,
      onBegin: (pos) => this.beginMarquee(documentId, pageIndex, pos),
      onChange: (rect) => {
        this.updateMarquee(documentId, pageIndex, rect);
        onRectChange(rect);
      },
      onEnd: (rect) => {
        this.endMarquee(documentId, pageIndex, rect);
        onRectChange(null);
      },
      onCancel: () => {
        this.cancelMarquee(documentId);
        onRectChange(null);
      },
    });

    // Register marquee ONLY for pointerMode
    const unregisterHandlers = this.interactionManagerCapability.registerHandlers({
      documentId,
      pageIndex,
      modeId: 'pointerMode',
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

  private recalculateMenuPlacement(documentId: string) {
    const docState = this.state.documents[documentId];
    if (!docState) return;

    // Only show menu when not actively selecting
    if (docState.selecting || docState.selection === null) {
      this.menuPlacement$.emit(documentId, null);
      return;
    }

    // 1. Get Bounding Rects for all pages involved in selection.
    // These are implicitly sorted by pageIndex because updateRectsAndSlices
    // populates the map in ascending page order.
    const bounds = selector.selectBoundingRectsForAllPages(docState);

    if (bounds.length === 0) {
      this.menuPlacement$.emit(documentId, null);
      return;
    }

    const tail = bounds[bounds.length - 1];

    // Fallback: If viewport/scroll plugins are missing, always default to bottom of the last rect
    if (!this.viewportCapability || !this.scrollCapability) {
      this.menuPlacement$.emit(documentId, {
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
        this.menuPlacement$.emit(documentId, {
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
        this.menuPlacement$.emit(documentId, {
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
      this.menuPlacement$.emit(documentId, {
        ...tailMetrics,
        suggestTop: false,
        isVisible: true,
      });
      return;
    }

    // If completely off screen
    this.menuPlacement$.emit(documentId, null);
  }

  private notifyPage(documentId: string, pageIndex: number) {
    const callback = this.pageCallbacks.get(documentId)?.get(pageIndex);
    if (callback) {
      const docState = this.getDocumentState(documentId);
      const mode = this.interactionManagerCapability.forDocument(documentId).getActiveMode();
      const modeConfig = this.enabledModesPerDoc.get(documentId)?.get(mode);

      // Show rects if mode is enabled and showRects is not explicitly false
      const shouldShowRects = modeConfig && modeConfig.showRects !== false;

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
    }, ignore);
    return task;
  }

  /* ── geometry cache ───────────────────────────────────── */
  private getOrLoadGeometry(documentId: string, pageIdx: number): PdfTask<PdfPageGeometry> {
    const cached = this.getDocumentState(documentId).geometry[pageIdx];
    if (cached) return PdfTaskHelper.resolve(cached);

    return this.getNewPageGeometryAndCache(documentId, pageIdx);
  }

  /* ── selection state updates ───────────────────────────── */
  private beginSelection(documentId: string, page: number, index: number) {
    this.selecting.set(documentId, true);
    this.anchor.set(documentId, { page, index });
    this.dispatch(startSelection(documentId));
    this.beginSelection$.emit(documentId, { page, index });
    this.recalculateMenuPlacement(documentId);
  }

  private endSelection(documentId: string) {
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.dispatch(endSelection(documentId));
    this.endSelection$.emit(documentId);
    this.recalculateMenuPlacement(documentId);
  }

  private clearSelection(documentId: string) {
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.dispatch(clearSelection(documentId));
    this.selChange$.emit(documentId, null);
    this.menuPlacement$.emit(documentId, null);
    this.notifyAllPages(documentId);
  }

  private updateSelection(documentId: string, page: number, index: number) {
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
  private beginMarquee(documentId: string, pageIndex: number, _startPos: Position) {
    this.marqueePage.set(documentId, pageIndex);
  }

  private updateMarquee(documentId: string, pageIndex: number, rect: Rect) {
    this.marqueeChange$.emit(documentId, { pageIndex, rect });
  }

  private endMarquee(documentId: string, pageIndex: number, rect: Rect) {
    this.marqueeEnd$.emit(documentId, { pageIndex, rect });
    this.marqueeChange$.emit(documentId, { pageIndex, rect: null });
    this.marqueePage.delete(documentId);
  }

  private cancelMarquee(documentId: string) {
    const pageIndex = this.marqueePage.get(documentId);
    if (pageIndex !== undefined) {
      this.marqueeChange$.emit(documentId, { pageIndex, rect: null });
      this.marqueePage.delete(documentId);
    }
  }

  private setMarqueeEnabled(documentId: string, enabled: boolean) {
    this.marqueeEnabled.set(documentId, enabled);
  }

  private isMarqueeEnabled(documentId: string): boolean {
    return this.marqueeEnabled.get(documentId) !== false;
  }
}
