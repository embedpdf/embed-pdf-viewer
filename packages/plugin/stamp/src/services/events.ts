/** The capability's events, minted on the instance so they are disposed with it. */
import type {
  StampArmChangedEvent,
  StampAssetEvent,
  StampLibraryChange,
  StampLibraryEvent,
} from '../contract';
import type { StampContext } from './context';

export function createEvents(ctx: StampContext) {
  return {
    libraryChanged: ctx.events.source<StampLibraryChange>(),
    libraryCreated: ctx.events.source<StampLibraryEvent>(),
    libraryUpdated: ctx.events.source<StampLibraryEvent>(),
    libraryDeleted: ctx.events.source<StampLibraryEvent>(),
    assetCreated: ctx.events.source<StampAssetEvent>(),
    assetUpdated: ctx.events.source<StampAssetEvent>(),
    assetDeleted: ctx.events.source<StampAssetEvent>(),
    armChanged: ctx.events.source<StampArmChangedEvent>(),
  };
}
export type StampEvents = ReturnType<typeof createEvents>;
