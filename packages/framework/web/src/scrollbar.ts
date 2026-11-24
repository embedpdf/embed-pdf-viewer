/**
 * A Stage scrollbar's geometry, its press handling and the listeners that carry it, shared by
 * every framework's `Scrollbar`.
 *
 * The Stage gives its scroll position as a scrolling element has it (`scrollTop`,
 * `scrollHeight`, `clientHeight` and their horizontal twins, in screen pixels). From that and the
 * measured track this module draws the thumb, and turns presses into Stage calls the way a native
 * bar does: a thumb drag keeps the point it grabbed under the pointer, and a press on the track
 * pages toward the pointer, repeating while held and stopping when the thumb reaches it. A drag
 * is frozen at the press (grab point, travel, range) and applied as relative pans: absolute in
 * feel on a bounded Stage, and steady on an unbounded one, whose range moves under the pointer.
 *
 * The adapters keep their reactive glue: the track's size, auto-hide, hover and the markup.
 */

import { isolatePointerDown } from './event-isolation';

/** The scroll position a Stage reports (`ScrollMetrics` from the stage plugin satisfies it). */
export interface ScrollbarMetrics {
  readonly scrollLeft: number;
  readonly scrollTop: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

/** The bar along one axis, in track pixels. */
export interface ScrollbarLayout {
  /** The view's length along the axis. */
  client: number;
  /** How far the view is scrolled. */
  offset: number;
  /** The farthest it can scroll. */
  maxOffset: number;
  thumbLength: number;
  /** How far the thumb can move along the track. */
  travel: number;
  thumbPosition: number;
}

/**
 * The thumb from the metrics and the track's length: one formula for drawing, dragging and
 * paging, so they never disagree. The thumb never gets shorter than `minThumbSize`, and its
 * position stays proportional over the travel that leaves.
 */
export function scrollbarLayout(
  metrics: ScrollbarMetrics,
  vertical: boolean,
  trackPx: number,
  minThumbSize: number,
): ScrollbarLayout {
  const client = vertical ? metrics.clientHeight : metrics.clientWidth;
  const total = vertical ? metrics.scrollHeight : metrics.scrollWidth;
  const offset = vertical ? metrics.scrollTop : metrics.scrollLeft;
  const maxOffset = Math.max(0, total - client);
  const thumbLength = Math.min(
    trackPx,
    Math.max(minThumbSize, total > 0 ? (client / total) * trackPx : 0),
  );
  const travel = Math.max(0, trackPx - thumbLength);
  const thumbPosition = maxOffset > 0 ? (offset / maxOffset) * travel : 0;
  return { client, offset, maxOffset, thumbLength, travel, thumbPosition };
}

/** The Stage calls a scrollbar makes; `StageCapability` satisfies it. */
export interface ScrollbarStage {
  scrollTo(position: { top?: number; left?: number }): void;
  scrollBy(delta: { top?: number; left?: number }): void;
  panBy(dx: number, dy: number): void;
}

/** The bar as it is at a press: what the press handlers read. */
export interface ScrollbarTrack {
  readonly stage: ScrollbarStage;
  readonly vertical: boolean;
  /** The track element: pointer positions are measured from its start. */
  readonly element: Element;
  /** The layout drawn now. */
  readonly layout: ScrollbarLayout;
  /** The layout from the Stage's metrics as they are now, for each paging step. */
  liveLayout(): ScrollbarLayout;
}

/**
 * What a press handler reads from a pointer event; a DOM `PointerEvent` satisfies it. A handler
 * stops the press it takes, which keeps it from the Stage only when the handler runs on a native
 * listener on the bar itself, as `attachScrollbar` calls it.
 */
export interface ScrollbarPointerEvent {
  readonly button: number;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly target: EventTarget | null;
  readonly currentTarget: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
}

/**
 * A scrollbar's presses, for a bar that wires its own listeners to them. `attachScrollbar` wires
 * them for you.
 */
export interface ScrollbarPresses {
  /** A press on the thumb starts a drag. */
  pressThumb(event: ScrollbarPointerEvent, track: ScrollbarTrack): void;
  /**
   * A press on the track itself: `'page'` steps 90% of a view toward the pointer, repeats while
   * held and stops at the pointer; `'jump'` puts the thumb under the pointer and goes on as a
   * drag. A press that reached the track from the thumb is the thumb's.
   */
  pressTrack(event: ScrollbarPointerEvent, track: ScrollbarTrack, mode: 'page' | 'jump'): void;
  /** A pointer move on the track (pointer capture sends them there): drags, and paging's target. */
  move(event: ScrollbarPointerEvent, track: ScrollbarTrack): void;
  /** The press ended: no drag, no repeat. Also call it when the bar goes away. */
  release(): void;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Pointer capture where the browser allows it: a pointer already released (a pen or touch race,
 * a synthetic event in a test) throws, and the press must still work, only without capture.
 */
const capturePointer = (element: Element, pointerId: number) => {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Without capture, moves still arrive while the pointer stays on the bar.
  }
};

/** The pointer's position along the track, in pixels from its start. */
const positionOnTrack = (event: ScrollbarPointerEvent, track: ScrollbarTrack): number => {
  const rect = track.element.getBoundingClientRect();
  return track.vertical ? event.clientY - rect.top : event.clientX - rect.left;
};

/**
 * One scrollbar's press handling. `onDragging` hears when a drag starts and ends, for the bar's
 * `data-dragging` and to keep it shown.
 */
export function createScrollbarPresses(onDragging: (dragging: boolean) => void): ScrollbarPresses {
  let drag: { grab: number; applied: number; max: number; travel: number } | null = null;
  let paging: { timer: number } | null = null;
  let lastPointer = 0;

  const stopPaging = () => {
    if (!paging) return;
    clearTimeout(paging.timer);
    clearInterval(paging.timer);
    paging = null;
  };
  const beginDrag = (grab: number, applied: number, layout: ScrollbarLayout) => {
    drag = { grab, applied, max: layout.maxOffset, travel: layout.travel };
    onDragging(true);
  };

  return {
    pressThumb(event, track) {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      capturePointer(event.target as Element, event.pointerId);
      const layout = track.layout;
      beginDrag(positionOnTrack(event, track) - layout.thumbPosition, layout.offset, layout);
    },

    pressTrack(event, track, mode) {
      if (event.button !== 0 || event.target !== event.currentTarget) return;
      event.preventDefault();
      // The Stage listens for presses on an ancestor of the bar: the bar's press is not a page's.
      event.stopPropagation();
      capturePointer(event.currentTarget as Element, event.pointerId);
      const position = (lastPointer = positionOnTrack(event, track));
      const { layout, stage, vertical } = track;

      if (mode === 'jump') {
        // The thumb lands centred under the pointer, and the press goes on as a drag.
        const wanted =
          layout.travel > 0
            ? clamp01((position - layout.thumbLength / 2) / layout.travel) * layout.maxOffset
            : 0;
        stage.scrollTo(vertical ? { top: wanted } : { left: wanted });
        beginDrag(layout.thumbLength / 2, wanted, layout);
        return;
      }

      // Step toward the pointer, repeat while held, and stop once the thumb reaches it.
      const direction = position < layout.thumbPosition ? -1 : 1;
      const step = () => {
        const live = track.liveLayout();
        const reached =
          direction === 1
            ? lastPointer <= live.thumbPosition + live.thumbLength
            : lastPointer >= live.thumbPosition;
        if (reached) {
          stopPaging();
          return;
        }
        const distance = direction * live.client * 0.9;
        stage.scrollBy(vertical ? { top: distance } : { left: distance });
      };
      step();
      // The native cadence: a beat before the repeat starts, then a steady march.
      const timer = window.setTimeout(() => {
        if (paging) paging.timer = window.setInterval(step, 80);
      }, 350);
      paging = { timer };
    },

    move(event, track) {
      if (drag) {
        if (drag.travel <= 0) return;
        const wanted =
          clamp01((positionOnTrack(event, track) - drag.grab) / drag.travel) * drag.max;
        const delta = wanted - drag.applied;
        if (delta) {
          track.stage.panBy(track.vertical ? 0 : -delta, track.vertical ? -delta : 0);
          drag.applied = wanted;
        }
      } else if (paging) {
        lastPointer = positionOnTrack(event, track);
      }
    },

    release() {
      drag = null;
      stopPaging();
      onDragging(false);
    },
  };
}

/** The bar as it is now: what its listeners read at each event. */
export interface ScrollbarState extends Omit<ScrollbarTrack, 'element'> {
  /**
   * What a press on the track does: `'page'` steps toward the pointer and repeats while held,
   * `'jump'` puts the thumb under the pointer and goes on as a drag.
   */
  readonly trackPress: 'page' | 'jump';
}

export interface AttachScrollbarOptions {
  /** The bar as it is now. Read at every event, so it is never an earlier render's. */
  bar(): ScrollbarState;
  /** A drag started or ended, for the bar's `data-dragging` and to keep it shown. */
  onDragging(dragging: boolean): void;
}

/**
 * Bind a scrollbar's track element, with the thumb inside it: its presses, the moves that follow
 * them (pointer capture sends those to the bar) and their release. A press on the track itself
 * pages or jumps; a press anywhere else in it is on the thumb, and starts a drag.
 *
 * The Stage listens for presses on an ancestor of the bar, so the bar takes its own on a native
 * listener, which runs before the Stage's and stops them there. A framework's own handler may run
 * too late: React and Svelte dispatch from their root, after the Stage has begun a pan with the
 * press. Returns the detach, which also ends a press under way.
 */
export function attachScrollbar(element: HTMLElement, options: AttachScrollbarOptions): () => void {
  const presses = createScrollbarPresses(options.onDragging);
  const track = (): ScrollbarTrack => ({ ...options.bar(), element });

  const detachPress = isolatePointerDown(element, (event) => {
    if (event.target === element) presses.pressTrack(event, track(), options.bar().trackPress);
    else presses.pressThumb(event, track());
  });
  const onMove = (event: PointerEvent) => presses.move(event, track());
  const onRelease = () => presses.release();
  element.addEventListener('pointermove', onMove);
  element.addEventListener('pointerup', onRelease);
  element.addEventListener('pointercancel', onRelease);

  return () => {
    detachPress();
    element.removeEventListener('pointermove', onMove);
    element.removeEventListener('pointerup', onRelease);
    element.removeEventListener('pointercancel', onRelease);
    presses.release();
  };
}
