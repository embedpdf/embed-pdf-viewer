/**
 * Migration 044's data rewrite, on either database. Before 044 a signature
 * moved the document: Alice's signature made SHA2 the document's base, Bob
 * and Dave started on it, and a later signature (SHA3) went with its deleted
 * layer's signing row. After 044 the version is Alice's, the document is its
 * upload again (its page rows go, read again from the upload), Bob (nothing
 * stored) starts over on the upload, Dave (changes over SHA2) keeps it, and
 * the orphan version goes.
 */
import type { Kysely } from 'kysely';
import { expect } from 'vitest';

import {
  BaseVersionsRepo,
  DocumentPagesRepo,
  DocumentSigningsRepo,
  DocumentsRepo,
  LayerPagesRepo,
  LayerService,
  LayerStateService,
  LayersRepo,
  migrate,
  type DbSchema,
  type MigrationSource,
} from '../../src/index';
import { StorageKeys } from '../../src/storage/keys';

const TENANT = 'tenant-044';
const DOC = 'doc-044';
const SHA1 = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);
const SHA3 = 'c'.repeat(64);

export async function checkVersionsByLayerMigration(
  db: Kysely<DbSchema>,
  migrations: ReadonlyArray<MigrationSource>,
): Promise<void> {
  const upTo043 = migrations.filter((m) => m.version < '044');
  expect(upTo043.at(-1)?.version).toBe('043');
  await migrate(db, { source: { kind: 'inline', migrations: upTo043 } });

  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const documents = new DocumentsRepo(db);
  await documents.createPending({
    id: DOC,
    tenantId: TENANT,
    metadata: null,
    idempotencyKey: null,
    createdBy: null,
  });
  await documents.commit({ id: DOC, tenantId: TENANT, baseSha: SHA1, storageSizeBytes: 1234 });
  await new DocumentPagesRepo(db).upsertForDocument(DOC, [{ pageObjectNumber: 11 }]);
  const version = (sha: string, number: number, parent: string | null, ref: string | null) => ({
    tenant_id: TENANT,
    doc_id: DOC,
    sha256: sha,
    byte_length: parent === null ? 1234 : 2345,
    number,
    parent_sha256: parent,
    producer_kind: ref === null ? 'upload' : 'signature',
    producer_ref: ref,
    storage_key: ref === null ? null : `versions/${sha}.pdf`,
    created_at: number,
  });
  await db
    .insertInto('base_versions')
    .values([version(SHA1, 1, null, null)] as never)
    .execute();

  const layerState = new LayerStateService({
    documentPages: new DocumentPagesRepo(db),
    layers: new LayersRepo(db),
    layerPages: new LayerPagesRepo(db),
    documents,
    baseVersions: new BaseVersionsRepo(db),
  });
  const layerService = new LayerService({ documents, layerState });
  const layerIds: Record<string, string> = {};
  for (const name of ['alice', 'bob', 'dave']) {
    const { layer } = await layerService.materializeLayerForWrite(
      { tenantId: TENANT, sub: 'user-1' },
      DOC,
      name,
    );
    layerIds[name] = layer.id;
  }

  await db.transaction().execute(async (trx) => {
    await new DocumentSigningsRepo(db).insertPrepared(trx, {
      id: 'sig-alice',
      tenantId: TENANT,
      docId: DOC,
      layerId: layerIds['alice']!,
      layerName: 'alice',
      expectedBaseSha: SHA1,
      expectedLayerVersion: 1,
      baseByteLength: 1234,
      tailKey: StorageKeys.signingTail(TENANT, DOC, 'sig-alice'),
      tailSha: 'd'.repeat(64),
      tailSize: 9,
      fieldObjectNumber: 42,
      preparedJson: '{}',
      createdBy: 'user-1',
      createdAt: 10,
      expiresAt: 10_000,
    });
    await trx
      .insertInto('base_versions')
      .values([version(SHA2, 2, SHA1, 'sig-alice'), version(SHA3, 3, SHA2, 'sig-gone')] as never)
      .execute();
    await trx
      .updateTable('documents')
      .set({ base_sha: SHA2, storage_size_bytes: 2345, doc_version: 5 })
      .where('id', '=', DOC)
      .execute();
    await trx.updateTable('layers').set({ base_sha: SHA2 }).execute();
    await trx
      .updateTable('layers')
      .set({ current_artifact_key: 'dave.layer' })
      .where('id', '=', layerIds['dave']!)
      .execute();
  });

  await migrate(db, { source: { kind: 'inline', migrations } });

  const versions = await new BaseVersionsRepo(db).listForDocument(DOC);
  expect(versions.map((v) => [v.sha256, v.layerId])).toEqual([
    [SHA1, null],
    [SHA2, layerIds['alice']],
  ]);
  expect(await documents.findById(DOC)).toMatchObject({
    baseSha: SHA1,
    storageSizeBytes: 1234,
    docVersion: 6,
  });
  expect(await new DocumentPagesRepo(db).hasRows(DOC)).toBe(false);
  const layers = new LayersRepo(db);
  expect((await layers.findByDocAndName(DOC, 'alice'))?.baseSha).toBe(SHA2);
  expect(await layers.findByDocAndName(DOC, 'bob')).toMatchObject({ baseSha: SHA1, docVersion: 2 });
  expect((await layers.findByDocAndName(DOC, 'dave'))?.baseSha).toBe(SHA2);
}
