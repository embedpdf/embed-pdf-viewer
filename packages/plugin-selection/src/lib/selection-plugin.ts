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
import { sliceBounds, rectsWithinSlice, glyphAt } from './utils';
import { ScrollCapability, ScrollPlugin } from "@embedpdf/plugin-scroll";
import { ViewportCapability, ViewportPlugin } from '@embedpdf/plugin-viewport';

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

  /* auto-scroll state */
  private autoScrollTimer: number | null = null;
  private lastPointerPosition: { x: number; y: number } | null = null;
  private readonly AUTO_SCROLL_TOP_THRESHOLD = 100;
  private readonly AUTO_SCROLL_BOTTOM_THRESHOLD = 50;
  private readonly AUTO_SCROLL_LEFT_THRESHOLD = 50;
  private readonly AUTO_SCROLL_RIGHT_THRESHOLD = 50;
  private readonly AUTO_SCROLL_SPEED = 10;

  /** Page callbacks for rect updates */
  private pageCallbacks = new Map<number, (data: SelectionRectsCallback) => void>();

  private readonly selChange$ = createBehaviorEmitter<SelectionState['selection']>();
  private readonly textRetrieved$ = createBehaviorEmitter<string[]>();
  private readonly copyToClipboard$ = createEmitter<string>();
  private readonly beginSelection$ = createEmitter<{ page: number; index: number }>();
  private readonly endSelection$ = createEmitter<void>();

  private interactionManagerCapability: InteractionManagerCapability | undefined;
  private scrollCapability: ScrollCapability | undefined;
  private viewportCapability: ViewportCapability | undefined;

  constructor(id: string, registry: PluginRegistry) {
    super(id, registry);

    this.interactionManagerCapability = this.registry
      .getPlugin<InteractionManagerPlugin>('interaction-manager')
      ?.provides();

    this.scrollCapability = this.registry
      .getPlugin<ScrollPlugin>('scroll')
      ?.provides();

    this.viewportCapability = this.registry
      .getPlugin<ViewportPlugin>('viewport')
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
    this.stopAutoScroll();
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

    // TODO: Check scroll, viewport

    const { pageIndex, onRectsChange } = opts;

    // Track this callback for the page
    this.pageCallbacks.set(pageIndex, onRectsChange);

    const geoTask = this.getOrLoadGeometry(pageIndex);

    // Send initial state
    onRectsChange({
      rects: selector.selectRectsForPage(this.state, pageIndex),
      boundingRect: selector.selectBoundingRectForPage(this.state, pageIndex),
    });

    const handlers: PointerEventHandlersWithLifecycle<PointerEvent> = {
      onPointerDown: (point: Position, _evt, modeId) => {
        if (!this.enabledModes.has(modeId)) return;

        // Clear the selection
        this.clearSelection();

        // Get geometry from cache (or load if needed)
        const cached = this.state.geometry[pageIndex];
        if (cached) {
          const g = glyphAt(cached, point);
          if (g !== -1) {
            this.beginSelection(pageIndex, g);
          }
        }
      },
      onPointerMove: (point: Position, evt, modeId) => {
        if (!this.enabledModes.has(modeId)) return;

        // Store last pointer position for auto-scroll
        this.lastPointerPosition = { x: evt.clientX, y: evt.clientY };

        // Get cached geometry (should be instant if already loaded)
        const cached = this.state.geometry[pageIndex];
        if (cached) {
          const g = glyphAt(cached, point);

          // Update cursor
          if (g !== -1) {
            this.interactionManagerCapability?.setCursor('selection-text', 'text', 10);
          } else {
            this.interactionManagerCapability?.removeCursor('selection-text');
          }

          // Update selection if we're selecting
          if (this.selecting && g !== -1) {
            this.updateSelection(pageIndex, g);


            // START AUTO-SCROLL if near viewport edge
            this.checkAndStartAutoScroll(evt.clientX, evt.clientY);
          }
        }
      },
      onPointerUp: (_point: Position, _evt, modeId) => {
        if (!this.enabledModes.has(modeId)) return;
        // STOP AUTO-SCROLL
        this.stopAutoScroll();
        this.endSelection();
      },
      onHandlerActiveEnd: (modeId) => {
        if (!this.enabledModes.has(modeId)) return;
        // STOP AUTO-SCROLL
        this.stopAutoScroll();
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

  private getNewPageGeometryAndCache(pageIdx: number): PdfTask<PdfPageGeometry> {
    if (!this.coreState.core.document)
      return PdfTaskHelper.reject({ code: PdfErrorCode.NotFound, message: 'Doc Not Found' });
    const page = this.coreState.core.document.pages.find((p) => p.index === pageIdx)!;
    const task = this.engine.getPageGeometry(this.coreState.core.document, page);
    task.wait((geo) => {
      this.dispatch(cachePageGeometry(pageIdx, geo));
    }, ignore);
    return task;
  }

  /* ── geometry cache ───────────────────────────────────── */
  private getOrLoadGeometry(pageIdx: number): PdfTask<PdfPageGeometry> {
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
      const sb = sliceBounds(range, geo, p);
      if (!sb) continue;

      allRects[p] = rectsWithinSlice(geo!, sb.from, sb.to);
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

  private checkAndStartAutoScroll(clientX: number, clientY: number) {
    if (!this.viewportCapability || !this.scrollCapability) return;

    const { clientWidth, clientHeight } = this.viewportCapability.getMetrics();

    // Calculate distance from edges
    const distanceFromTop = clientY;
    const distanceFromBottom = clientHeight - clientY;
    const distanceFromLeft = clientX;
    const distanceFromRight = clientWidth - clientX;

    // Determine scroll direction
    let scrollX = 0;
    let scrollY = 0;

    if (distanceFromTop < this.AUTO_SCROLL_TOP_THRESHOLD) {
      scrollY = -this.AUTO_SCROLL_SPEED; // Scroll up
    } else if (distanceFromBottom < this.AUTO_SCROLL_BOTTOM_THRESHOLD) {
      scrollY = this.AUTO_SCROLL_SPEED; // Scroll down
    }

    if (distanceFromLeft < this.AUTO_SCROLL_LEFT_THRESHOLD) {
      scrollX = -this.AUTO_SCROLL_SPEED; // Scroll left
    } else if (distanceFromRight < this.AUTO_SCROLL_RIGHT_THRESHOLD) {
      scrollX = this.AUTO_SCROLL_SPEED; // Scroll right
    }

    // Start auto-scroll if needed
    if (scrollX !== 0 || scrollY !== 0) {
      if (!this.autoScrollTimer) {
        this.startAutoScroll(scrollX, scrollY);
      }
    } else {
      // Stop auto-scroll if mouse moved away from edge
      this.stopAutoScroll();
    }
  }

  private startAutoScroll(scrollX: number, scrollY: number) {
    if (!this.viewportCapability) return;

    // Clear existing timer
    this.stopAutoScroll();

    // Start animation loop
    const scroll = () => {
      if (!this.selecting) {
        this.stopAutoScroll();
        return;
      }

      // Perform scroll
      const currentMetrics = this.viewportCapability!.getMetrics();
      this.viewportCapability!.scrollTo({
        x: currentMetrics.scrollLeft + scrollX,
        y: currentMetrics.scrollTop + scrollY,
        behavior: 'instant', // No smooth scrolling for auto-scroll
      });

      // Re-check pointer position for continued selection
      if (this.lastPointerPosition && this.selecting) {
        // Find which page contains the current pointer position
        // This is a simplified version - you may need to adjust based on your layout
        this.checkAndStartAutoScroll(
          this.lastPointerPosition.x,
          this.lastPointerPosition.y
        );
      }

      // Continue animation
      this.autoScrollTimer = requestAnimationFrame(scroll);
    };

    this.autoScrollTimer = requestAnimationFrame(scroll);
  }

  private stopAutoScroll() {
    if (this.autoScrollTimer !== null) {
      cancelAnimationFrame(this.autoScrollTimer);
      this.autoScrollTimer = null;
    }
  }
}
