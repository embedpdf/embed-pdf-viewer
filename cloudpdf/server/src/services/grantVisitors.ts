import type { Kysely } from 'kysely';

import { visitorLayerName } from '../auth/visitor-handle';
import { GrantVisitorsRepo } from '../db/repos/grant_visitors.repo';
import type { Database as Schema } from '../db/schema';

export interface GrantVisitorDeps {
  db: Kysely<Schema>;
  /** `LayerService.deleteLayer` where the engine runs, else `deleteStoredLayer`. */
  deleteLayer: (tenantId: string, input: { docId: string; layerName: string }) => Promise<void>;
}

/**
 * Delete a grant's visitor: their answers and their own layer
 * (`visitor-<id>`, also its numbers when they never wrote). What the
 * visitors list, starting over and the idle sweep do. Deleting again
 * changes nothing.
 */
export async function deleteVisitor(
  deps: GrantVisitorDeps,
  visitor: { tenantId: string; grantId: string; visitorId: string; docId: string },
): Promise<void> {
  await deps.deleteLayer(visitor.tenantId, {
    docId: visitor.docId,
    layerName: visitorLayerName(visitor.visitorId),
  });
  await new GrantVisitorsRepo(deps.db).delete(visitor.grantId, visitor.visitorId);
}

/**
 * Delete up to `batch` visitors nobody has seen for longer than their
 * grant's idle time, the longest unseen first, with their layers. Only grants
 * that set one (`visitorIdleSeconds`, for throwaway layers like examples)
 * lose visitors; every other visitor stays until deleted on purpose. A
 * visitor with the document open renews about every 10 minutes and is seen
 * each time. Safe on every replica at once: deleting is idempotent. Returns
 * how many it deleted; a visitor that failed to delete is tried again next
 * time, and the failures are thrown after the rest.
 */
export async function sweepIdleVisitors(
  deps: GrantVisitorDeps,
  now: number,
  batch = 50,
): Promise<number> {
  const idle = await new GrantVisitorsRepo(deps.db).idle(now, batch);
  const failures: unknown[] = [];
  let deleted = 0;
  for (const visitor of idle) {
    try {
      await deleteVisitor(deps, visitor);
      deleted += 1;
    } catch (err) {
      failures.push(err);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} idle visitors failed to delete`);
  }
  return deleted;
}
