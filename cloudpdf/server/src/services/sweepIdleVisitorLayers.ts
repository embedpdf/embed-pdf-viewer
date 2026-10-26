import { sql, type Kysely } from 'kysely';

import type { Database as Schema } from '../db/schema';

export interface IdleVisitorLayerSweepDeps {
  db: Kysely<Schema>;
  /** `LayerService.deleteLayer` where the engine runs, else `deleteStoredLayer`. */
  deleteLayer: (tenantId: string, input: { docId: string; layerName: string }) => Promise<void>;
}

/**
 * Delete up to `batch` visitors' layers nobody has seen for longer than
 * their link's idle time, the longest unseen first. Only links that set one
 * (`visitorLayerIdleSeconds`, for throwaway layers like examples) lose
 * layers: every other visitor's layer, and those of a deleted link, stay
 * until deleted on purpose. A visitor with the document open renews about
 * every 10 minutes and is seen each time. Safe on every replica at once:
 * deleting is idempotent. Returns how many it deleted; a layer that failed
 * to delete is tried again next time, and the failures are thrown after
 * the rest.
 */
export async function sweepIdleVisitorLayers(
  deps: IdleVisitorLayerSweepDeps,
  now: number,
  batch = 50,
): Promise<number> {
  const idle = await deps.db
    .selectFrom('layers as l')
    .innerJoin('share_grants as g', 'g.id', 'l.grant_id')
    .select(['l.tenant_id', 'l.doc_id', 'l.name'])
    .where('g.visitor_layer_idle_seconds', 'is not', null)
    .where('l.deleted_at', 'is', null)
    .where(
      sql<number>`coalesce(l.last_seen_at, l.created_at) + g.visitor_layer_idle_seconds * 1000`,
      '<',
      now,
    )
    .orderBy('l.last_seen_at')
    .limit(batch)
    .execute();
  const failures: unknown[] = [];
  let deleted = 0;
  for (const layer of idle) {
    try {
      await deps.deleteLayer(layer.tenant_id, { docId: layer.doc_id, layerName: layer.name });
      deleted += 1;
    } catch (err) {
      failures.push(err);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} idle visitor layers failed to delete`);
  }
  return deleted;
}
