import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { sql } from 'kysely';
import { createPostgresDb, migrate, postgresMigrations } from '../src/index';
import { runDocPlaneTenantJwt } from './_helpers/doc-plane-tenant-jwt-suite';

/**
 * The tenant-JWT doc-plane suite against Postgres. Skips silently when
 * Docker isn't reachable; set `CLOUDPDF_REQUIRE_PG_TESTS=1` to turn that
 * into a hard failure (matrix CI job).
 */

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
if (REQUIRE && !RUN_PG) {
  throw new Error('CLOUDPDF_REQUIRE_PG_TESTS=1 but Docker is unavailable');
}

interface StartedPg {
  getConnectionUri: () => string;
  stop: () => Promise<unknown>;
}

let container: StartedPg | null = null;
let connectionString = process.env.CLOUDPDF_PG_TEST_URI ?? '';

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

if (RUN_PG) {
  runDocPlaneTenantJwt({
    label: 'postgres',
    makeDb: async () => {
      const schemaName = `t_${process.pid}_${Date.now()}`;
      const bootstrap = createPostgresDb({ connectionString, poolMax: 1 });
      try {
        await sql.raw(`CREATE SCHEMA "${schemaName}"`).execute(bootstrap);
      } finally {
        await bootstrap.destroy();
      }
      const sep = connectionString.includes('?') ? '&' : '?';
      const isolatedUri = `${connectionString}${sep}options=-c%20search_path%3D${schemaName}`;
      const db = createPostgresDb({ connectionString: isolatedUri, poolMax: 5 });
      await migrate(db, { source: { kind: 'inline', migrations: postgresMigrations } });
      return db;
    },
    destroyDb: async (db) => {
      await db.destroy();
    },
  });
} else {
  describe('tenant JWT on the doc plane [postgres] (skipped)', () => {
    test('docker unavailable — PG doc-plane tenant JWT suite skipped', () => {
      // Sentinel to keep the file non-empty when skipped.
    });
  });
}
