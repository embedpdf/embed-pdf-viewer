/**
 * What happens when the engine confirms a change, whoever made it:
 *
 *   - a new record this session created finds its real key (by its /NM), and
 *     the selection and text editing follow it; once the records hold it,
 *     its create change settles, whatever confirmed it;
 *   - how the record renders follows who changed it: this session's creates
 *     render live from their description, another session's changes render
 *     from the engine's raster (their appearance is the truth it baked);
 *   - the record events fire: created, updated, deleted, and resynced after
 *     a load.
 *
 * The data itself is already in the records mirror when this runs.
 */
import { originOf, type MirrorChange } from '@embedpdf/core';
import { annotationKey, refFromStableId } from '@embedpdf/engine-core/runtime';

import { preferBaked, preferVector } from '../model';
import type { AnnotationRecords } from './records';
import type { AnnotationContext, AnnotationServices } from '../services';
import type { Announcer } from '../services/announce';

export function followConfirmedChanges(
  ctx: Pick<AnnotationContext, 'state'>,
  { events, identity }: Pick<AnnotationServices, 'events' | 'identity'>,
  announce: Announcer,
): void {
  events.recordsChanged.on((change) => {
    follow(change);
    identity.settleHeldCreates();
  });

  function follow(change: MirrorChange<AnnotationRecords>): void {
    if (change.cause === 'load') {
      events.resynced.emit({ pages: change.pages ?? 'all' });
      return;
    }
    const event = change.event;
    if (!event || !('origin' in event)) return;
    const origin = originOf(event);
    const remote = event.origin.kind === 'remote';
    switch (event.type) {
      case 'annotation.created': {
        const { created } = event;
        identity.confirmByName(created.nm, created.ref);
        const key = annotationKey(created.ref);
        ctx.state.update(remote ? preferBaked : preferVector, [key]);
        announce.created(created, origin);
        return;
      }
      case 'annotation.updated':
        if (remote) ctx.state.update(preferBaked, [annotationKey(event.updated.ref)]);
        announce.updated(event.updated, origin);
        return;
      case 'annotation.deleted':
        if (event.deleted) {
          announce.deleted(refFromStableId(event.page, event.deleted), event.page, origin);
        }
        return;
      default:
        return;
    }
  }
}
