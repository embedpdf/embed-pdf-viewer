/**
 * Plugin-private services every area is built on (NOT the kernel): the
 * diffing context + change hooks, the host timing seam, the placement latch
 * and the scene model.
 */
import type { StageConfig } from '../contract';
import type { StageContext } from './context';
import { createEvents, type StageEvents } from './events';
import { createPlacementLatch, type PlacementLatch } from './placement-latch';
import { createScene, type StageScene } from './scene';
import { createScheduler, type StageScheduler } from './scheduler';

export type { StageContext } from './context';

export interface StageServices {
  /** The diffing context: every area's `ctx.dispatch` emits the change events. */
  readonly ctx: StageContext;
  readonly events: StageEvents;
  readonly scheduler: StageScheduler;
  readonly placement: PlacementLatch;
  readonly scene: StageScene;
}

export function createServices(rawCtx: StageContext, config: StageConfig): StageServices {
  const events = createEvents(rawCtx);
  return {
    ctx: events.ctx,
    events,
    scheduler: createScheduler(config),
    placement: createPlacementLatch(),
    scene: createScene(events.ctx),
  };
}
