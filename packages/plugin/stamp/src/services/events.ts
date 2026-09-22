/** The eight change hooks; disposed with the plugin. */
import { createEventHook } from '@embedpdf/core';

import type {
  StampArmChangedEvent,
  StampAssetEvent,
  StampLibraryChange,
  StampLibraryEvent,
} from '../contract';
import type { StampContext } from './context';

export function createEvents(ctx: StampContext) {
  const reportListener = (error: unknown) =>
    globalThis.console?.error('[stamp] event listener failed:', error);
  const libraryChanged = createEventHook<StampLibraryChange>(reportListener);
  const libraryCreated = createEventHook<StampLibraryEvent>(reportListener);
  const libraryUpdated = createEventHook<StampLibraryEvent>(reportListener);
  const libraryDeleted = createEventHook<StampLibraryEvent>(reportListener);
  const assetCreated = createEventHook<StampAssetEvent>(reportListener);
  const assetUpdated = createEventHook<StampAssetEvent>(reportListener);
  const assetDeleted = createEventHook<StampAssetEvent>(reportListener);
  const armChanged = createEventHook<StampArmChangedEvent>(reportListener);
  ctx.cleanup(() => {
    for (const hook of [
      libraryChanged,
      libraryCreated,
      libraryUpdated,
      libraryDeleted,
      assetCreated,
      assetUpdated,
      assetDeleted,
      armChanged,
    ])
      hook.dispose();
  });
  return {
    libraryChanged,
    libraryCreated,
    libraryUpdated,
    libraryDeleted,
    assetCreated,
    assetUpdated,
    assetDeleted,
    armChanged,
  };
}
export type StampEvents = ReturnType<typeof createEvents>;
