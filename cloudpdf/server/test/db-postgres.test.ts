import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { sql } from 'kysely';
import { createPostgresDb } from '../src/db/drivers/postgres';
import { migrate } from '../src/db/migrator/runner';
import { postgresMigrations } from '../src/db/migrations/postgres/index';
import { runDbConformance } from './_helpers/db-conformance';

/**
 * Phase 2 Postgres conformance suite. Boots a single ephemeral Postgres
 * container via testcontainers and runs the exact same assertions
 * `db-sqlite.test.ts` runs.
 *
 * Each test calls `makeDb()` which creates a unique **schema** on the
 * shared container and migrates it from scratch. Sub-100ms per test
 * once the container is warm; no FK contamination across tests; one
 * container boot for the entire file.
 *
 * Docker probe is **synchronous** so that vitest's collection-time
 * `describe.runIf` sees the right value. Set
 * `CLOUDPDF_REQUIRE_PG_TESTS=1` (CI matrix job) to force inclusion and
 * turn a missing Docker into a hard error instead of a silent skip.
 */

const REQUIRE = process.env.CLOUDPDF_REQUIRE_PG_TESTS === '1';

function dockerProbe(): { available: boolean; reason: string } {
  // Allow callers to bypass the probe and point at a real PG (eg a CI
  // service container) via `CLOUDPDF_PG_TEST_URI=postgres://...`.
  if (process.env.CLOUDPDF_PG_TEST_URI) return { available: true, reason: '' };
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 3000 });
    return { available: true, reason: '' };
  } catch (err) {
    return { available: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

const probe = dockerProbe();
if (REQUIRE && !probe.available) {
  throw new Error(`CLOUDPDF_REQUIRE_PG_TESTS=1 but docker is unavailable: ${probe.reason}`);
}
const RUN_PG = REQUIRE || probe.available;

interface StartedPg {
  getConnectionUri: () => string;
  stop: () => Promise<unknown>;
}

let container: StartedPg | null = null;
let connectionString = process.env.CLOUDPDF_PG_TEST_URI ?? '';
let schemaCounter = 0;

beforeAll(async () => {
  if (!RUN_PG) return;
  if (connectionString) return; // caller supplied a managed PG.
  // postgres:16 — partial indexes + SCRAM-SHA-256, semantics identical
  // to RDS PG16 / Cloud SQL PG16 / Azure Flexible PG16.
  const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
  container = await new PostgreSqlContainer('postgres:16-alpine').withDatabase('embedpdf').start();
  connectionString = container.getConnectionUri();
}, 120_000);

afterAll(async () => {
  if (container) await container.stop();
});

describe.runIf(RUN_PG)('postgres conformance', () => {
  runDbConformance({
    label: 'postgres',
    makeDb: async () => {
      schemaCounter += 1;
      const schemaName = `c_${process.pid}_${Date.now()}_${schemaCounter}`;
      // Create the schema with a one-shot connection, then build the
      // per-test pool pinned via libpq `options=-c search_path=...`.
      // Search-path pinning means CREATE TABLE in the migration lands
      // in our private schema without rewriting any DDL.
      const bootstrap = createPostgresDb({ connectionString, poolMax: 1 });
      try {
        await sql.raw(`CREATE SCHEMA "${schemaName}"`).execute(bootstrap);
      } finally {
        await bootstrap.destroy();
      }

      const sep = connectionString.includes('?') ? '&' : '?';
      const isolatedUri = `${connectionString}${sep}options=-c%20search_path%3D${schemaName}`;
      const db = createPostgresDb({ connectionString: isolatedUri, poolMax: 2 });
      await migrate(db, { source: { kind: 'inline', migrations: postgresMigrations } });
      return db;
    },
    destroyDb: async (db) => {
      await db.destroy();
    },
  });
});

describe.skipIf(RUN_PG)('postgres conformance (skipped)', () => {
  test('docker unavailable — PG conformance skipped', () => {
    // Sentinel: keeps the file non-empty so CI dashboards report "1
    // skipped" instead of "no tests" (the latter looks like an error).
  });
});
