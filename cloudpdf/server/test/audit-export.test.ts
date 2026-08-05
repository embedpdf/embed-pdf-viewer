import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  AuditLogRepo,
  createSqliteDb,
  EventLogService,
  FsObjectStore,
  migrate,
  sqliteMigrations,
  StorageKeys,
  type DbSchema,
} from '../src/index';
import type { Kysely } from 'kysely';

describe('audit JSONL export', () => {
  let db: Kysely<DbSchema>;
  let storageRoot: string;
  let storage: FsObjectStore;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'audit-export-store-'));
    storage = new FsObjectStore({ root: storageRoot });
    db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  });

  afterEach(async () => {
    await db.destroy();
    await rm(storageRoot, { recursive: true, force: true });
  });

  test('refuses open days unless explicitly allowed', async () => {
    const service = new EventLogService({ storage });
    await expect(
      service.exportDocDayJsonl(db, {
        tenantId: 'tenant-audit',
        docId: 'docaudit001',
        day: '2026-05-17',
        now: Date.parse('2026-05-17T12:00:00.000Z'),
      }),
    ).rejects.toThrow(/cannot export open audit day/);
  });

  test('exports a closed day once and skips the second normal run', async () => {
    const tenantId = 'tenant-audit';
    const docId = 'docaudit002';
    const day = '2026-05-16';
    const ts = Date.parse(`${day}T08:30:00.000Z`);
    await seedAuditScope(db, {
      tenantId,
      docId,
      layerId: 'layer-audit',
      layerName: 'default',
      now: ts,
    });
    await new AuditLogRepo(db).append({
      tenantId,
      docId,
      layerId: 'layer-audit',
      layerName: 'default',
      ts,
      sub: 'user-1',
      kind: 'annot.create',
      pageObjectNumber: 7,
      affectedPages: [7],
      artifactVersion: 1,
      artifactKey: 'tenant-audit/docs/do/docaudit002/layers/default/v00000001.layer',
      artifactSha: 'sha',
      artifactSize: 4,
      payload: { ok: true },
    });

    const service = new EventLogService({ storage });
    const exported = await service.exportDocDayJsonl(db, {
      tenantId,
      docId,
      day,
      now: Date.parse('2026-05-17T00:31:00.000Z'),
    });
    const key = StorageKeys.eventsDay(tenantId, docId, day);
    expect(exported).toEqual({ key, count: 1, status: 'exported' });
    expect(await storage.exists(key)).toBe(true);

    const skipped = await service.exportDocDayJsonl(db, {
      tenantId,
      docId,
      day,
      now: Date.parse('2026-05-17T00:32:00.000Z'),
    });
    expect(skipped).toEqual({ key, count: 1, status: 'already-succeeded' });
  });
});

async function seedAuditScope(
  db: Kysely<DbSchema>,
  input: { tenantId: string; docId: string; layerId: string; layerName: string; now: number },
): Promise<void> {
  await db
    .insertInto('tenants')
    .values({ id: input.tenantId, name: input.tenantId, config_json: null, created_at: input.now })
    .execute();
  await db
    .insertInto('documents')
    .values({
      id: input.docId,
      tenant_id: input.tenantId,
      state: 'ready',
      base_sha: 'base-sha',
      storage_size_bytes: 4,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: input.now,
      updated_at: input.now,
      created_by: 'test',
    })
    .execute();
  await db
    .insertInto('layers')
    .values({
      id: input.layerId,
      doc_id: input.docId,
      tenant_id: input.tenantId,
      name: input.layerName,
      doc_version: 1,
      current_version: 1,
      current_artifact_key: 'artifact',
      current_artifact_sha: 'sha',
      current_artifact_size: 4,
      created_at: input.now,
      updated_at: input.now,
    })
    .execute();
}
