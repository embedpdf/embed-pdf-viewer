/**
 * The wheel, and whose it is. A scrolling element hands the wheel to the page
 * around it once it can't scroll that way. The Stage is a camera, not a
 * scroller, so it gives that answer itself: `wheelBy` pans and returns true,
 * or returns false for a wheel it leaves to the page, which the surface
 * binding then lets the browser have.
 *
 * The answer holds for a whole stream (the wheels between two pauses, as in
 * `navigation/turn.ts`) and comes from its first wheel, the way a browser
 * picks what a scroll gesture scrolls. A stream is the Stage's when it begins
 * with somewhere to go. So scrolling down to the end stops there, momentum
 * included, and the next push scrolls the page.
 *
 * A trackpad leaves no pause before that next push: a swipe coasts for a
 * second or more, and the next one begins before it stops. So a new push
 * (`coasting.ts`) begins the next stream too. It is the Stage's without
 * asking when the one before it was still moving the pages.
 *
 * Page turns go by the same streams: a new push is the next one to turn a
 * page with, whether or not the wheel chains.
 */
import type { Cancel, PluginContext } from '@embedpdf/core';

import type { StageHostCapability } from '../host-contract';
import type { StageModel } from '../model';
import { QUIET_MS, type StageTurns } from '../navigation/turn';
import type { StageServices } from '../services';
import { createCoasting } from './coasting';
import type { StageGestures } from './gestures';

export function createWheel(
  ctx: PluginContext<StageModel>,
  { clock }: Pick<StageServices, 'clock'>,
  turns: Pick<StageTurns, 'leadsSomewhere' | 'pushBegan'>,
  { panBy }: Pick<StageGestures['api'], 'panBy'>,
) {
  /** Whether the stream in progress is the Stage's; null between streams. */
  let taken: boolean | null = null;
  /** The stream is moving the pages: it is the Stage's, and its last wheel had somewhere to go. */
  let moving = false;
  const coasting = createCoasting();
  let cancelQuiet: Cancel | null = null;

  /** End the stream after a pause; every wheel restarts the countdown. */
  const closeWhenQuiet = () => {
    cancelQuiet?.();
    cancelQuiet = clock.after(QUIET_MS, () => {
      cancelQuiet = null;
      taken = null;
      moving = false;
      coasting.forget();
    });
  };

  return {
    api: {
      wheelBy: (dx, dy, timeMs) => {
        const chains = ctx.state.get().scrollChaining;
        // A wheel that moves nothing says nothing about where its stream is
        // headed. It's kept, so the browser starts no scroll with a stream
        // that has no direction yet.
        if (dx === 0 && dy === 0) return !chains || (taken ?? true);
        const room = turns.leadsSomewhere({ x: dx, y: dy });
        if (coasting.brokenBy(Math.max(Math.abs(dx), Math.abs(dy)), timeMs)) {
          turns.pushBegan();
          // Stopped at an end, the Stage holds what coasts in and no more: the
          // new push is decided afresh, as it is after a stream the page took.
          // One that follows a stream still moving the pages stays the
          // Stage's, wherever it heads.
          if (!moving) taken = null;
        }
        taken ??= room;
        moving = taken && room;
        closeWhenQuiet();
        // With chaining off every wheel is the Stage's.
        if (chains && !taken) return false;
        panBy(dx, dy);
        return true;
      },
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageWheel = ReturnType<typeof createWheel>;
