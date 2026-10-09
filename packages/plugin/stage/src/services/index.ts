/**
 * Plugin-private services every area is built on: the events, the host's
 * clock, the placement latch and the scene model.
 */
import type { PluginClock, PluginContext } from '@embedpdf/core';

import type { StageState } from '../model';
import { createEvents, type StageEvents } from './events';
import { createPlacementLatch, type PlacementLatch } from './placement-latch';
import { createScene, type StageScene } from './scene';

export interface StageServices {
  readonly events: StageEvents;
  /** Time, from the host (`ctx.clock`): the tweens, flings and the rest countdown run on it. */
  readonly clock: PluginClock;
  readonly placement: PlacementLatch;
  readonly scene: StageScene;
}

export function createServices(ctx: PluginContext<StageState>): StageServices {
  return {
    events: createEvents(ctx),
    clock: ctx.clock,
    placement: createPlacementLatch(),
    scene: createScene(ctx),
  };
}
