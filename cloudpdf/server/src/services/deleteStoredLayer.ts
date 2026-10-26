import { sql, type Kysely } from 'kysely';

import type { DocumentsRepo } from '../db/repos/documents.repo';
import { ObjectNumbersRepo } from '../db/repos/object_numbers.repo';
import type { Database as Schema } from '../db/schema';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';

export interface StoredLayerDeps {
  db: Kysely<Schema>;
  storage: ObjectStore;
  documents: DocumentsRepo;
}

/**
 * Delete what a layer stored: its artifacts, renders and change captures,
 * its changes, audit rows, signings, password sessions and object numbers.
 * A written layer keeps its row as a tombstone, with its version counters
 * and its pages' (no content), and its name is refused from then on
 * (`LayerDeleted`): its read URLs were cached as immutable, and a layer
 * made again under the name would restart at the same versions. A layer
 * nobody wrote stored nothing under its name, so its name stays usable.
 * Deleting again changes nothing.
 *
 * The tombstone moves the layer's version, so a write in flight on another
 * replica loses its commit, and its retry finds the name deleted. Where the
 * engine runs, `LayerService.deleteLayer` also waits for this replica's
 * writes and closes the layer's worker session.
 */
export async function deleteStoredLayer(
  deps: StoredLayerDeps,
  tenantId: string,
  input: { docId: string; layerName: string },
): Promise<void> {
  const { db, storage } = deps;
  const { docId, layerName } = input;
  await deps.documents.requireOwned(docId, tenantId);
  const signings = await db.transaction().execute(async (trx) => {
    await trx
      .deleteFrom('pdf_password_sessions')
      .where('tenant_id', '=', tenantId)
      .where('doc_id', '=', docId)
      .where('layer_name', '=', layerName)
      .execute();
    await new ObjectNumbersRepo().deleteNumbering(trx, { docId, layerName });
    const layer = await trx
      .selectFrom('layers')
      .select(['id', 'deleted_at'])
      .where('doc_id', '=', docId)
      .where('name', '=', layerName)
      .executeTakeFirst();
    if (!layer) return [];
    if (layer.deleted_at === null) {
      const now = Date.now();
      await trx
        .updateTable('layers')
        .set({
          deleted_at: now,
          current_version: sql`current_version + 1`,
          current_artifact_key: null,
          current_artifact_sha: null,
          current_artifact_size: null,
          updated_at: now,
        })
        .where('id', '=', layer.id)
        .where('deleted_at', 'is', null)
        .execute();
    }
    const owned = await trx
      .selectFrom('document_signings')
      .select('id')
      .where('layer_id', '=', layer.id)
      .execute();
    for (const table of ['change_outcomes', 'audit_log', 'document_signings'] as const) {
      await trx.deleteFrom(table).where('layer_id', '=', layer.id).execute();
    }
    return owned.map((signing) => signing.id);
  });
  await storage.deletePrefix(StorageKeys.layerRoot(tenantId, docId, layerName));
  await Promise.all(
    signings.map((id) =>
      storage.delete(StorageKeys.signingTail(tenantId, docId, id)).catch(() => false),
    ),
  );
}
