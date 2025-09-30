import {
  BasePlugin,
  CoreState,
  createBehaviorEmitter,
  createEmitter,
  PluginRegistry,
  REFRESH_PAGES,
  SET_DOCUMENT,
  StoreState,
  Unsubscribe,
} from '@embedpdf/core';
import { ScrollToOptions, ThumbMeta, ThumbnailPluginConfig, WindowState } from './types';
import { ThumbnailCapability } from './types';
import { ignore, PdfErrorReason, Task } from '@embedpdf/models';
import { RenderCapability, RenderPlugin } from '@embedpdf/plugin-render';
import { ScrollCapability, ScrollPlugin } from '@embedpdf/plugin-scroll';

export class ThumbnailPlugin extends BasePlugin<ThumbnailPluginConfig, ThumbnailCapability> {
  static readonly id = 'thumbnail' as const;

  private renderCapability: RenderCapability;
  private scrollCapability: ScrollCapability | null = null;
  private thumbs: ThumbMeta[] = [];
  private window: WindowState | null = null;

  // track viewport metrics for scroll decisions
  private viewportH: number = 0;
  private scrollY: number = 0;

  private readonly emitWindow = createBehaviorEmitter<WindowState>();
  private readonly refreshPages$ = createEmitter<number[]>();
  private readonly taskCache = new Map<number, Task<Blob, PdfErrorReason>>();
  private canAutoScroll = true;
  // ask pane to scroll to a specific top
  private readonly scrollTo$ = createBehaviorEmitter<ScrollToOptions>();

  constructor(
    id: string,
    registry: PluginRegistry,
    public cfg: ThumbnailPluginConfig,
  ) {
    super(id, registry);

    this.renderCapability = this.registry.getPlugin<RenderPlugin>('render')!.provides();
    this.scrollCapability = this.registry.getPlugin<ScrollPlugin>('scroll')?.provides() ?? null;

    this.coreStore.onAction(SET_DOCUMENT, (_action, state) => {
      this.taskCache.clear();
      this.setWindowState(state);
    });

    this.coreStore.onAction(REFRESH_PAGES, (action) => {
      this.refreshPages$.emit(action.payload);
      for (const pageIdx of action.payload) {
        this.taskCache.delete(pageIdx);
      }
    });

    // auto-scroll thumbnails when the main scroller's current page changes
    if (this.scrollCapability && this.cfg.autoScroll !== false) {
      this.scrollCapability.onPageChangeState(({ isChanging, targetPage }) => {
        this.canAutoScroll = !isChanging;
        if (!isChanging) {
          this.scrollToThumb(targetPage - 1);
        }
      });
      this.scrollCapability.onPageChange(({ pageNumber }) => {
        if (this.canAutoScroll) {
          this.scrollToThumb(pageNumber - 1);
        }
      });
    }
  }

  /* ------------ init ------------------------------------------------ */
  async initialize(): Promise<void> {}

  public onRefreshPages(fn: (pages: number[]) => void): Unsubscribe {
    return this.refreshPages$.on(fn);
  }

  public onWindow(cb: (w: WindowState) => void): Unsubscribe {
    return this.emitWindow.on(cb);
  }

  public onScrollTo(cb: (o: ScrollToOptions) => void): Unsubscribe {
    return this.scrollTo$.on(cb);
  }

  private setWindowState(state: StoreState<CoreState>) {
    const core = state.core;
    if (!core.document) return;

    const OUTER_W = this.cfg.width ?? 120;
    const L = this.cfg.labelHeight ?? 16;
    const GAP = this.cfg.gap ?? 8;
    const P = this.cfg.imagePadding ?? 0;
    const PADDING_Y = this.cfg.paddingY ?? 0;

    // Inner bitmap width cannot go below 1px
    const INNER_W = Math.max(1, OUTER_W - 2 * P);

    let offset = PADDING_Y; // Start with top padding
    this.thumbs = core.document.pages.map((p) => {
      const ratio = p.size.height / p.size.width;
      const imgH = Math.round(INNER_W * ratio);
      const wrapH = P + imgH + P + L; // padding + image + padding + label

      const meta: ThumbMeta = {
        pageIndex: p.index,
        width: INNER_W, // bitmap width (for <img> size)
        height: imgH, // bitmap height (for <img> size)
        wrapperHeight: wrapH, // full row height used by virtualizer
        top: offset, // top of the row
        labelHeight: L,
        padding: P, // NEW
      };
      offset += wrapH + GAP;
      return meta;
    });

    this.window = {
      start: -1,
      end: -1,
      items: [],
      totalHeight: offset - GAP + PADDING_Y, // Add bottom padding to total height
    };

    if (this.viewportH > 0) {
      this.updateWindow(this.scrollY, this.viewportH);
    } else {
      this.emitWindow.emit(this.window);
    }
  }

  /* ------------ capability ----------------------------------------- */
  protected buildCapability(): ThumbnailCapability {
    return {
      renderThumb: (idx, dpr) => this.renderThumb(idx, dpr),
      scrollToThumb: (pageIdx) => this.scrollToThumb(pageIdx),
    };
  }

  /* ------------ windowing & viewport state ------------------------- */
  public updateWindow(scrollY: number, viewportH: number) {
    const BUF = this.cfg.buffer ?? 3;

    // remember latest viewport metrics for scroll decisions
    this.scrollY = scrollY;
    this.viewportH = viewportH;

    // Early return if window state hasn't been initialized yet
    if (!this.window || this.thumbs.length === 0) return;

    /* find first visible */
    let low = 0,
      high = this.thumbs.length - 1,
      first = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const m = this.thumbs[mid];
      if (m.top + m.wrapperHeight < scrollY) low = mid + 1;
      else {
        first = mid;
        high = mid - 1;
      }
    }

    /* find last visible + buffer */
    let last = first;
    const limit = scrollY + viewportH;
    while (last + 1 < this.thumbs.length && this.thumbs[last].top < limit) last++;
    last = Math.min(this.thumbs.length - 1, last + BUF);

    const start = Math.max(0, first - BUF);
    if (start === this.window.start && last === this.window.end) return;

    this.window = {
      start,
      end: last,
      items: this.thumbs.slice(start, last + 1),
      totalHeight: this.window.totalHeight,
    };
    this.emitWindow.emit(this.window);
  }

  /* ------------ scroll helper now in plugin ------------------------ */
  private scrollToThumb(pageIdx: number) {
    if (!this.window) return;
    const item = this.thumbs[pageIdx];
    if (!item) return;

    const behavior = this.cfg.scrollBehavior ?? 'smooth';
    const PADDING_Y = this.cfg.paddingY ?? 0; // Include padding in scroll calculations

    if (this.viewportH <= 0) {
      // Center the thumbnail in the viewport
      const top = Math.max(PADDING_Y, item.top - item.wrapperHeight);
      this.scrollTo$.emit({ top, behavior });
      return;
    }

    const margin = 8;
    const top = item.top;
    const bottom = item.top + item.wrapperHeight;

    const needsUp = top < this.scrollY + margin + PADDING_Y;
    const needsDown = bottom > this.scrollY + this.viewportH - margin;

    if (needsUp) {
      this.scrollTo$.emit({ top: Math.max(0, top - PADDING_Y), behavior });
    } else if (needsDown) {
      this.scrollTo$.emit({ top: Math.max(0, bottom - this.viewportH + PADDING_Y), behavior });
    }
  }

  /* ------------ thumbnail raster ----------------------------------- */
  private renderThumb(idx: number, dpr: number) {
    if (this.taskCache.has(idx)) return this.taskCache.get(idx)!;

    const core = this.coreState.core;
    const page = core.document!.pages[idx];

    const OUTER_W = this.cfg.width ?? 120;
    const P = this.cfg.imagePadding ?? 0;
    const INNER_W = Math.max(1, OUTER_W - 2 * P);

    const scale = INNER_W / page.size.width; // scale to inner width (excludes padding)

    const task = this.renderCapability.renderPageRect({
      pageIndex: idx,
      rect: { origin: { x: 0, y: 0 }, size: page.size },
      options: {
        scaleFactor: scale,
        dpr,
      },
    });

    this.taskCache.set(idx, task);
    task.wait(ignore, () => this.taskCache.delete(idx));
    return task;
  }
}
