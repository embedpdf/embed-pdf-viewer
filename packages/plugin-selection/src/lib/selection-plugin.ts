import {
  BasePlugin,
  Listener,
  PluginRegistry,
  REFRESH_PAGES,
  createBehaviorEmitter,
  createEmitter,
} from '@embedpdf/core';
import {
  PdfPageGeometry,
  Rect,
  PdfTask,
  PdfTaskHelper,
  PdfErrorCode,
  ignore,
  PageTextSlice,
  Task,
  Position,
} from '@embedpdf/models';
import {
  InteractionManagerCapability,
  InteractionManagerPlugin,
  PointerEventHandlersWithLifecycle,
} from '@embedpdf/plugin-interaction-manager';

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
  SelectionRectsCallback,
  SelectionScope,
  SelectionChangeEvent,
  TextRetrievedEvent,
  CopyToClipboardEvent,
  BeginSelectionEvent,
  EndSelectionEvent,
  SelectionDocumentState,
} from './types';
import { sliceBounds, rectsWithinSlice, glyphAt } from './utils';

export class SelectionPlugin extends BasePlugin<
  SelectionPluginConfig,
  SelectionCapability,
  SelectionState,
  SelectionAction
> {
  static readonly id = 'selection' as const;

  /** Modes that should trigger text-selection logic, per document */
  private enabledModesPerDoc = new Map<string, Set<string>>();

  /* interactive state, per document */
  private selecting = new Map<string, boolean>();
  private anchor = new Map<string, { page: number; index: number } | undefined>();

  /** Page callbacks for rect updates, per document */
  private pageCallbacks = new Map<string, Map<number, (data: SelectionRectsCallback) => void>>();

  private readonly selChange$ = createBehaviorEmitter<SelectionChangeEvent>();
  private readonly textRetrieved$ = createBehaviorEmitter<TextRetrievedEvent>();
  private readonly copyToClipboard$ = createEmitter<CopyToClipboardEvent>();
  private readonly beginSelection$ = createEmitter<BeginSelectionEvent>();
  private readonly endSelection$ = createEmitter<EndSelectionEvent>();

  private interactionManagerCapability: InteractionManagerCapability;

  constructor(id: string, registry: PluginRegistry) {
    super(id, registry);

    const imPlugin = registry.getPlugin<InteractionManagerPlugin>('interaction-manager');
    if (!imPlugin) {
      throw new Error('SelectionPlugin: InteractionManagerPlugin is required.');
    }
    this.interactionManagerCapability = imPlugin.provides();

    this.coreStore.onAction(REFRESH_PAGES, (action) => {
      const { documentId, pageNumbers } = action.payload;
      const tasks = pageNumbers.map((pageNumber) =>
        this.getNewPageGeometryAndCache(documentId, pageNumber - 1),
      );
      Task.all(tasks).wait(() => {
        // Notify affected pages about geometry updates
        pageNumbers.forEach((pageNumber) => {
          this.notifyPage(documentId, pageNumber - 1);
        });
      }, ignore);
    });
  }

  /* ── life-cycle ────────────────────────────────────────── */
  protected override onDocumentLoadingStarted(documentId: string): void {
    this.dispatch(initSelectionState(documentId, initialSelectionDocumentState));
    this.enabledModesPerDoc.set(documentId, new Set<string>(['pointerMode']));
    this.pageCallbacks.set(documentId, new Map());
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
  }

  protected override onDocumentClosed(documentId: string): void {
    this.dispatch(cleanupSelectionState(documentId));
    this.enabledModesPerDoc.delete(documentId);
    this.pageCallbacks.delete(documentId);
    this.selecting.delete(documentId);
    this.anchor.delete(documentId);
  }

  async initialize() {}
  async destroy() {
    this.selChange$.clear();
    this.textRetrieved$.clear();
    this.copyToClipboard$.clear();
    this.beginSelection$.clear();
    this.endSelection$.clear();
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
      enableForMode: (modeId, docId) => this.enabledModesPerDoc.get(getDocId(docId))?.add(modeId),
      isEnabledForMode: (modeId, docId) =>
        this.enabledModesPerDoc.get(getDocId(docId))?.has(modeId) ?? false,

      // Document-scoped operations
      forDocument: this.createSelectionScope.bind(this),

      // Global events
      onCopyToClipboard: this.copyToClipboard$.on,
      onSelectionChange: this.selChange$.on,
      onTextRetrieved: this.textRetrieved$.on,
      onBeginSelection: this.beginSelection$.on,
      onEndSelection: this.endSelection$.on,
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
      onSelectionChange: (listener: Listener<SelectionRangeX | null>) =>
        this.selChange$.on((event) => {
          if (event.documentId === documentId) listener(event.selection);
        }),
      onTextRetrieved: (listener: Listener<string[]>) =>
        this.textRetrieved$.on((event) => {
          if (event.documentId === documentId) listener(event.text);
        }),
      onCopyToClipboard: (listener: Listener<string>) =>
        this.copyToClipboard$.on((event) => {
          if (event.documentId === documentId) listener(event.text);
        }),
      onBeginSelection: (listener: Listener<{ page: number; index: number }>) =>
        this.beginSelection$.on((event) => {
          if (event.documentId === documentId) listener({ page: event.page, index: event.index });
        }),
      onEndSelection: (listener: Listener<void>) =>
        this.endSelection$.on((event) => {
          if (event.documentId === documentId) listener();
        }),
    };
  }

  private getDocumentState(documentId: string): SelectionDocumentState {
    const state = this.state.documents[documentId];
    if (!state) {
      throw new Error(`Selection state not found for document: ${documentId}`);
    }
    return state;
  }

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

    const handlers: PointerEventHandlersWithLifecycle<PointerEvent> = {
      onPointerDown: (point: Position, _evt, modeId) => {
        if (!enabledModes?.has(modeId)) return;

        // Clear the selection
        this.clearSelection(documentId);

        // Get geometry from cache (or load if needed)
        const cached = this.getDocumentState(documentId).geometry[pageIndex];
        if (cached) {
          const g = glyphAt(cached, point);
          if (g !== -1) {
            this.beginSelection(documentId, pageIndex, g);
          }
        }
      },
      onPointerMove: (point: Position, _evt, modeId) => {
        if (!enabledModes?.has(modeId)) return;

        // Get cached geometry (should be instant if already loaded)
        const cached = this.getDocumentState(documentId).geometry[pageIndex];
        if (cached) {
          const g = glyphAt(cached, point);

          // Update cursor
          if (g !== -1) {
            interactionScope.setCursor('selection-text', 'text', 10);
          } else {
            interactionScope.removeCursor('selection-text');
          }

          // Update selection if we're selecting
          if (this.selecting.get(documentId) && g !== -1) {
            this.updateSelection(documentId, pageIndex, g);
          }
        }
      },
      onPointerUp: (_point: Position, _evt, modeId) => {
        if (!enabledModes?.has(modeId)) return;
        this.endSelection(documentId);
      },
      onHandlerActiveEnd: (modeId) => {
        if (!enabledModes?.has(modeId)) return;
        this.clearSelection(documentId);
      },
    };

    // Register the handlers with interaction manager for all enabled modes
    // This assumes `registerAlways` is a method that runs handlers for *any* mode,
    // and the handler itself checks the `modeId`.
    // If `registerAlways` is not available, this would need to register
    // for each mode in `enabledModes` separately.
    const unregisterHandlers = this.interactionManagerCapability.registerAlways({
      scope: { type: 'page', documentId, pageIndex },
      handlers,
    });

    // Return cleanup function
    return () => {
      unregisterHandlers();
      this.pageCallbacks.get(documentId)?.delete(pageIndex);
      geoTask.abort({ code: PdfErrorCode.Cancelled, message: 'Cleanup' });
    };
  }

  private notifyPage(documentId: string, pageIndex: number) {
    const callback = this.pageCallbacks.get(documentId)?.get(pageIndex);
    if (callback) {
      const docState = this.getDocumentState(documentId);
      const mode = this.interactionManagerCapability.forDocument(documentId).getActiveMode();
      const enabledModes = this.enabledModesPerDoc.get(documentId);

      if (enabledModes?.has(mode)) {
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
    this.beginSelection$.emit({ documentId, page, index });
  }

  private endSelection(documentId: string) {
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.dispatch(endSelection(documentId));
    this.endSelection$.emit({ documentId });
  }

  private clearSelection(documentId: string) {
    this.selecting.set(documentId, false);
    this.anchor.set(documentId, undefined);
    this.dispatch(clearSelection(documentId));
    this.selChange$.emit({ documentId, selection: null });
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
    this.selChange$.emit({ documentId, selection: range });

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
      this.textRetrieved$.emit({ documentId, text });
    }, ignore);

    return task;
  }

  private copyToClipboard(documentId: string) {
    const text = this.getSelectedText(documentId);
    text.wait((text) => {
      this.copyToClipboard$.emit({ documentId, text: text.join('\n') });
    }, ignore);
  }
}
