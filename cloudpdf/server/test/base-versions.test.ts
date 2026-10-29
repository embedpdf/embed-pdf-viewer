/**
 * The base version catalog, the durable signing rows, the sha-addressed
 * storage keys, and the laws the layer state derives from them. A
 * signature's version belongs to its layer and moves only that layer's
 * base; the document stays its upload, where every new layer starts.
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
import { checkVersionsByLayerMigration } from './_helpers/versions-by-layer-migration';

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
  await seedDocumentRow();
  await new BaseVersionsRepo(db).insertInitial({
    tenantId: TENANT,
    docId: DOC,
    sha256: SHA1,
    byteLength: 1234,
    createdAt: 1,
  });
}

/** The ready document and its pages, without its catalog row. */
async function seedDocumentRow(): Promise<void> {
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const documents = new DocumentsRepo(db);
  await documents.createPending({
    id: DOC,
    name: DOC,
    tenantId: TENANT,
    metadata: null,
    idempotencyKey: null,
    createdBy: null,
  });
  const committed = await documents.commit({
    id: DOC,
    tenantId: TENANT,
    baseSha: SHA1,
    storageSizeBytes: 1234,
  });
  expect(committed?.state).toBe('ready');
  await new DocumentPagesRepo(db).upsertForDocument(DOC, [
    { pageObjectNumber: 11 },
    { pageObjectNumber: 22 },
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

/** A signature in a layer, as its commit records it: SHA2 as the layer's version 2, metadata at epoch 2. */
async function signIn(layerId: string, layerName: string, sha = SHA2): Promise<void> {
  const baseVersions = new BaseVersionsRepo(db);
  const v1 = await baseVersions.require(DOC, SHA1);
  await db.transaction().execute(async (trx) => {
    await baseVersions.insertPublished(trx, {
      tenantId: TENANT,
      docId: DOC,
      layerId,
      sha256: sha,
      byteLength: 2345,
      parent: v1,
      signingId: `signing-${layerName}`,
      storageKey: StorageKeys.layerVersionPdf(TENANT, DOC, layerName, sha),
      ...INITIAL_BASE_POINTERS,
      metadataVersion: 2,
      createdAt: 2,
    });
    await trx.updateTable('layers').set({ base_sha: sha }).where('id', '=', layerId).execute();
  });
}

describe('storage keys', () => {
  test("a layer's versions are sha-addressed under the layer; tails under signings", () => {
    expect(StorageKeys.layerVersionPdf(TENANT, DOC, 'alice', SHA2)).toBe(
      `${StorageKeys.layerRoot(TENANT, DOC, 'alice')}versions/${SHA2}.pdf`,
    );
    expect(StorageKeys.signingTail(TENANT, DOC, 'sig_abc-123')).toBe(
      `${StorageKeys.docRoot(TENANT, DOC)}signings/sig_abc-123.tail`,
    );
    expect(() => StorageKeys.layerVersionPdf(TENANT, DOC, 'alice', 'not-a-sha')).toThrow(
      /bad sha256/,
    );
    expect(() => StorageKeys.signingTail(TENANT, DOC, '../escape')).toThrow(/bad signing id/);
  });
});

describe('migration 030', () => {
  test('backfills version 1 for every document with a base and stamps layers with the head', async () => {
    const upTo029 = sqliteMigrations.filter((m) => m.version < '030');
    expect(upTo029.at(-1)?.version).toBe('029');
    await migrate(db, { source: { kind: 'inline', migrations: upTo029 } });
    const now = 1000;
    await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
    const documents = new DocumentsRepo(db);
    // Inserted directly: the repo writes columns that later migrations add.
    const pendingRow = (id: string) => ({
      id,
      tenant_id: TENANT,
      state: 'pending',
      created_at: now,
      updated_at: now,
    });
    await db
      .insertInto('documents')
      .values([pendingRow(DOC), pendingRow('doc-pending')] as never)
      .execute();
    await documents.commit({ id: DOC, tenantId: TENANT, baseSha: SHA1, storageSizeBytes: 777 });
    await db
      .insertInto('layers')
      .values({
        id: 'layer-old',
        doc_id: DOC,
        tenant_id: TENANT,
        name: 'alice',
        created_at: now,
        updated_at: now,
      } as never)
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

describe('migration 044', () => {
  test('gives signed versions their layer and puts a moved document back on its upload', async () => {
    await checkVersionsByLayerMigration(db, sqliteMigrations);
  });
});

describe('BaseVersionsRepo', () => {
  beforeEach(async () => {
    await migrateAll();
    await seedReadyDocument();
  });

  test("version 1 is idempotent; a layer's version numbers after its parent, never twice in the layer", async () => {
    const repo = new BaseVersionsRepo(db);
    await repo.insertInitial({
      tenantId: TENANT,
      docId: DOC,
      sha256: SHA1,
      byteLength: 1234,
      createdAt: 9,
    });
    expect(await repo.listForDocument(DOC)).toHaveLength(1);

    const { layerService } = services();
    const alice = await layerService.materializeLayerForWrite(ctx, DOC, 'alice');
    const bob = await layerService.materializeLayerForWrite(ctx, DOC, 'bob');
    await signIn(alice.layer.id, 'alice');
    const versions = await repo.listForDocument(DOC);
    expect(
      versions.map((v) => [
        v.number,
        v.sha256,
        v.parentSha256,
        v.producerKind,
        v.producerRef,
        v.layerId,
      ]),
    ).toEqual([
      [1, SHA1, null, 'upload', null, null],
      [2, SHA2, SHA1, 'signature', 'signing-alice', alice.layer.id],
    ]);
    expect(versions[1]?.storageKey).toBe(StorageKeys.layerVersionPdf(TENANT, DOC, 'alice', SHA2));
    expect(versions[1]?.metadataVersion).toBe(2);

    // Two completions over the same parent in one layer cannot both become number 2.
    const v1 = await repo.require(DOC, SHA1);
    const another = (layerId: string, sha: string) =>
      db.transaction().execute((trx) =>
        repo.insertPublished(trx, {
          tenantId: TENANT,
          docId: DOC,
          layerId,
          sha256: sha,
          byteLength: 1,
          parent: v1,
          signingId: `signing-${sha.slice(0, 4)}`,
          storageKey: StorageKeys.layerVersionPdf(TENANT, DOC, 'x', sha),
          ...INITIAL_BASE_POINTERS,
          createdAt: 3,
        }),
      );
    await expect(another(alice.layer.id, 'c'.repeat(64))).rejects.toThrow(/UNIQUE|unique/);
    // Another layer's signature over the upload is that layer's own version 2.
    await another(bob.layer.id, 'd'.repeat(64));
    expect((await repo.find(DOC, 'd'.repeat(64)))?.number).toBe(2);
  });

  test("deleting a layer's versions keeps one another live layer is on", async () => {
    const repo = new BaseVersionsRepo(db);
    const { layerService } = services();
    const alice = await layerService.materializeLayerForWrite(ctx, DOC, 'alice');
    const bob = await layerService.materializeLayerForWrite(ctx, DOC, 'bob');
    await signIn(alice.layer.id, 'alice');
    await signIn(bob.layer.id, 'bob', 'c'.repeat(64));
    // Only data from before migration 044 can have a layer on another layer's version.
    await db
      .updateTable('layers')
      .set({ base_sha: 'c'.repeat(64) })
      .where('id', '=', alice.layer.id)
      .execute();

    await repo.deleteForLayer(db, DOC, alice.layer.id);
    await repo.deleteForLayer(db, DOC, bob.layer.id);
    expect((await repo.listForDocument(DOC)).map((v) => v.sha256)).toEqual([SHA1, 'c'.repeat(64)]);
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

    const row = await db
      .transaction()
      .execute((trx) => repo.insertPrepared(trx, prepared('sig-1', layer.id, 10_000)));
    expect(row.state).toBe('prepared');
    expect(await repo.findPending(layer.id)).toMatchObject({ id: 'sig-1' });
    // The partial unique index: a second prepare on the layer fails.
    await expect(
      db
        .transaction()
        .execute((trx) => repo.insertPrepared(trx, prepared('sig-2', layer.id, 10_000))),
    ).rejects.toThrow(/UNIQUE|unique/);

    // Claim: exactly one caller wins; a second claim sees the row gone from `prepared`.
    expect(
      await repo.transition(
        db,
        'sig-1',
        'prepared',
        'completed',
        { cmsSha256: 'e'.repeat(64), finishedAt: 500 },
        { notExpiredAt: 500 },
      ),
    ).toBe(true);
    expect(
      await repo.transition(db, 'sig-1', 'prepared', 'completed', {}, { notExpiredAt: 500 }),
    ).toBe(false);
    expect(await repo.find('sig-1')).toMatchObject({
      state: 'completed',
      cmsSha256: 'e'.repeat(64),
      finishedAt: 500,
    });
    expect(await repo.findPending(layer.id)).toBeNull();

    // After completion the layer can prepare again; an expired row cannot be claimed and is swept.
    await db
      .transaction()
      .execute((trx) => repo.insertPrepared(trx, prepared('sig-3', layer.id, 600)));
    expect(
      await repo.transition(db, 'sig-3', 'prepared', 'completed', {}, { notExpiredAt: 700 }),
    ).toBe(false);
    expect(await repo.expireDue(700)).toEqual([
      { id: 'sig-3', tailKey: StorageKeys.signingTail(TENANT, DOC, 'sig-3') },
    ]);
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

  test("a new layer starts on the upload, whatever another layer's signature made", async () => {
    const { layerService, layerState } = services();
    const alice = await layerService.materializeLayerForWrite(ctx, DOC, 'alice');
    expect(alice.layer).toMatchObject({
      baseSha: SHA1,
      docVersion: 1,
      ...INITIAL_BASE_POINTERS,
      currentVersion: 0,
    });

    await signIn(alice.layer.id, 'alice');
    expect((await new DocumentsRepo(db).findById(DOC))?.baseSha).toBe(SHA1);
    const bob = await layerService.materializeLayerForWrite(ctx, DOC, 'bob');
    expect(bob.layer).toMatchObject({
      baseSha: SHA1,
      docVersion: 1,
      ...INITIAL_BASE_POINTERS,
    });

    // Bob inherits every plane of the upload; Alice is over her own version,
    // so every plane is hers, read at her layer's URLs.
    expect(await layerState.computeLayerScopesFromDb(DOC, 'bob')).toEqual({
      content: 'base',
      annotations: 'base',
      forms: 'base',
      layout: 'base',
      attachments: 'base',
      metadata: 'base',
      actions: 'base',
      outline: 'base',
    });
    expect(await layerState.computeLayerScopesFromDb(DOC, 'alice')).toEqual({
      content: 'layer',
      annotations: 'layer',
      forms: 'layer',
      layout: 'layer',
      attachments: 'layer',
      metadata: 'layer',
      actions: 'base',
      outline: 'layer',
    });
    // A never-written layer name is trivially inherited.
    expect(await layerState.computeLayerScopesFromDb(DOC, 'carol')).toMatchObject({
      content: 'base',
      metadata: 'base',
    });
  });

  test('manifests carry the signing fences and the version facts', async () => {
    const { layerService, layerState } = services();
    const head = await layerState.headBaseFacts(DOC);
    expect(head).toEqual({ sha256: SHA1, byteLength: 1234, ...INITIAL_BASE_POINTERS });
    const alice = await layerService.materializeLayerForWrite(ctx, DOC, 'alice');
    const manifest = layerState.buildLayerManifest(
      DOC,
      head!,
      null,
      'alice',
      alice.layer,
      alice.pages,
      layerState.computeLayerScopes(alice.layer, alice.pages, alice.pages, head),
    );
    expect(manifest).toMatchObject({
      baseSha: SHA1,
      baseByteLength: 1234,
      layerVersion: 0,
      working: false,
      docVersion: 1,
      protection: null,
    });
    const base = layerState.buildBaseManifest(
      { id: DOC, baseSha: SHA1, docVersion: 1 } as never,
      alice.pages,
      { ...head!, metadataVersion: 3 },
      null,
    );
    expect(base).toMatchObject({
      metadataVersion: 3,
      layerVersion: 0,
      working: false,
      baseByteLength: 1234,
    });
    // A published version's facts fall back to the initial epochs only when uncatalogued.
    expect(await layerState.baseVersionFacts(DOC, 'f'.repeat(64), 55)).toEqual({
      sha256: 'f'.repeat(64),
      byteLength: 55,
      ...INITIAL_BASE_POINTERS,
    });
  });
});
