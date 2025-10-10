import {
  BasePlugin,
  PluginRegistry,
  REFRESH_PAGES,
  SET_DOCUMENT,
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
  reset,
  setRects,
  setSlices,
} from './actions';
import * as selector from './selectors';
import {
  SelectionCapability,
  SelectionPluginConfig,
  SelectionRangeX,
  SelectionState,
  RegisterSelectionOnPageOptions,
  SelectionRectsCallback,
} from './types';
import {
  sliceBounds,
  rectsWithinSlice,
  glyphAt,
  findNearestGlyphWithModel,
  GlyphAccelerationModel,
  buildGlyphAccelerationModel,
} from './utils';

export class SelectionPlugin extends BasePlugin<
  SelectionPluginConfig,
  SelectionCapability,
  SelectionState,
  SelectionAction
> {
  static readonly id = 'selection' as const;

  /** Modes that should trigger text-selection logic */
  private enabledModes = new Set<string>(['pointerMode']);

  /* interactive state */
  private selecting = false;
  private anchor?: { page: number; index: number };
  private mouseDown = false;

  /** Page callbacks for rect updates */
  private pageCallbacks = new Map<number, (data: SelectionRectsCallback) => void>();

  private readonly selChange$ = createBehaviorEmitter<SelectionState['selection']>();
  private readonly textRetrieved$ = createBehaviorEmitter<string[]>();
  private readonly copyToClipboard$ = createEmitter<string>();
  private readonly beginSelection$ = createEmitter<{ page: number; index: number }>();
  private readonly endSelection$ = createEmitter<void>();

  private interactionManagerCapability: InteractionManagerCapability | undefined;

  constructor(id: string, registry: PluginRegistry) {
    super(id, registry);

    this.interactionManagerCapability = this.registry
      .getPlugin<InteractionManagerPlugin>('interaction-manager')
      ?.provides();

    this.coreStore.onAction(SET_DOCUMENT, (_action) => {
      this.dispatch(reset());
      this.notifyAllPages();
    });

    this.coreStore.onAction(REFRESH_PAGES, (action) => {
      const tasks = action.payload.map((pageIdx) => this.getNewPageGeometryAndCache(pageIdx));
      Task.all(tasks).wait(() => {
        // Notify affected pages about geometry updates
        action.payload.forEach((pageIdx) => {
          this.notifyPage(pageIdx);
        });
      }, ignore);
    });
  }

  /* ── life-cycle ────────────────────────────────────────── */
  async initialize() {}
  async destroy() {
    this.selChange$.clear();
  }

  /* ── capability exposed to UI / other plugins ─────────── */
  buildCapability(): SelectionCapability {
    return {
      getFormattedSelection: () => selector.getFormattedSelection(this.state),
      getFormattedSelectionForPage: (p) => selector.getFormattedSelectionForPage(this.state, p),
      getHighlightRectsForPage: (p) => selector.selectRectsForPage(this.state, p),
      getHighlightRects: () => this.state.rects,
      getBoundingRectForPage: (p) => selector.selectBoundingRectForPage(this.state, p),
      getBoundingRects: () => selector.selectBoundingRectsForAllPages(this.state),
      onCopyToClipboard: this.copyToClipboard$.on,
      onSelectionChange: this.selChange$.on,
      onTextRetrieved: this.textRetrieved$.on,
      onBeginSelection: this.beginSelection$.on,
      onEndSelection: this.endSelection$.on,
      clear: () => this.clearSelection(),
      getSelectedText: () => this.getSelectedText(),
      copyToClipboard: () => this.copyToClipboard(),
      enableForMode: (id: string) => this.enabledModes.add(id),
      isEnabledForMode: (id: string) => this.enabledModes.has(id),
      getState: () => this.state,
    };
  }

  public registerSelectionOnPage(opts: RegisterSelectionOnPageOptions) {
    if (!this.interactionManagerCapability) {
      this.logger.warn(
        'SelectionPlugin',
        'MissingDependency',
        'Interaction manager plugin not loaded, text selection disabled',
      );
      return () => {};
    }

    const { pageIndex, onRectsChange } = opts;

    // Track this callback for the page
    this.pageCallbacks.set(pageIndex, onRectsChange);

    const geoTask = this.getOrLoadGeometry(pageIndex);

    // Send initial state
    onRectsChange({
      rects: selector.selectRectsForPage(this.state, pageIndex),
      boundingRect: selector.selectBoundingRectForPage(this.state, pageIndex),
    });
    let mouseDownData: {
      x: number;
      y: number;
      num: number;
      time: number;
      clientX: number;
      clientY: number;
    } | null = null;

    const handlers: PointerEventHandlersWithLifecycle<PointerEvent> = {
      onPointerDown: (point: Position, evt, modeId) => {
        if (!this.enabledModes.has(modeId)) return;

        this.clearSelection();

        const cached = this.state.geometry[pageIndex];
        if (!cached) return;

        const res = findNearestGlyphWithModel(cached, { x: point.x, y: point.y });
        const num = res?.globalIndex ?? -1;

        mouseDownData = {
          x: point.x,
          y: point.y,
          num,
          time: performance.now(),
          clientX: evt.clientX,
          clientY: evt.clientY,
        };
        this.mouseDown = true;
      },
      onPointerMove: (point: Position, evt, modeId) => {
        if (!this.enabledModes.has(modeId)) return;

        // Get cached geometry (should be instant if already loaded)
        const cached = this.state.geometry[pageIndex];
        if (!cached) return;
        const res = findNearestGlyphWithModel(cached, point);
        if (!res) {
          this.interactionManagerCapability?.removeCursor('selection-text');
          return;
        }
        if (res.isExactMatch) {
          this.interactionManagerCapability?.setCursor('selection-text', 'text', 10);
        } else {
          this.interactionManagerCapability?.removeCursor('selection-text');
        }

        const g = res.globalIndex;
        const isMouseDown = this.mouseDown;
        if (isMouseDown && mouseDownData && !this.selecting) {
          const deltaX = evt.clientX - mouseDownData.clientX;
          const deltaY = evt.clientY - mouseDownData.clientY;
          const distance = deltaX * deltaX + deltaY * deltaY;
          if (distance > 25) this.beginSelection(pageIndex, g);
        } else if (this.selecting) {
          this.updateSelection(pageIndex, g);
        }
      },
      onPointerUp: (_point: Position, _evt, modeId) => {
        if (!this.enabledModes.has(modeId)) return;
        this.mouseDown = false;
        mouseDownData = null;
        this.endSelection();
      },
      onHandlerActiveEnd: (modeId) => {
        if (!this.enabledModes.has(modeId)) return;
        this.mouseDown = false;
        mouseDownData = null;
        this.clearSelection();
      },
    };

    // Register the handlers with interaction manager
    const unregisterHandlers = this.interactionManagerCapability.registerAlways({
      scope: { type: 'page', pageIndex },
      handlers,
    });

    // Return cleanup function
    return () => {
      unregisterHandlers();
      this.pageCallbacks.delete(pageIndex);
      geoTask.abort({ code: PdfErrorCode.Cancelled, message: 'Cleanup' });
    };
  }

  private notifyPage(pageIndex: number) {
    const callback = this.pageCallbacks.get(pageIndex);
    if (callback) {
      const mode = this.interactionManagerCapability?.getActiveMode();
      if (mode === 'pointerMode') {
        callback({
          rects: selector.selectRectsForPage(this.state, pageIndex),
          boundingRect: selector.selectBoundingRectForPage(this.state, pageIndex),
        });
      } else {
        callback({ rects: [], boundingRect: null });
      }
    }
  }

  private notifyAllPages() {
    this.pageCallbacks.forEach((_, pageIndex) => {
      this.notifyPage(pageIndex);
    });
  }

  private getNewPageGeometryAndCache(pageIdx: number): PdfTask<GlyphAccelerationModel> {
    if (!this.coreState.core.document)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Doc Not Found' });
    const page = this.coreState.core.document.pages.find((p) => p.index === pageIdx)!;
    const resTask: PdfTask<GlyphAccelerationModel> = new Task();

    const task = this.engine.getPageGeometry(this.coreState.core.document, page);
    task.wait((geo) => {
      const model = buildGlyphAccelerationModel(geo);
      this.dispatch(cachePageGeometry(pageIdx, model));
      resTask.resolve(model);
    }, ignore);

    // listen task abort to abort webworker task
    resTask.wait(
      () => {},
      (err) => {
        if (err.type === 'abort') {
          task.abort(err.reason);
        }
      },
    );

    return resTask;
  }

  /* ── geometry cache ───────────────────────────────────── */
  private getOrLoadGeometry(pageIdx: number): PdfTask<GlyphAccelerationModel> {
    const cached = this.state.geometry[pageIdx];
    if (cached) return PdfTaskHelper.resolve(cached);

    return this.getNewPageGeometryAndCache(pageIdx);
  }

  /* ── selection state updates ───────────────────────────── */
  private beginSelection(page: number, index: number) {
    this.selecting = true;
    this.anchor = { page, index };
    this.dispatch(startSelection());
    this.beginSelection$.emit({ page, index });
  }

  private endSelection() {
    this.selecting = false;
    this.anchor = undefined;
    this.dispatch(endSelection());
    this.endSelection$.emit();
  }

  private clearSelection() {
    this.selecting = false;
    this.mouseDown = false;
    this.anchor = undefined;
    this.dispatch(clearSelection());
    this.selChange$.emit(null);
    this.notifyAllPages();
  }

  private updateSelection(page: number, index: number) {
    if (!this.selecting || !this.anchor) return;

    const a = this.anchor;
    const forward = page > a.page || (page === a.page && index >= a.index);

    const start = forward ? a : { page, index };
    const end = forward ? { page, index } : a;

    const range = { start, end };
    this.dispatch(setSelection(range));
    this.updateRectsAndSlices(range);
    this.selChange$.emit(range);

    // Notify affected pages
    for (let p = range.start.page; p <= range.end.page; p++) {
      this.notifyPage(p);
    }
  }

  private updateRectsAndSlices(range: SelectionRangeX) {
    const allRects: Record<number, Rect[]> = {};
    const allSlices: Record<number, { start: number; count: number }> = {};

    for (let p = range.start.page; p <= range.end.page; p++) {
      const geo = this.state.geometry[p];
      const sb = sliceBounds(range, geo.geo, p);
      if (!sb) continue;

      allRects[p] = rectsWithinSlice(geo.geo!, sb.from, sb.to);
      allSlices[p] = { start: sb.from, count: sb.to - sb.from + 1 };
    }

    this.dispatch(setRects(allRects));
    this.dispatch(setSlices(allSlices));
  }

  private getSelectedText(): PdfTask<string[]> {
    if (!this.coreState.core.document || !this.state.selection) {
      return PdfTaskHelper.reject({
        code: PdfErrorCode.NotFound,
        message: 'Doc Not Found or No Selection',
      });
    }

    const sel = this.state.selection;
    const req: PageTextSlice[] = [];

    for (let p = sel.start.page; p <= sel.end.page; p++) {
      const s = this.state.slices[p];
      if (s) req.push({ pageIndex: p, charIndex: s.start, charCount: s.count });
    }

    if (req.length === 0) return PdfTaskHelper.resolve([] as string[]);

    const task = this.engine.getTextSlices(this.coreState.core.document, req);

    // Emit the text when it's retrieved
    task.wait((text) => {
      this.textRetrieved$.emit(text);
    }, ignore);

    return task;
  }

  private copyToClipboard() {
    const text = this.getSelectedText();
    text.wait((text) => {
      this.copyToClipboard$.emit(text.join('\n'));
    }, ignore);
  }
}
