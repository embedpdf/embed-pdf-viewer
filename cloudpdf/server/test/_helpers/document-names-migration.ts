/**
 * Migration 045's backfill, on either database. A document whose metadata
 * holds a non-empty string `name` is named by it; every other document is
 * named after its id. The key is the lowercased name, and the metadata
 * stays exactly as the caller wrote it.
 */
import type { Kysely } from 'kysely';
import { expect } from 'vitest';

import { migrate, type DbSchema, type MigrationSource } from '../../src/index';

const TENANT = 'tenant-045';

export async function checkDocumentNamesMigration(
  db: Kysely<DbSchema>,
  migrations: ReadonlyArray<MigrationSource>,
): Promise<void> {
  const upTo044 = migrations.filter((m) => m.version < '045');
  expect(upTo044.at(-1)?.version).toBe('044');
  await migrate(db, { source: { kind: 'inline', migrations: upTo044 } });

  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const row = (id: string, metadata: Record<string, unknown> | null) => ({
    id,
    tenant_id: TENANT,
    state: 'ready',
    metadata_json: metadata === null ? null : JSON.stringify(metadata),
    created_at: 1,
    updated_at: 1,
  });
  await db
    .insertInto('documents')
    .values([
      row('doc-named', { name: 'Quarterly Report.pdf', team: 'finance' }),
      row('doc-empty-name', { name: '' }),
      row('doc-number-name', { name: 42 }),
      row('doc-no-metadata', null),
    ] as never)
    .execute();

  await migrate(db, { source: { kind: 'inline', migrations } });

  const rows = await db
    .selectFrom('documents')
    .select(['id', 'name', 'name_key', 'metadata_json'])
    .where('tenant_id', '=', TENANT)
    .execute();
  const byId = new Map(rows.map((r) => [r.id, r]));
  expect(byId.get('doc-named')).toMatchObject({
    name: 'Quarterly Report.pdf',
    name_key: 'quarterly report.pdf',
  });
  expect(JSON.parse(byId.get('doc-named')!.metadata_json!)).toEqual({
    name: 'Quarterly Report.pdf',
    team: 'finance',
  });
  for (const id of ['doc-empty-name', 'doc-number-name', 'doc-no-metadata']) {
    expect(byId.get(id)).toMatchObject({ name: id, name_key: id });
  }
}
