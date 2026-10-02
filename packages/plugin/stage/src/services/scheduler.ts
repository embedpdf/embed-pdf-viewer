/**
 * The host timing seam. Frame timing enters through the scheduler: by default
 * it binds to the host's frame clock (`requestAnimationFrame`) when one
 * exists, a configured scheduler overrides it (tests inject one), and a host
 * without frames degrades to instant navigation with no animation.
 *
 * The instance owns its frames: the ones still scheduled when it closes are
 * cancelled, and none are scheduled after that. Every loop the stage runs (a
 * tween, a fling, the camera-rest countdown) goes through here, so none of
 * them can write into a closed instance, however the document was closed.
 */
import type { PluginContext } from '@embedpdf/core';

import type { Scheduler, StageConfig } from '../contract';
import type { StageState } from '../model';

export function createScheduler(ctx: PluginContext<StageState>, config: StageConfig) {
  const host = globalThis as {
    requestAnimationFrame?: (callback: (timestamp: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const canAnimate = !!config.scheduler || typeof host.requestAnimationFrame === 'function';
  const frames: Scheduler =
    config.scheduler ??
    (typeof host.requestAnimationFrame === 'function'
      ? {
          raf: (callback) => host.requestAnimationFrame!(callback),
          caf: (handle) => host.cancelAnimationFrame!(handle),
        }
      : { raf: () => 0, caf: () => {} });

  const scheduled = new Set<number>();
  let closed = false;
  ctx.cleanup(() => {
    closed = true;
    for (const handle of scheduled) frames.caf(handle);
    scheduled.clear();
  });

  const scheduler: Scheduler = {
    // 0 is "no frame", as callers already read it.
    raf: (callback) => {
      if (closed) return 0;
      let handle = 0;
      handle = frames.raf((timestamp) => {
        scheduled.delete(handle);
        callback(timestamp);
      });
      scheduled.add(handle);
      return handle;
    },
    caf: (handle) => {
      scheduled.delete(handle);
      frames.caf(handle);
    },
  };
  return { canAnimate, scheduler };
}
export type StageScheduler = ReturnType<typeof createScheduler>;
