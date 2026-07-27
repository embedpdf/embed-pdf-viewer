import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createSqliteDb } from '../src/db/drivers/sqlite';
import { createPostgresDb } from '../src/db/drivers/postgres';
import { migrate, migrateDown, status, type MigrationSource } from '../src/db/migrator/runner';
import { sqliteMigrations } from '../src/db/migrations/sqlite/index';
import { postgresMigrations } from '../src/db/migrations/postgres/index';
import type { Database as Schema } from '../src/db/schema';

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

  test('--to 010 reverts 011..015 in descending order, leaves 001-010', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    try {
      await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
      const order: string[] = [];
      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: sqliteMigrations },
        to: '010',
        onRevert: (m) => order.push(m.version),
      });
      expect(reverted.map((m) => m.version)).toEqual(['015', '014', '013', '012', '011']);
      expect(order).toEqual(['015', '014', '013', '012', '011']); // descending
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

  test('--to 010 reverts 011..015 descending', async () => {
    const db = await makeDb();
    try {
      await migrate(db, { source: { kind: 'inline', migrations: postgresMigrations } });
      const reverted = await migrateDown(db, {
        source: { kind: 'inline', migrations: postgresMigrations },
        to: '010',
      });
      expect(reverted.map((m) => m.version)).toEqual(['015', '014', '013', '012', '011']);
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
