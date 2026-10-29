/**
 * Migration 047, on either database: `share_grants` becomes `grants` and
 * `share_visitors` becomes `grant_visitors`. A grant made before keeps its
 * `shr_…` id, its passphrase and its visitors, gets no name, and deleting
 * it still deletes its visitors. Rolling back gives the old tables back with
 * the same rows.
 */
import { sql, type Kysely } from 'kysely';
import { expect } from 'vitest';

import { migrate, migrateDown, type DbSchema, type MigrationSource } from '../../src/index';

const TENANT = 'tenant-047';
const DOC = 'doc-047';
const GRANT = `shr_${'a'.repeat(24)}`;
const VISITOR = '0123456789abcdef01234567';

export async function checkGrantsMigration(
  db: Kysely<DbSchema>,
  migrations: ReadonlyArray<MigrationSource>,
): Promise<void> {
  const upTo046 = migrations.filter((m) => m.version < '047');
  expect(upTo046.at(-1)?.version).toBe('046');
  const source = { kind: 'inline' as const, migrations };
  await migrate(db, { source: { kind: 'inline', migrations: upTo046 } });

  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  await db
    .insertInto('documents')
    .values({ id: DOC, tenant_id: TENANT, state: 'ready', created_at: 1, updated_at: 1 } as never)
    .execute();
  await sql`
    INSERT INTO share_grants (id, tenant_id, doc_id, layer_mode, layer_name, scope_json,
      password_hash, created_by, created_at, updated_at)
    VALUES (${GRANT}, ${TENANT}, ${DOC}, 'shared', 'default', '["doc.open"]',
      'scrypt$1$1$1$c2FsdA$aGFzaA', 'admin', 1, 1)
  `.execute(db);
  await sql`
    INSERT INTO share_visitors (grant_id, visitor_id, doc_id, display_name, first_seen_at,
      last_seen_at)
    VALUES (${GRANT}, ${VISITOR}, ${DOC}, 'Ada', 1, 1)
  `.execute(db);

  await migrate(db, { source });

  const grant = await db
    .selectFrom('grants')
    .selectAll()
    .where('id', '=', GRANT)
    .executeTakeFirst();
  expect(grant).toMatchObject({
    doc_id: DOC,
    name: null,
    passphrase_hash: 'scrypt$1$1$1$c2FsdA$aGFzaA',
  });
  const visitor = await db
    .selectFrom('grant_visitors')
    .selectAll()
    .where('grant_id', '=', GRANT)
    .executeTakeFirst();
  expect(visitor).toMatchObject({ visitor_id: VISITOR, display_name: 'Ada' });

  const reverted = await migrateDown(db, { source, steps: 1 });
  expect(reverted.map((m) => m.version)).toEqual(['047']);
  const back = await sql<Record<string, unknown>>`
    SELECT * FROM share_grants WHERE id = ${GRANT}
  `.execute(db);
  expect(back.rows[0]).toMatchObject({ password_hash: 'scrypt$1$1$1$c2FsdA$aGFzaA' });
  expect(back.rows[0]).not.toHaveProperty('name');
  const backVisitors = await sql<Record<string, unknown>>`
    SELECT * FROM share_visitors WHERE grant_id = ${GRANT}
  `.execute(db);
  expect(backVisitors.rows).toHaveLength(1);

  // Up again: the visitors' foreign key follows the renamed table.
  await migrate(db, { source });
  await db.deleteFrom('grants').where('id', '=', GRANT).execute();
  const left = await db
    .selectFrom('grant_visitors')
    .select('visitor_id')
    .where('grant_id', '=', GRANT)
    .execute();
  expect(left).toEqual([]);
}
