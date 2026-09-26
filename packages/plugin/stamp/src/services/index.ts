/**
 * Plugin-private services every area is built on (not the kernel): the
 * events, the binaries resource, the asset engine port and the ghost
 * renderer.
 */
import type { StampConfig } from '../contract';
import { createAssetEngine, type StampAssetEngine } from './asset-engine';
import { createBinaries, type StampBinaries } from './binaries';
import type { StampContext } from './context';
import { createEvents, type StampEvents } from './events';
import { createGhosts, type StampGhosts } from './ghosts';

export type { StampContext } from './context';

export interface StampServices {
  readonly events: StampEvents;
  readonly binaries: StampBinaries;
  readonly assetEngine: StampAssetEngine;
  readonly ghosts: StampGhosts;
}

export function createServices(ctx: StampContext, config: StampConfig): StampServices {
  const binaries = createBinaries(ctx);
  const assetEngine = createAssetEngine(ctx, config);
  return {
    events: createEvents(ctx),
    binaries,
    assetEngine,
    ghosts: createGhosts(assetEngine, binaries),
  };
}
