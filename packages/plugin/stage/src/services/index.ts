/**
 * Plugin-private services every area is built on: the events, the host timing
 * seam, the placement latch and the scene model.
 */
import type { PluginContext } from '@embedpdf/core';

import type { StageConfig } from '../contract';
import type { StageState } from '../model';
import { createEvents, type StageEvents } from './events';
import { createPlacementLatch, type PlacementLatch } from './placement-latch';
import { createScene, type StageScene } from './scene';
import { createScheduler, type StageScheduler } from './scheduler';

export interface StageServices {
  readonly events: StageEvents;
  readonly scheduler: StageScheduler;
  readonly placement: PlacementLatch;
  readonly scene: StageScene;
}

export function createServices(
  ctx: PluginContext<StageState>,
  config: StageConfig,
): StageServices {
  return {
    events: createEvents(ctx),
    scheduler: createScheduler(config),
    placement: createPlacementLatch(),
    scene: createScene(ctx),
  };
}
