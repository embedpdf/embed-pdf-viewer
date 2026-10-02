/**
 * Plugin-private services every area is built on (not the kernel): the
 * events, the binaries resource, the asset engine port, the ghost renderer
 * and the document a placing verb acts on.
 */
import { createAssetEngine, type StampAssetEngineService } from './asset-engine';
import { createBinaries, type StampBinaries } from './binaries';
import type { StampContext } from './context';
import { createTargets, type StampTargets } from './documents';
import { createEvents, type StampEvents } from './events';
import { createGhosts, type StampGhosts } from './ghosts';

export type { StampContext } from './context';

export interface StampServices {
  readonly events: StampEvents;
  readonly binaries: StampBinaries;
  readonly assetEngine: StampAssetEngineService;
  readonly ghosts: StampGhosts;
  readonly targets: StampTargets;
}

export function createServices(ctx: StampContext): StampServices {
  const binaries = createBinaries(ctx);
  const assetEngine = createAssetEngine(ctx);
  return {
    events: createEvents(ctx),
    binaries,
    assetEngine,
    ghosts: createGhosts(assetEngine, binaries),
    targets: createTargets(ctx),
  };
}
