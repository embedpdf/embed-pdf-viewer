/** The capability's events, minted on the instance so they are disposed with it. */
import type {
  StampArmChangedEvent,
  StampAssetCreatedEvent,
  StampAssetDeletedEvent,
  StampAssetUpdatedEvent,
  StampLibraryChangedEvent,
  StampLibraryCreatedEvent,
  StampLibraryDeletedEvent,
  StampLibraryUpdatedEvent,
} from '../contract';
import type { StampContext } from './context';

export function createEvents(ctx: StampContext) {
  return {
    libraryChanged: ctx.events.source<StampLibraryChangedEvent>(),
    libraryCreated: ctx.events.source<StampLibraryCreatedEvent>(),
    libraryUpdated: ctx.events.source<StampLibraryUpdatedEvent>(),
    libraryDeleted: ctx.events.source<StampLibraryDeletedEvent>(),
    assetCreated: ctx.events.source<StampAssetCreatedEvent>(),
    assetUpdated: ctx.events.source<StampAssetUpdatedEvent>(),
    assetDeleted: ctx.events.source<StampAssetDeletedEvent>(),
    armChanged: ctx.events.source<StampArmChangedEvent>(),
  };
}
export type StampEvents = ReturnType<typeof createEvents>;
