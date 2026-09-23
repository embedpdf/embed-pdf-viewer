/**
 * The host timing seam. Frame timing enters through the scheduler: by default
 * it binds to the host's frame clock (`requestAnimationFrame`) when one
 * exists, a configured scheduler overrides it (tests inject one), and a host
 * without frames degrades to instant navigation with no animation.
 */
import type { Scheduler, StageConfig } from '../contract';

export function createScheduler(config: StageConfig) {
  const host = globalThis as {
    requestAnimationFrame?: (callback: (timestamp: number) => void) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  const canAnimate = !!config.scheduler || typeof host.requestAnimationFrame === 'function';
  const scheduler: Scheduler =
    config.scheduler ??
    (typeof host.requestAnimationFrame === 'function'
      ? {
          raf: (callback) => host.requestAnimationFrame!(callback),
          caf: (handle) => host.cancelAnimationFrame!(handle),
        }
      : { raf: () => 0, caf: () => {} });
  return { canAnimate, scheduler };
}
export type StageScheduler = ReturnType<typeof createScheduler>;
