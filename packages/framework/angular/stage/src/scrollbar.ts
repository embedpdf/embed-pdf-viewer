/**
 * `<epdf-scrollbar>`: a scrollbar for the Stage it's in, that you style yourself. Put it inside
 * `<epdf-stage>`; it reads the Stage's `scrollMetrics()` (the numbers a scrolling element has)
 * and scrolls through its calls.
 *
 * It behaves like a native bar: drag the thumb (the point you grabbed stays under the pointer),
 * press the track to page toward the pointer (repeating while held, stopping at the pointer),
 * a minimum thumb length on long documents, and macOS-style hiding when nothing moves. On an
 * unbounded Stage the metrics already cover the content and the view together, so the bar
 * shrinks as you pan away; the mapping is frozen while the thumb is dragged, so the thumb never
 * chases itself.
 *
 * The element is the track; style it with your own class and these attributes:
 *   [data-embedpdf-scrollbar][data-axis="y"][data-state="visible|hidden"]
 *   [data-embedpdf-scrollbar][data-dragging]
 *   [data-embedpdf-scrollbar-thumb]          (or `thumbClass`)
 * Until you style the thumb, its color is `--epdf-scrollbar-thumb`.
 */
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  createScrollbarPresses,
  paintDefault,
  scrollbarLayout,
  type ScrollbarTrack,
} from '@embedpdf/web';
import { outsideStageError } from '@embedpdf/angular/runtime';
import { EpdfStage } from './stage';

export type ScrollbarAxis = 'x' | 'y';

@Component({
  selector: 'epdf-scrollbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'scrollbar',
    'data-embedpdf-scrollbar': '',
    style: 'position: absolute; touch-action: none; user-select: none; transition: opacity 200ms',
    '[attr.aria-orientation]': "vertical() ? 'vertical' : 'horizontal'",
    '[attr.aria-valuemin]': '0',
    '[attr.aria-valuemax]': 'round(layout().maxOffset)',
    '[attr.aria-valuenow]': 'round(layout().offset)',
    '[attr.data-axis]': 'axis()',
    '[attr.data-state]': "shown() ? 'visible' : 'hidden'",
    '[attr.data-dragging]': "dragging() ? '' : null",
    // Pinned to the right (y) or bottom (x) edge of the Stage; nothing to scroll, no bar.
    '[style.display]': "scrollable() ? 'block' : 'none'",
    '[style.top.px]': 'vertical() ? 0 : null',
    '[style.left.px]': 'vertical() ? null : 0',
    '[style.right.px]': '0',
    '[style.bottom.px]': '0',
    '[style.width.px]': 'vertical() ? 12 : null',
    '[style.height.px]': 'vertical() ? null : 12',
    '[style.opacity]': 'shown() ? 1 : 0',
    // A hidden bar must not take the clicks meant for the pages under it.
    '[style.pointer-events]': "shown() ? 'auto' : 'none'",
    '(pointerdown)': 'onTrackDown($event)',
    '(pointermove)': 'onMove($event)',
    '(pointerup)': 'endDrag()',
    '(pointercancel)': 'endDrag()',
    '(pointerenter)': 'hovered.set(true)',
    '(pointerleave)': 'hovered.set(false)',
  },
  template: `
    <div
      data-embedpdf-scrollbar-thumb=""
      [class]="thumbClass()"
      style="position: absolute; border-radius: 6px"
      [style.background]="thumbColor"
      [style.left.px]="vertical() ? 2 : layout().thumbPosition"
      [style.right.px]="vertical() ? 2 : null"
      [style.top.px]="vertical() ? layout().thumbPosition : 2"
      [style.bottom.px]="vertical() ? null : 2"
      [style.width.px]="vertical() ? null : layout().thumbLength"
      [style.height.px]="vertical() ? layout().thumbLength : null"
      (pointerdown)="onThumbDown($event)"
    ></div>
  `,
})
export class EpdfScrollbar {
  /** `'y'` for a vertical bar, `'x'` for a horizontal one. */
  readonly axis = input.required<ScrollbarAxis>();
  /**
   * Hide this many milliseconds after the view stops moving (hover and dragging keep it shown;
   * a hidden bar ignores the pointer, like macOS), or `false` to always show it.
   */
  readonly autoHide = input<number | false, number | false | string>(1200, {
    transform: (value) => (value === false || value === 'false' ? false : Number(value)),
  });
  /** The shortest thumb, in pixels, so it never vanishes on a long document. */
  readonly minThumbSize = input(24);
  /**
   * Pressing the track: `'page'` steps 90% of a view toward the pointer and repeats while held;
   * `'jump'` puts the thumb under the pointer and goes on as a drag.
   */
  readonly trackPress = input<'page' | 'jump'>('page');
  /** The thumb's class. */
  readonly thumbClass = input<string | null>(null);

  private readonly stage: EpdfStage;
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly trackPx = signal(0);
  protected readonly dragging = signal(false);
  protected readonly hovered = signal(false);
  /** The view moved a moment ago. */
  private readonly active = signal(true);

  protected readonly vertical = computed(() => this.axis() === 'y');
  protected readonly scrollable = computed(() => {
    const metrics = this.stage.scrollMetrics();
    return this.vertical() ? metrics.scrollableY : metrics.scrollableX;
  });
  /** The thumb along the track: one formula for drawing, dragging and paging, in every framework. */
  protected readonly layout = computed(() =>
    scrollbarLayout(
      this.stage.scrollMetrics(),
      this.vertical(),
      this.trackPx(),
      this.minThumbSize(),
    ),
  );
  protected readonly shown = computed(
    () =>
      this.autoHide() === false ||
      this.autoHide() === 0 ||
      this.active() ||
      this.hovered() ||
      this.dragging(),
  );
  protected readonly thumbColor = paintDefault('scrollbar-thumb');
  protected readonly round = Math.round;

  /** Thumb drags, track paging and jumps: `@embedpdf/web`'s, shared by every framework. */
  private readonly presses = createScrollbarPresses((dragging) => this.dragging.set(dragging));

  constructor() {
    const stage = inject(EpdfStage, { optional: true });
    if (!stage) throw outsideStageError('<epdf-scrollbar>');
    this.stage = stage;

    // Any move of the view shows the bar again and starts the countdown to hiding it.
    effect((onCleanup) => {
      this.stage.scrollMetrics();
      const hideAfter = this.autoHide();
      if (hideAfter === false || hideAfter === 0) return;
      this.active.set(true);
      const timer = setTimeout(() => this.active.set(false), hideAfter);
      onCleanup(() => clearTimeout(timer));
    });

    // The track's length, which the thumb maps onto; again whenever the bar appears or resizes.
    effect((onCleanup) => {
      const vertical = this.vertical();
      if (!this.scrollable() || typeof ResizeObserver === 'undefined') return;
      const measure = () =>
        this.trackPx.set(vertical ? this.element.clientHeight : this.element.clientWidth);
      const observer = new ResizeObserver(measure);
      observer.observe(this.element);
      measure();
      onCleanup(() => observer.disconnect());
    });

    inject(DestroyRef).onDestroy(() => this.endDrag());
  }

  /** The bar as it is now, for `@embedpdf/web`'s press handling. */
  private track(): ScrollbarTrack {
    const vertical = this.vertical();
    return {
      stage: this.stage,
      vertical,
      element: this.element,
      layout: this.layout(),
      // Fresh geometry for paging steps, from the metrics as they are now.
      liveLayout: () =>
        scrollbarLayout(this.stage.scrollMetrics(), vertical, this.trackPx(), this.minThumbSize()),
    };
  }

  protected onThumbDown(event: PointerEvent): void {
    this.presses.pressThumb(event, this.track());
  }

  protected onTrackDown(event: PointerEvent): void {
    this.presses.pressTrack(event, this.track(), this.trackPress());
  }

  /** Pointer capture sends the moves here, for thumb drags, jump drags and paging alike. */
  protected onMove(event: PointerEvent): void {
    this.presses.move(event, this.track());
  }

  protected endDrag(): void {
    this.presses.release();
  }
}
