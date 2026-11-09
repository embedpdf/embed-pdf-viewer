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
 */
import type { Cancel, PluginContext } from '@embedpdf/core';

import type { StageHostCapability } from '../host-contract';
import type { StageModel } from '../model';
import { QUIET_MS, type StageTurns } from '../navigation/turn';
import type { StageServices } from '../services';
import type { StageGestures } from './gestures';

export function createWheel(
  ctx: PluginContext<StageModel>,
  { clock }: Pick<StageServices, 'clock'>,
  turns: Pick<StageTurns, 'leadsSomewhere'>,
  { panBy }: Pick<StageGestures['api'], 'panBy'>,
) {
  /** Whether the stream in progress is the Stage's; null between streams. */
  let taken: boolean | null = null;
  let cancelQuiet: Cancel | null = null;

  /** End the stream after a pause; every wheel restarts the countdown. */
  const closeWhenQuiet = () => {
    cancelQuiet?.();
    cancelQuiet = clock.after(QUIET_MS, () => {
      cancelQuiet = null;
      taken = null;
    });
  };

  return {
    api: {
      wheelBy: (dx, dy) => {
        if (ctx.state.get().scrollChaining) {
          // A wheel that moves nothing says nothing about where its stream is
          // headed. It's kept, so the browser starts no scroll with a stream
          // that has no direction yet.
          if (dx === 0 && dy === 0) return taken ?? true;
          taken ??= turns.leadsSomewhere({ x: dx, y: dy });
          closeWhenQuiet();
          if (!taken) return false;
        }
        panBy(dx, dy);
        return true;
      },
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageWheel = ReturnType<typeof createWheel>;
