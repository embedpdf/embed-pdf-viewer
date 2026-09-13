/**
 * W1 of the signatures server phase: the base version catalog, the
 * durable signing rows, the sha-addressed storage keys, and the laws the
 * layer state derives from them (seeds from the base version, divergence
 * behind the head).
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  BaseVersionsRepo,
  DocumentPagesRepo,
  DocumentSigningsRepo,
  DocumentsRepo,
  INITIAL_BASE_POINTERS,
  LayerPagesRepo,
  LayerService,
  LayerStateService,
  LayersRepo,
  createSqliteDb,
  migrate,
  sqliteMigrations,
  type DbSchema,
} from '../src/index';
import { StorageKeys } from '../src/storage/keys';

const TENANT = 'tenant-versions';
const DOC = 'doc-versions';
const SHA1 = 'a'.repeat(64);
const SHA2 = 'b'.repeat(64);
const ctx = { tenantId: TENANT, sub: 'user-1' };

let db: Kysely<DbSchema>;

beforeEach(async () => {
  db = createSqliteDb({ path: ':memory:' });
});
afterEach(async () => {
  await db.destroy();
});

async function migrateAll(): Promise<void> {
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
}

async function seedReadyDocument(): Promise<void> {
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const documents = new DocumentsRepo(db);
  await documents.createPending({ id: DOC, tenantId: TENANT, metadata: null, idempotencyKey: null, createdBy: null });
  const committed = await documents.commit({ id: DOC, tenantId: TENANT, baseSha: SHA1, storageSizeBytes: 1234 });
  expect(committed?.state).toBe('ready');
  await new BaseVersionsRepo(db).insertInitial({ tenantId: TENANT, docId: DOC, sha256: SHA1, byteLength: 1234, createdAt: 1 });
  await new DocumentPagesRepo(db).upsertForDocument(DOC, [
    { pageObjectNumber: 11, hasWeakAnnotations: false },
    { pageObjectNumber: 22, hasWeakAnnotations: false },
  ]);
}

function services() {
  const layerState = new LayerStateService({
    documentPages: new DocumentPagesRepo(db),
    layers: new LayersRepo(db),
    layerPages: new LayerPagesRepo(db),
    documents: new DocumentsRepo(db),
    baseVersions: new BaseVersionsRepo(db),
  });
  const layerService = new LayerService({ documents: new DocumentsRepo(db), layerState });
  return { layerState, layerService };
}

/** Publish SHA2 as version 2 with metadata at epoch 2, and move the head. */
async function publishVersion2(): Promise<void> {
  const baseVersions = new BaseVersionsRepo(db);
  const v1 = await baseVersions.require(DOC, SHA1);
  await db.transaction().execute(async (trx) => {
    await baseVersions.insertPublished(trx, {
      tenantId: TENANT,
      docId: DOC,
      sha256: SHA2,
      byteLength: 2345,
      parent: v1,
      signingId: 'signing-1',
      storageKey: StorageKeys.baseVersionPdf(TENANT, DOC, SHA2),
      ...INITIAL_BASE_POINTERS,
      metadataVersion: 2,
      createdAt: 2,
    });
    await trx.updateTable('documents').set({ base_sha: SHA2, doc_version: 5 }).where('id', '=', DOC).execute();
  });
}

describe('storage keys', () => {
  test('base versions are sha-addressed under the document; tails under signings', () => {
    expect(StorageKeys.baseVersionPdf(TENANT, DOC, SHA2)).toBe(
      `${StorageKeys.docRoot(TENANT, DOC)}versions/${SHA2}.pdf`,
    );
    expect(StorageKeys.signingTail(TENANT, DOC, 'sig_abc-123')).toBe(
      `${StorageKeys.docRoot(TENANT, DOC)}signings/sig_abc-123.tail`,
    );
    expect(() => StorageKeys.baseVersionPdf(TENANT, DOC, 'not-a-sha')).toThrow(/bad sha256/);
    expect(() => StorageKeys.signingTail(TENANT, DOC, '../escape')).toThrow(/bad signing id/);
  });
});

describe('migration 030', () => {
  test('backfills version 1 for every document with a base and stamps layers with the head', async () => {
    const upTo029 = sqliteMigrations.filter((m) => m.version < '030');
    expect(upTo029).toHaveLength(sqliteMigrations.length - 1);
    await migrate(db, { source: { kind: 'inline', migrations: upTo029 } });
    const now = 1000;
    await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
    const documents = new DocumentsRepo(db);
    await documents.createPending({ id: DOC, tenantId: TENANT, metadata: null, idempotencyKey: null, createdBy: null });
    await documents.commit({ id: DOC, tenantId: TENANT, baseSha: SHA1, storageSizeBytes: 777 });
    await documents.createPending({ id: 'doc-pending', tenantId: TENANT, metadata: null, idempotencyKey: null, createdBy: null });
    await db
      .insertInto('layers')
      .values({ id: 'layer-old', doc_id: DOC, tenant_id: TENANT, name: 'alice', created_at: now, updated_at: now } as never)
      .execute();

    await migrateAll();

    const versions = await new BaseVersionsRepo(db).listForDocument(DOC);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      sha256: SHA1,
      byteLength: 777,
      number: 1,
      parentSha256: null,
      producerKind: 'upload',
      storageKey: null,
      ...INITIAL_BASE_POINTERS,
    });
    // A document without a base has no version yet.
    expect(await new BaseVersionsRepo(db).listForDocument('doc-pending')).toEqual([]);
    const layer = await new LayersRepo(db).findByDocAndName(DOC, 'alice');
    expect(layer?.baseSha).toBe(SHA1);
  });
});

describe('BaseVersionsRepo', () => {
  beforeEach(async () => {
    await migrateAll();
    await seedReadyDocument();
  });

  test('version 1 is idempotent; a published version numbers after its parent and never twice', async () => {
    const repo = new BaseVersionsRepo(db);
    await repo.insertInitial({ tenantId: TENANT, docId: DOC, sha256: SHA1, byteLength: 1234, createdAt: 9 });
    expect(await repo.listForDocument(DOC)).toHaveLength(1);

    await publishVersion2();
    const versions = await repo.listForDocument(DOC);
    expect(versions.map((v) => [v.number, v.sha256, v.parentSha256, v.producerKind, v.producerRef])).toEqual([
      [1, SHA1, null, 'upload', null],
      [2, SHA2, SHA1, 'signature', 'signing-1'],
    ]);
    expect(versions[1]?.storageKey).toBe(StorageKeys.baseVersionPdf(TENANT, DOC, SHA2));
    expect(versions[1]?.metadataVersion).toBe(2);

    // Two completions over the same parent cannot both become number 2.
    const v1 = await repo.require(DOC, SHA1);
    await expect(
      db.transaction().execute((trx) =>
        repo.insertPublished(trx, {
          tenantId: TENANT,
          docId: DOC,
          sha256: 'c'.repeat(64),
          byteLength: 1,
          parent: v1,
          signingId: 'signing-2',
          storageKey: StorageKeys.baseVersionPdf(TENANT, DOC, 'c'.repeat(64)),
          ...INITIAL_BASE_POINTERS,
          createdAt: 3,
        }),
      ),
    ).rejects.toThrow(/UNIQUE|unique/);
  });
});

describe('DocumentSigningsRepo', () => {
  beforeEach(async () => {
    await migrateAll();
    await seedReadyDocument();
  });

  const prepared = (id: string, layerId: string, expiresAt: number) => ({
    id,
    tenantId: TENANT,
    docId: DOC,
    layerId,
    layerName: 'alice',
    expectedBaseSha: SHA1,
    expectedLayerVersion: 1,
    baseByteLength: 1234,
    tailKey: StorageKeys.signingTail(TENANT, DOC, id),
    tailSha: 'd'.repeat(64),
    tailSize: 99,
    fieldObjectNumber: 42,
    preparedJson: '{}',
    createdBy: 'user-1',
    createdAt: 10,
    expiresAt,
  });

  test('one pending signing per layer; the completion claim is guarded by state and expiry', async () => {
    const { layerService } = services();
    const { layer } = await layerService.materializeLayerForWrite(ctx, DOC, 'alice');
    const repo = new DocumentSigningsRepo(db);

    const row = await db.transaction().execute((trx) => repo.insertPrepared(trx, prepared('sig-1', layer.id, 10_000)));
    expect(row.state).toBe('prepared');
    expect(await repo.findPending(layer.id)).toMatchObject({ id: 'sig-1' });
    // The partial unique index: a second prepare on the layer fails.
    await expect(
      db.transaction().execute((trx) => repo.insertPrepared(trx, prepared('sig-2', layer.id, 10_000))),
    ).rejects.toThrow(/UNIQUE|unique/);

    // Claim: exactly one caller wins; a second claim sees the row gone from `prepared`.
    expect(await repo.transition(db, 'sig-1', 'prepared', 'completed', { cmsSha256: 'e'.repeat(64), finishedAt: 500 }, { notExpiredAt: 500 })).toBe(true);
    expect(await repo.transition(db, 'sig-1', 'prepared', 'completed', {}, { notExpiredAt: 500 })).toBe(false);
    expect(await repo.find('sig-1')).toMatchObject({ state: 'completed', cmsSha256: 'e'.repeat(64), finishedAt: 500 });
    expect(await repo.findPending(layer.id)).toBeNull();

    // After completion the layer can prepare again; an expired row cannot be claimed and is swept.
    await db.transaction().execute((trx) => repo.insertPrepared(trx, prepared('sig-3', layer.id, 600)));
    expect(await repo.transition(db, 'sig-3', 'prepared', 'completed', {}, { notExpiredAt: 700 })).toBe(false);
    expect(await repo.expireDue(700)).toEqual([{ id: 'sig-3', tailKey: StorageKeys.signingTail(TENANT, DOC, 'sig-3') }]);
    expect(await repo.expireDue(700)).toEqual([]);
    expect((await repo.find('sig-3'))?.state).toBe('expired');
    expect((await repo.listForDocument(DOC)).map((s) => s.id)).toEqual(['sig-3', 'sig-1']);
  });
});

describe('layers over base versions', () => {
  beforeEach(async () => {
    await migrateAll();
    await seedReadyDocument();
  });

  test('a new layer is seeded from the head: its sha, its docVersion, its version pointers', async () => {
    const { layerService, layerState } = services();
    const alice = await layerService.materializeLayerForWrite(ctx, DOC, 'alice');
    expect(alice.layer).toMatchObject({ baseSha: SHA1, docVersion: 1, ...INITIAL_BASE_POINTERS, currentVersion: 0 });

    await publishVersion2();
    const bob = await layerService.materializeLayerForWrite(ctx, DOC, 'bob');
    expect(bob.layer).toMatchObject({ baseSha: SHA2, docVersion: 5, metadataVersion: 2, layoutVersion: 1 });

    // Bob inherits every plane at the head's epochs (metadata 2 = 2 is
    // inherited, not owned); Alice is behind the head: diverged everywhere.
    expect(await layerState.computeLayerScopesFromDb(DOC, 'bob')).toEqual({
      content: 'base',
      annotations: 'base',
      layout: 'base',
      attachments: 'base',
      metadata: 'base',
      actions: 'base',
    });
    expect(await layerState.computeLayerScopesFromDb(DOC, 'alice')).toEqual({
      content: 'layer',
      annotations: 'layer',
      layout: 'layer',
      attachments: 'layer',
      metadata: 'layer',
      actions: 'base',
    });
    // A never-written layer name is trivially inherited.
    expect(await layerState.computeLayerScopesFromDb(DOC, 'carol')).toMatchObject({ content: 'base', metadata: 'base' });
  });

  test('manifests carry the signing fences and the version facts', async () => {
    const { layerService, layerState } = services();
    const head = await layerState.headBaseFacts(DOC);
    expect(head).toEqual({ sha256: SHA1, byteLength: 1234, ...INITIAL_BASE_POINTERS });
    const alice = await layerService.materializeLayerForWrite(ctx, DOC, 'alice');
    const manifest = layerState.buildLayerManifest(
      DOC,
      head!,
      'alice',
      alice.layer,
      alice.pages,
      layerState.computeLayerScopes(alice.layer, alice.pages, alice.pages, head),
    );
    expect(manifest).toMatchObject({ baseSha: SHA1, baseByteLength: 1234, layerVersion: 0, working: false, docVersion: 1 });
    const base = layerState.buildBaseManifest(
      { id: DOC, baseSha: SHA1, docVersion: 1 } as never,
      alice.pages,
      { ...head!, metadataVersion: 3 },
    );
    expect(base).toMatchObject({ metadataVersion: 3, layerVersion: 0, working: false, baseByteLength: 1234 });
    // A published version's facts fall back to the initial epochs only when uncatalogued.
    expect(await layerState.baseVersionFacts(DOC, 'f'.repeat(64), 55)).toEqual({ sha256: 'f'.repeat(64), byteLength: 55, ...INITIAL_BASE_POINTERS });
  });
});
