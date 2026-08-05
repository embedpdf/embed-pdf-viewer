import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  DocumentPagesRepo,
  LayerPagesRepo,
  LayersRepo,
  LayerStateService,
  type DbSchema,
} from '../src/index';

describe('LayerStateService durable authority', () => {
  let db: Kysely<DbSchema>;
  let service: LayerStateService;

  beforeEach(async () => {
    db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    service = new LayerStateService({
      documentPages: new DocumentPagesRepo(db),
      layers: new LayersRepo(db),
      layerPages: new LayerPagesRepo(db),
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test('snapshots immutable base page state into a freshly created layer', async () => {
    const now = Date.now();
    await db.insertInto('tenants').values({ id: 'tenant-ls', name: 'tenant-ls' }).execute();
    await db
      .insertInto('documents')
      .values({
        id: 'doc-ls',
        tenant_id: 'tenant-ls',
        state: 'ready',
        base_sha: 'a'.repeat(64),
        storage_size_bytes: 10,
        metadata_json: null,
        idempotency_key: null,
        failure_reason: null,
        created_at: now,
        updated_at: now,
        created_by: null,
      })
      .execute();
    await new DocumentPagesRepo(db).replaceForDocument('doc-ls', [
      { pageObjectNumber: 11, hasWeakAnnotations: false },
      {
        pageObjectNumber: 22,
        annotationVersion: 4,
        annotationGeneration: 2,
        hasWeakAnnotations: true,
      },
    ]);
    const layer = await new LayersRepo(db).createEmpty({
      id: 'layer-ls',
      docId: 'doc-ls',
      tenantId: 'tenant-ls',
      name: 'alice',
    });

    const pages = await service.ensureLayerPagesFromBase({
      layerId: layer.id,
      docId: 'doc-ls',
    });

    expect(pages).toHaveLength(2);
    expect(pages[1]).toMatchObject({
      pageObjectNumber: 22,
      contentVersion: 1,
      annotationVersion: 4,
      annotationGeneration: 2,
      hasWeakAnnotations: true,
    });
  });

  test('keeps cache versions and index-ref generations separate', () => {
    const strongPage = { hasWeakAnnotations: false };
    const weakPage = { hasWeakAnnotations: true };

    expect(service.mutationBumps('create', strongPage)).toMatchObject({
      bumpAnnotationVersion: true,
      bumpAnnotationGeneration: false,
      weakRefsInvalidated: false,
    });
    expect(service.mutationBumps('update', strongPage)).toMatchObject({
      bumpAnnotationVersion: true,
      bumpAnnotationGeneration: false,
      weakRefsInvalidated: false,
    });
    expect(service.mutationBumps('delete', strongPage)).toMatchObject({
      bumpAnnotationVersion: true,
      bumpAnnotationGeneration: true,
      weakRefsInvalidated: false,
    });
    expect(service.mutationBumps('move', strongPage)).toMatchObject({
      bumpAnnotationVersion: true,
      bumpAnnotationGeneration: true,
      weakRefsInvalidated: false,
    });
    expect(service.mutationBumps('delete', weakPage)).toMatchObject({
      bumpAnnotationVersion: true,
      bumpAnnotationGeneration: true,
      weakRefsInvalidated: true,
    });
    expect(service.mutationBumps('move', weakPage)).toMatchObject({
      bumpAnnotationVersion: true,
      bumpAnnotationGeneration: true,
      weakRefsInvalidated: true,
    });
  });
});
