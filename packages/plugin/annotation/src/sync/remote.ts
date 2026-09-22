import { originOf, refFromStableId, type DocumentEvent } from '@embedpdf/core';
import { isSubstrateOnly, type Annot } from '@embedpdf/core-annotation';
import { annotationKey } from '@embedpdf/engine-core/runtime';

import type { AnnotationServices } from '../services';
import type { Announcer } from '../services/announce';
import type { EngineRecord } from '../services/records';

/**
 * Folds REMOTE annotation events into the model. Hydration queues and
 * replays through the same code path, so a remote change lands identically
 * whether it arrived live or inside a hydration window.
 */
export function createRemoteSync(
  { store, geometry, records }: Pick<AnnotationServices, 'store' | 'geometry' | 'records'>,
  announce: Announcer,
) {
  /**
   * `bump` re-fetches rasters, `keep` doesn't — driven by the ENGINE'S
   * appearance echo riding the event, so a remote MOVE costs peers zero
   * re-renders while a remote restyle refreshes exactly once.
   */
  const upsertRemote = (dtos: ReadonlyArray<EngineRecord>, bumpAp: boolean): void => {
    const bump: Annot[] = [];
    const keep: Annot[] = [];
    for (const dto of dtos) {
      const crop = geometry.cropOf(dto.page.pageObjectNumber);
      if (!crop) continue;
      // Another session authored this — trust the engine's baked AP.
      const a = records.ingest(dto, crop, 'baked');
      // Substrate-only annotations (replies, review states, attached link
      // children) never paint, so their arrival must not trigger a raster
      // fetch or epoch churn. A remote link child is just an upsert — the
      // `linkOf` lens re-derives the parent's value on the next read.
      (bumpAp && !isSubstrateOnly(a) ? bump : keep).push(a);
    }
    if (bump.length) store.commit({ t: 'upsert', annots: bump, bumpAp: true });
    if (keep.length) store.commit({ t: 'upsert', annots: keep });
  };

  const apply = (event: DocumentEvent): void => {
    switch (event.type) {
      case 'annotation.created':
        // A create ships with a freshly baked /AP — fetch it.
        upsertRemote([event.created], true);
        announce.created(event.created, originOf(event));
        break;
      case 'annotation.updated':
        // The engine's verdict rides the event: preserved moves keep the
        // cached raster, regenerated appearances re-fetch exactly once.
        upsertRemote([event.updated], event.appearance.changed);
        announce.updated(event.updated, originOf(event));
        break;
      case 'annotation.moved':
        // A z-order move never touches /AP.
        upsertRemote(event.moved, false);
        break;
      case 'annotation.deleted':
        if (event.deleted) {
          const key = annotationKey(refFromStableId(event.page, event.deleted));
          // Attached link children are model annotations, so a remote child
          // delete is this same plain remove — the `linkOf` lens re-derives.
          const gone = store.model().byId[key];
          if (gone) {
            store.commit({ t: 'remove', ids: [key] });
            if (gone.ref) announce.deleted(gone.ref, gone.page, originOf(event));
          }
        }
        break;
      default:
        break;
    }
  };

  return { apply };
}

export type RemoteSync = ReturnType<typeof createRemoteSync>;
