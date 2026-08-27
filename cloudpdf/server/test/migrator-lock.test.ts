import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { createSqliteDb } from '../src/db/drivers/sqlite';
import { createPostgresDb } from '../src/db/drivers/postgres';
import {
  MIGRATION_LOCK_HI,
  MIGRATION_LOCK_LO,
  migrate,
  type MigrationSource,
} from '../src/db/migrator/runner';
import { sqliteMigrations } from '../src/db/migrations/sqlite/index';
import { postgresMigrations } from '../src/db/migrations/postgres/index';
import type { Database as Schema } from '../src/db/schema';

/**
 * Cross-migrator serialization. The Helm hook / Render preDeployCommand
 * serialize one deploy pipeline, but nothing serializes two releases
 * sharing a database, a replica racing auto-migrate against a manual
 * `migrate up`, or plain concurrent boots. The migrator itself must be
 * safe: on Postgres the whole run (discovery + execution) holds a
 * session advisory lock. These tests make the unlocked failure mode
 * deterministic (a pg_sleep migration guarantees overlap) so a
 * regression cannot pass by timing luck.
 */

async function appliedVersions(db: Kysely<Schema>): Promise<string[]> {
  const rows = await db
    .selectFrom('schema_migrations')
    .select('version')
    .orderBy('version')
    .execute();
  return rows.map((r) => r.version);
}

describe('migrate lock [sqlite]', () => {
  test('sqlite path is unchanged with and without the dialect hint', async () => {
    for (const dialect of [undefined, 'sqlite' as const]) {
      const db = createSqliteDb({ path: ':memory:' });
      try {
        const applied = await migrate(db, {
          source: { kind: 'inline', migrations: sqliteMigrations },
          ...(dialect ? { dialect } : {}),
        });
        expect(applied).toHaveLength(sqliteMigrations.length);
        expect(await appliedVersions(db)).toHaveLength(sqliteMigrations.length);
      } finally {
        await db.destroy();
      }
    }
  });
});

// ---- Postgres (gated on Docker, mirrors migrator-down.test.ts) ----

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

describe.runIf(RUN_PG)('migrate lock [postgres]', () => {
  /** Two Kysely instances onto the SAME isolated schema — two "replicas". */
  async function makeDbPair(): Promise<{ a: Kysely<Schema>; b: Kysely<Schema> }> {
    schemaCounter += 1;
    const schemaName = `lock_${process.pid}_${Date.now()}_${schemaCounter}`;
    const bootstrap = createPostgresDb({ connectionString, poolMax: 1 });
    try {
      await sql.raw(`CREATE SCHEMA "${schemaName}"`).execute(bootstrap);
    } finally {
      await bootstrap.destroy();
    }
    const sep = connectionString.includes('?') ? '&' : '?';
    const isolatedUri = `${connectionString}${sep}options=-c%20search_path%3D${schemaName}`;
    return {
      a: createPostgresDb({ connectionString: isolatedUri, poolMax: 2 }),
      b: createPostgresDb({ connectionString: isolatedUri, poolMax: 2 }),
    };
  }

  // A migration set where concurrent unlocked runs deterministically
  // collide: 001 sleeps long enough that the second migrator's
  // discovery would land inside the first's execution window, then
  // both would attempt the non-idempotent CREATE TABLE in 002.
  const RACY_SET: MigrationSource[] = [
    {
      version: '001',
      name: '001_slow.sql',
      sql: 'CREATE TABLE lock_probe (id TEXT PRIMARY KEY);\nSELECT pg_sleep(1.5);',
    },
    {
      version: '002',
      name: '002_table.sql',
      sql: 'CREATE TABLE lock_probe_2 (id TEXT PRIMARY KEY);',
    },
    {
      version: '003',
      name: '003_no_tx.sql',
      sql: '-- pragma: no-transaction\nCREATE INDEX CONCURRENTLY lock_probe_idx ON lock_probe (id);',
    },
  ];

  test(
    'two concurrent migrators serialize; every migration applies exactly once (dialect sniffed)',
    async () => {
      const { a, b } = await makeDbPair();
      try {
        // No explicit dialect: this also proves the adapter sniff, since
        // an unlocked overlap fails loudly on the duplicate CREATE TABLE.
        const [ra, rb] = await Promise.all([
          migrate(a, { source: { kind: 'inline', migrations: RACY_SET } }),
          migrate(b, { source: { kind: 'inline', migrations: RACY_SET } }),
        ]);

        const union = [...ra, ...rb].map((m) => m.version).sort();
        expect(union).toEqual(['001', '002', '003']); // disjoint partition, no double-apply
        expect(await appliedVersions(a)).toEqual(['001', '002', '003']);

        // The winner released the lock on completion.
        const probe = await sql<{ ok: boolean }>`
          SELECT pg_try_advisory_lock(${MIGRATION_LOCK_HI}, ${MIGRATION_LOCK_LO}) AS ok
        `.execute(a);
        expect(probe.rows[0]?.ok).toBe(true);
        await sql`
          SELECT pg_advisory_unlock(${MIGRATION_LOCK_HI}, ${MIGRATION_LOCK_LO})
        `.execute(a);
      } finally {
        await a.destroy();
        await b.destroy();
      }
    },
    30_000,
  );

  test(
    'the full real migration set survives a concurrent double-boot',
    async () => {
      const { a, b } = await makeDbPair();
      try {
        const [ra, rb] = await Promise.all([
          migrate(a, {
            source: { kind: 'inline', migrations: postgresMigrations },
            dialect: 'postgres',
          }),
          migrate(b, {
            source: { kind: 'inline', migrations: postgresMigrations },
            dialect: 'postgres',
          }),
        ]);
        expect(ra.length + rb.length).toBe(postgresMigrations.length);
        expect(await appliedVersions(a)).toHaveLength(postgresMigrations.length);
      } finally {
        await a.destroy();
        await b.destroy();
      }
    },
    60_000,
  );

  test(
    'a held lock times out with an actionable error and reports wait progress',
    async () => {
      const { a, b } = await makeDbPair();
      try {
        let acquired!: () => void;
        const acquiredP = new Promise<void>((r) => (acquired = r));
        let release!: () => void;
        const releaseP = new Promise<void>((r) => (release = r));

        // Hold the migration lock on a pinned session (same-connection
        // lock/unlock is mandatory for session advisory locks).
        const holder = a.connection().execute(async (conn) => {
          await sql`
            SELECT pg_advisory_lock(${MIGRATION_LOCK_HI}, ${MIGRATION_LOCK_LO})
          `.execute(conn);
          acquired();
          await releaseP;
          await sql`
            SELECT pg_advisory_unlock(${MIGRATION_LOCK_HI}, ${MIGRATION_LOCK_LO})
          `.execute(conn);
        });
        await acquiredP;

        const waits: number[] = [];
        await expect(
          migrate(b, {
            source: { kind: 'inline', migrations: RACY_SET },
            dialect: 'postgres',
            lockTimeoutMs: 1_500,
            onLockWait: (ms) => waits.push(ms),
          }),
        ).rejects.toThrow(/migration lock/);
        expect(waits.length).toBeGreaterThan(0);

        release();
        await holder;

        // With the lock released the same migrator succeeds.
        const applied = await migrate(b, {
          source: { kind: 'inline', migrations: RACY_SET },
          dialect: 'postgres',
        });
        expect(applied.map((m) => m.version)).toEqual(['001', '002', '003']);
      } finally {
        await a.destroy();
        await b.destroy();
      }
    },
    30_000,
  );
});
