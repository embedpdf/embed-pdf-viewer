import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  DocumentPagesRepo,
  DocumentsRepo,
  LayerPagesRepo,
  LayersRepo,
  LayerService,
  LayerStateService,
  type DbSchema,
} from '../src/index';

describe('LayerService lazy materialization', () => {
  let db: Kysely<DbSchema>;
  let service: LayerService;

  beforeEach(async () => {
    db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const layerState = new LayerStateService({
      documentPages: new DocumentPagesRepo(db),
      layers: new LayersRepo(db),
      layerPages: new LayerPagesRepo(db),
    });
    service = new LayerService({
      documents: new DocumentsRepo(db),
      layerState,
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test('does not create a layer until materializeLayerForWrite is called', async () => {
    await seedReadyDocument(db);
    await seedBasePages(db);

    const before = await countRows(db, 'layers');
    expect(before).toBe(0);

    await service.materializeLayerForWrite(
      { tenantId: 'tenant-layer-service', sub: 'user-1' },
      'doc-layer-service',
      'alice',
    );

    const after = await countRows(db, 'layers');
    expect(after).toBe(1);
  });

  test('snapshots immutable base page state into the materialized layer', async () => {
    await seedReadyDocument(db);
    await seedBasePages(db);

    const materialized = await service.materializeLayerForWrite(
      { tenantId: 'tenant-layer-service', sub: 'user-1' },
      'doc-layer-service',
      'alice',
    );

    expect(materialized.layer).toMatchObject({
      docId: 'doc-layer-service',
      tenantId: 'tenant-layer-service',
      name: 'alice',
      currentVersion: 0,
      currentArtifactKey: null,
    });
    expect(materialized.pages).toHaveLength(2);
    expect(materialized.pages[1]).toMatchObject({
      pageObjectNumber: 22,
      contentVersion: 4,
      annotationVersion: 3,
      annotationGeneration: 2,
      hasWeakAnnotations: true,
    });
  });

  test('materialization is idempotent for an existing layer', async () => {
    await seedReadyDocument(db);
    await seedBasePages(db);

    const first = await service.materializeLayerForWrite(
      { tenantId: 'tenant-layer-service', sub: 'user-1' },
      'doc-layer-service',
      'alice',
    );
    const second = await service.materializeLayerForWrite(
      { tenantId: 'tenant-layer-service', sub: 'user-1' },
      'doc-layer-service',
      'alice',
    );

    expect(second.layer.id).toBe(first.layer.id);
    expect(await countRows(db, 'layers')).toBe(1);
    expect(await countRows(db, 'layer_pages')).toBe(2);
  });
});

async function seedReadyDocument(db: Kysely<DbSchema>): Promise<void> {
  const now = Date.now();
  await db
    .insertInto('tenants')
    .values({ id: 'tenant-layer-service', name: 'tenant-layer-service' })
    .execute();
  await db
    .insertInto('documents')
    .values({
      id: 'doc-layer-service',
      tenant_id: 'tenant-layer-service',
      state: 'ready',
      base_sha: 'b'.repeat(64),
      storage_size_bytes: 10,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
}

async function seedBasePages(db: Kysely<DbSchema>): Promise<void> {
  await new DocumentPagesRepo(db).replaceForDocument('doc-layer-service', [
    {
      pageObjectNumber: 11,
      contentVersion: 9,
      annotationVersion: 7,
      annotationGeneration: 5,
      hasWeakAnnotations: false,
    },
    {
      pageObjectNumber: 22,
      contentVersion: 4,
      annotationVersion: 3,
      annotationGeneration: 2,
      hasWeakAnnotations: true,
    },
  ]);
}

async function countRows(db: Kysely<DbSchema>, table: 'layers' | 'layer_pages'): Promise<number> {
  const row = await db.selectFrom(table).select(db.fn.countAll().as('n')).executeTakeFirst();
  return Number(row?.n ?? 0);
}
