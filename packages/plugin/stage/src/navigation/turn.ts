/**
 * Page turns in paged flow: a push past the edge of the page turns it, read
 * off what the host port reports (pans, the drag bracket, the release fling).
 * A push is the part of a pan the clamp refused. A stream is one drag, or one
 * push of a wheel or trackpad with its momentum: the pans up to the next
 * pause, or up to the next push the wheel tells while the last still coasts
 * (`camera/wheel.ts`). A stream turns only at an edge it began at, so reading
 * down to the bottom stops there, and it turns once: the rest of it is spent,
 * so momentum never scrolls the page that just arrived.
 *
 * In every flow it also says whether a push has anywhere to go, which is how
 * the wheel tells a stream of its own from one for the page around the viewer
 * (`camera/wheel.ts`).
 */
import type { Cancel, PluginContext } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';

import type { StageModel } from '../model';
import type { StagePageReads } from '../read/pages';
import type { StageServices } from '../services';
import type { StageArrival } from './arrive';

/** The push past an edge that turns the page, in screen px: about one wheel notch. */
const TURN_PUSH = 60;
/** The release speed past an edge that turns the page, in screen px/s: a flick. */
const TURN_FLICK = 600;
/** The pause that ends a wheel or trackpad stream. */
export const QUIET_MS = 200;

type Axis = 'x' | 'y';

/** Per axis, whether the camera can't move further toward the next page, and toward the previous. */
interface Edges {
  next: Record<Axis, boolean>;
  previous: Record<Axis, boolean>;
}

interface Stream {
  /** The edges the camera already sat at when the stream began: the only ones it turns at. */
  startedAt: Edges;
  /** The push so far, per axis, positive toward the next page. */
  push: Point;
  /** It turned: the rest of it moves nothing. */
  spent: boolean;
}

const NO_PUSH: Point = { x: 0, y: 0 };
const plus = (left: Point, right: Point): Point => ({ x: left.x + right.x, y: left.y + right.y });

export function createTurns(
  ctx: PluginContext<StageModel>,
  { scene, clock }: Pick<StageServices, 'scene' | 'clock'>,
  { scrollMetricsNow }: Pick<StagePageReads, 'scrollMetricsNow'>,
  navigation: Pick<
    StageArrival['api'],
    'nextPage' | 'previousPage' | 'canGoNext' | 'canGoPrevious'
  >,
) {
  const state = () => ctx.state.get();
  const enabled = () => scene.paged() && state().turnGestures;
  const rtl = () => state().direction === 'rtl';

  /** A screen delta in reading terms: positive toward the next page on each axis. */
  const ahead = (delta: Point): Point => ({ x: rtl() ? delta.x : -delta.x, y: -delta.y });

  // An axis that doesn't scroll sits at both of its edges.
  const edgesNow = (): Edges => {
    const metrics = scrollMetricsNow();
    const top = !metrics.scrollableY || metrics.scrollTop <= 0.5;
    const bottom =
      !metrics.scrollableY ||
      metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 0.5;
    const left = !metrics.scrollableX || metrics.scrollLeft <= 0.5;
    const right =
      !metrics.scrollableX || metrics.scrollLeft + metrics.clientWidth >= metrics.scrollWidth - 0.5;
    return {
      next: { x: rtl() ? left : right, y: bottom },
      previous: { x: rtl() ? right : left, y: top },
    };
  };

  let stream: Stream | null = null;
  let dragging = false;
  let cancelQuiet: Cancel | null = null;

  const open = (): Stream => {
    stream ??= { startedAt: edgesNow(), push: NO_PUSH, spent: false };
    return stream;
  };
  /** End the stream after a pause; every pan restarts the countdown. */
  const closeWhenQuiet = () => {
    cancelQuiet?.();
    cancelQuiet = clock.after(QUIET_MS, () => {
      cancelQuiet = null;
      stream = null;
    });
  };

  /** Turn when, on either axis, `amount` reaches `threshold` at an edge the stream began at. */
  const turnPast = (current: Stream, amount: Point, threshold: number): boolean => {
    for (const axis of ['y', 'x'] as const) {
      if (amount[axis] >= threshold && current.startedAt.next[axis] && navigation.canGoNext()) {
        current.spent = true;
        navigation.nextPage({ behavior: 'instant' });
        return true;
      }
      if (
        amount[axis] <= -threshold &&
        current.startedAt.previous[axis] &&
        navigation.canGoPrevious()
      ) {
        current.spent = true;
        // Back lands where you left it: the bottom of the previous page, or its reading end.
        navigation.previousPage({
          behavior: 'instant',
          arrivalAlign: axis === 'y' ? { y: 'end' } : { x: 'end' },
        });
        return true;
      }
    }
    return false;
  };

  return {
    /** Before a pan moves the camera. True: this stream already turned, so the pan moves nothing. */
    beforePan: (): boolean => {
      if (!enabled()) return false;
      const current = open();
      if (!dragging) closeWhenQuiet();
      return current.spent;
    },
    /** After a rigid pan: the part of it the clamp refused, in screen px. */
    refused: (delta: Point): void => {
      if (!enabled() || !stream) return;
      stream.push = plus(stream.push, ahead(delta));
      // A wheel turns as soon as it has pushed far enough; a drag waits for its release.
      if (!dragging) turnPast(stream, stream.push, TURN_PUSH);
    },
    /**
     * A wheel or trackpad pushes anew while its last push still coasts: the
     * next stream begins here, with no pause before it.
     */
    pushBegan: (): void => {
      if (!dragging) stream = null;
    },
    /** A drag begins: one stream for all of it, however long it holds still. */
    dragBegan: (): void => {
      if (!enabled()) return;
      cancelQuiet?.();
      cancelQuiet = null;
      stream = null;
      dragging = true;
      open();
    },
    /**
     * The drag ended, its finger pulled `overshoot` past the edge (screen px).
     * True: it turned the page, so nothing springs home.
     */
    dragEnded: (overshoot: Point, zoomed: boolean): boolean => {
      dragging = false;
      if (!enabled() || !stream) return false;
      // A pinch zooms; it never turns the page, nor does the fling after it.
      if (zoomed) {
        stream = null;
        return false;
      }
      closeWhenQuiet(); // the release fling comes next and belongs to this stream
      return turnPast(stream, plus(stream.push, ahead(overshoot)), TURN_PUSH);
    },
    /** The release speed, right after a drag. True: no momentum, as the page turned. */
    flung: (velocity: Point): boolean => {
      if (!enabled() || !stream) return false;
      return stream.spent || turnPast(stream, ahead(velocity), TURN_FLICK);
    },
    /**
     * Whether a push by `delta` (screen px) has anywhere to go along its longer
     * axis: the camera can move that way, or a turn has a page to turn to.
     */
    leadsSomewhere: (delta: Point): boolean => {
      const axis: Axis = Math.abs(delta.x) > Math.abs(delta.y) ? 'x' : 'y';
      const toward = ahead(delta)[axis] > 0 ? 'next' : 'previous';
      // An unbounded camera has no edges.
      if (!state().bounded || !edgesNow()[toward][axis]) return true;
      if (!enabled()) return false;
      return toward === 'next' ? navigation.canGoNext() : navigation.canGoPrevious();
    },
  };
}
export type StageTurns = ReturnType<typeof createTurns>;
