import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createSqliteDb } from '../src/db/drivers/sqlite';
import { createPostgresDb } from '../src/db/drivers/postgres';
import { migrate, migrateDown, status, type MigrationSource } from '../src/db/migrator/runner';
import { sqliteMigrations } from '../src/db/migrations/sqlite/index';
import { postgresMigrations } from '../src/db/migrations/postgres/index';
import type { Database as Schema } from '../src/db/schema';
import { checkDocumentNamesMigration } from './_helpers/document-names-migration';
import { checkGrantsMigration } from './_helpers/grants-migration';
import { checkVersionsByLayerMigration } from './_helpers/versions-by-layer-migration';

/**
 * `migrate down` (rollback) tests. The down path is the symmetric
 * inverse of `migrate up`: it must be able to walk the *entire* history
 * back to an empty schema and let `up` re-apply it cleanly. We assert
 * the full round-trip on both dialects plus the selection (`--steps` /
 * `--to`) and safety (irreversible / checksum-drift) guards.
 */

async function appliedVersions(db: Kysely<Schema>): Promise<string[]> {
  const rows = await db
    .selectFrom('schema_migrations')
    .select('version')
    .orderBy('version')
    .execute();
  return rows.map((r) => r.version);
}

async function sqliteHasTable(db: Kysely<Schema>, name: string): Promise<boolean> {
  const res = await sql<{
    n: number;
  }>`SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name=${name}`.execute(db);
  return Number(res.rows[0]?.n ?? 0) > 0;
}

describe('migrateDown [sqlite]', () => {
  test('rolling back 046 rebuilds documents with every row and index, and drops folders', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      const upTo046 = sqliteMigrations.filter((m) => m.version <= '046');
      const source = { kind: 'inline' as const, migrations: upTo046 };
      await migrate(db, { source });
      expect(upTo046.at(-1)?.version).toBe('046');
      await db.insertInto('tenants').values({ id: 'tenant-046', name: 'tenant-046' }).execute();
      await db
        .insertInto('folders')
        .values({
          id: 'fld_aaaaaaaaaaaaaaaaaaaaaaaa',
          tenant_id: 'tenant-046',
          parent_id: null,
          name: 'Contracts',
          name_key: 'contracts',
          created_at: 1,
          updated_at: 1,
          created_by: null,
        })
        .execute();
      await db
        .insertInto('documents')
        .values({
          id: 'doc-046',
          tenant_id: 'tenant-046',
          state: 'ready',
          name: 'Lease.pdf',
          name_key: 'lease.pdf',
          folder_id: 'fld_aaaaaaaaaaaaaaaaaaaaaaaa',
          storage_size_bytes: 1234,
          created_at: 1,
          updated_at: 1,
        } as never)
        .execute();

      const reverted = await migrateDown(db, { source, steps: 1 });
      expect(reverted.map((m) => m.version)).toEqual(['046']);

      const row = await sql<
        Record<string, unknown>
      >`SELECT * FROM documents WHERE id = 'doc-046'`.execute(db);
      expect(row.rows[0]).toMatchObject({ name: 'Lease.pdf', storage_size_bytes: 1234 });
      expect(row.rows[0]).not.toHaveProperty('folder_id');
      expect(await sqliteHasTable(db, 'folders')).toBe(false);
      const indexes = await sql<{ name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'documents' AND sql IS NOT NULL
      `.execute(db);
      expect(indexes.rows.map((r) => r.name).sort()).toEqual([
        'idx_documents_tenant_base_sha',
        'idx_documents_tenant_created_id',
        'idx_documents_tenant_name_key_id',
        'idx_documents_tenant_size_id',
        'idx_documents_tenant_state',
        'uq_documents_tenant_idempotency',
      ]);
      expect((await sql`PRAGMA foreign_key_check`.execute(db)).rows).toEqual([]);

      await migrate(db, { source });
      expect(await sqliteHasTable(db, 'folders')).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  test('migration 045 names existing documents from their metadata, else their id', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await checkDocumentNamesMigration(db, sqliteMigrations);
    } finally {
      await db.destroy();
    }
  });

  test('migration 047 renames share grants to grants and back, keeping their rows', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await checkGrantsMigration(db, sqliteMigrations);
    } finally {
      await db.destroy();
    }
  });

  test('full round-trip: up all -> down all -> up all', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      expect(await appliedVersions(db)).toHaveLength(sqliteMigrations.length);
      expect(await sqliteHasTable(db, 'documents')).toBe(true);

      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: sqliteMigrations },
        all: true,
      });
      // Reverted newest-first, covering every migration.
      expect(reverted.map((m) => m.version)).toEqual(
        [...sqliteMigrations].map((m) => m.version).reverse(),
      );
      expect(await appliedVersions(db)).toEqual([]);
      expect(await sqliteHasTable(db, 'documents')).toBe(false);
      expect(await sqliteHasTable(db, 'layers')).toBe(false);
      // The runner-owned table survives a full rollback.
      expect(await sqliteHasTable(db, 'schema_migrations')).toBe(true);

      // Re-apply cleanly from empty.
      const reapplied = await migrate(db, {
        source: { kind: 'inline', migrations: sqliteMigrations },
      });
      expect(reapplied).toHaveLength(sqliteMigrations.length);
      expect(await appliedVersions(db)).toHaveLength(sqliteMigrations.length);
      expect(await sqliteHasTable(db, 'documents')).toBe(true);
    } finally {
      await db.destroy();
    }
  });

  test('--steps 1 reverts only the highest applied migration', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      const highest = sqliteMigrations[sqliteMigrations.length - 1]!.version;

      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: sqliteMigrations },
        steps: 1,
      });
      expect(reverted.map((m) => m.version)).toEqual([highest]);

      const rows = await status(db, sqliteMigrations);
      expect(rows.find((r) => r.version === highest)?.state).toBe('pending');
      expect(rows.filter((r) => r.state === 'applied')).toHaveLength(sqliteMigrations.length - 1);

      // Re-up re-applies exactly the one we removed.
      const reapplied = await migrate(db, {
        source: { kind: 'inline', migrations: sqliteMigrations },
      });
      expect(reapplied.map((m) => m.version)).toEqual([highest]);
    } finally {
      await db.destroy();
    }
  });

  test('--to 010 reverts everything above 010 in descending order, leaves 001-010', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      const order: string[] = [];
      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: sqliteMigrations },
        to: '010',
        onRevert: (m) => order.push(m.version),
      });
      const expectedDesc = sqliteMigrations
        .map((m) => m.version)
        .filter((v) => v > '010')
        .sort()
        .reverse();
      expect(reverted.map((m) => m.version)).toEqual(expectedDesc);
      expect(order).toEqual(expectedDesc); // descending
      expect(await appliedVersions(db)).toEqual([
        '001',
        '002',
        '003',
        '004',
        '005',
        '006',
        '007',
        '008',
        '009',
        '010',
      ]);
    } finally {
      await db.destroy();
    }
  });

  test('steps 0 is a no-op (nothing reverted, db unchanged)', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      const before = await appliedVersions(db);
      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: sqliteMigrations },
        steps: 0,
      });
      expect(reverted).toEqual([]);
      expect(await appliedVersions(db)).toEqual(before);
    } finally {
      await db.destroy();
    }
  });

  test('refuses an irreversible migration (no down SQL) without touching the db', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      // Strip the down SQL off the highest migration.
      const highest = sqliteMigrations[sqliteMigrations.length - 1]!.version;
      const stripped: MigrationSource[] = sqliteMigrations.map((m) =>
        m.version === highest ? { version: m.version, name: m.name, sql: m.sql } : m,
      );
      const before = await appliedVersions(db);
      await expect(
        migrateDown(db, { source: { kind: 'inline', migrations: stripped }, steps: 1 }),
      ).rejects.toThrow(/irreversible/);
      expect(await appliedVersions(db)).toEqual(before);
    } finally {
      await db.destroy();
    }
  });

  test('refuses on up-checksum drift unless force is set', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      // Edit 001's up SQL after apply -> stored checksum no longer matches.
      const tampered: MigrationSource[] = sqliteMigrations.map((m) =>
        m.version === '001' ? { ...m, sql: `${m.sql}\n-- edited after apply\n` } : m,
      );
      const before = await appliedVersions(db);

      // 001 is in the revert set (all) -> guard trips, no DB change.
      await expect(
        migrateDown(db, { source: { kind: 'inline', migrations: tampered }, all: true }),
      ).rejects.toThrow(/up-checksum drift/);
      expect(await appliedVersions(db)).toEqual(before);

      // force overrides and rolls the whole history back.
      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: tampered },
        all: true,
        force: true,
      });
      expect(reverted).toHaveLength(sqliteMigrations.length);
      expect(await appliedVersions(db)).toEqual([]);
    } finally {
      await db.destroy();
    }
  });

  test('status reports reversible=true for migrations that declare down SQL', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      const rows = await status(db, sqliteMigrations);
      expect(rows.every((r) => r.reversible === true)).toBe(true);
    } finally {
      await db.destroy();
    }
  });
});

// ---- Postgres round-trip (gated on Docker, mirrors db-postgres.test.ts) ----

const REQUIRE = process.env.CLOUDPDF_REQUIRE_PG_TESTS === '1';

function dockerProbe(): boolean {
  if (process.env.CLOUDPDF_PG_TEST_URI) return true;
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

const RUN_PG = REQUIRE || dockerProbe();

interface StartedPg {
  getConnectionUri: () => string;
  stop: () => Promise<unknown>;
}

let container: StartedPg | null = null;
let connectionString = process.env.CLOUDPDF_PG_TEST_URI ?? '';
let schemaCounter = 0;

beforeAll(async () => {
  if (!RUN_PG) return;
  if (connectionString) return;
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  container = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('embedpdf').start();
  connectionString = container.getConnectionUri();
}, 120_000);

afterAll(async () => {
  if (container) await container.stop();
});

describe.runIf(RUN_PG)('migrateDown [postgres]', () => {
  async function makeDb(): Promise<Kysely<Schema>> {
    schemaCounter += 1;
    const schemaName = `down_${process.pid}_${Date.now()}_${schemaCounter}`;
    const bootstrap = createPostgresDb({ connectionString, poolMax: 1 });
    try {
      await sql.raw(`CREATE SCHEMA "${schemaName}"`).execute(bootstrap);
    } finally {
      await bootstrap.destroy();
    }
    const sep = connectionString.includes('?') ? '&' : '?';
    const isolatedUri = `${connectionString}${sep}options=-c%20search_path%3D${schemaName}`;
    return createPostgresDb({ connectionString: isolatedUri, poolMax: 2 });
  }

  test('full round-trip: up all -> down all -> up all', async () => {
    const db = await makeDb();
    try {
      await migrate(db, { source: { kind: 'inline', migrations: postgresMigrations } });
      expect(await appliedVersions(db)).toHaveLength(postgresMigrations.length);

      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: postgresMigrations },
        all: true,
      });
      expect(reverted.map((m) => m.version)).toEqual(
        [...postgresMigrations].map((m) => m.version).reverse(),
      );
      expect(await appliedVersions(db)).toEqual([]);

      const reapplied = await migrate(db, {
        source: { kind: 'inline', migrations: postgresMigrations },
      });
      expect(reapplied).toHaveLength(postgresMigrations.length);
    } finally {
      await db.destroy();
    }
  });

  test('migration 044 gives signed versions their layer and moves documents back', async () => {
    const db = await makeDb();
    try {
      await checkVersionsByLayerMigration(db, postgresMigrations);
    } finally {
      await db.destroy();
    }
  });

  test('migration 045 names existing documents from their metadata, else their id', async () => {
    const db = await makeDb();
    try {
      await checkDocumentNamesMigration(db, postgresMigrations);
    } finally {
      await db.destroy();
    }
  });

  test('migration 047 renames share grants to grants and back, keeping their rows', async () => {
    const db = await makeDb();
    try {
      await checkGrantsMigration(db, postgresMigrations);
    } finally {
      await db.destroy();
    }
  });

  test('--to 010 reverts everything above 010 descending', async () => {
    const db = await makeDb();
    try {
      await migrate(db, { source: { kind: 'inline', migrations: postgresMigrations } });
      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: postgresMigrations },
        to: '010',
      });
      const expectedDesc = postgresMigrations
        .map((m) => m.version)
        .filter((v) => v > '010')
        .sort()
        .reverse();
      expect(reverted.map((m) => m.version)).toEqual(expectedDesc);
      const applied = await appliedVersions(db);
      expect(applied[applied.length - 1]).toBe('010');
      expect(applied).not.toContain('011');
      expect(applied).not.toContain('012');
      expect(applied).not.toContain('013');
      expect(applied).not.toContain('014');
    } finally {
      await db.destroy();
    }
  });
});

describe.skipIf(RUN_PG)('migrateDown [postgres] (skipped)', () => {
  test('docker unavailable — PG rollback round-trip skipped', () => {
    // Sentinel keeps the file reporting "skipped" rather than "no tests".
  });
});
