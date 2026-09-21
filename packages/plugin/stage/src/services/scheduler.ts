/**
 * The host timing seam. Frame timing enters through the Scheduler: by
 * DEFAULT it binds to the host's own frame clock (requestAnimationFrame) when
 * one exists — inject to override (tests do); a frameless host degrades to
 * instant navigation, no animation.
 */
import type { Scheduler, StageConfig } from '../contract';

export function createScheduler(config: StageConfig) {
  const host = globalThis as {
    requestAnimationFrame?: (cb: (t: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const canAnimate = !!config.scheduler || typeof host.requestAnimationFrame === 'function';
  const scheduler: Scheduler =
    config.scheduler ??
    (typeof host.requestAnimationFrame === 'function'
      ? { raf: (cb) => host.requestAnimationFrame!(cb), caf: (h) => host.cancelAnimationFrame!(h) }
      : { raf: () => 0, caf: () => {} }); // no host frames → navigation jumps instantly
  return { canAnimate, scheduler };
}
export type StageScheduler = ReturnType<typeof createScheduler>;
