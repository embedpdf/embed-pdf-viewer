import { execSync } from 'node:child_process';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { sql } from 'kysely';
import { createPostgresDb, migrate, postgresMigrations } from '../src/index';
import { runMultiReplicaSuite } from './_helpers/multi-replica-suite';
import type { ReplicaDbFactory } from './_helpers/two-replica-harness';

/**
 * The multi-replica correctness suite on Postgres — the engine that
 * production multi-replica requires, and the only one that can represent
 * two commit transactions overlapping between their version read and
 * their layers UPDATE (the P1 review finding). Schema-per-cluster keeps
 * runs isolated on a shared server, mirroring `admin-documents-postgres`.
 *
 * Skips silently when Docker isn't reachable; set
 * `CLOUDPDF_REQUIRE_PG_TESTS=1` to turn that into a hard failure
 * (matrix CI job). `CLOUDPDF_PG_TEST_URI` reuses an external server.
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

function postgresReplicaFactory(): ReplicaDbFactory {
  return {
    label: 'postgres',
    supportsCommitOverlap: true,
    setup: async () => {
      schemaCounter += 1;
      const schemaName = `mr_${process.pid}_${Date.now()}_${schemaCounter}`;
      const bootstrap = createPostgresDb({ connectionString, poolMax: 1 });
      try {
        await sql.raw(`CREATE SCHEMA "${schemaName}"`).execute(bootstrap);
      } finally {
        await bootstrap.destroy();
      }
      const sep = connectionString.includes('?') ? '&' : '?';
      const isolatedUri = `${connectionString}${sep}options=-c%20search_path%3D${schemaName}`;
      const migrator = createPostgresDb({ connectionString: isolatedUri, poolMax: 1 });
      await migrate(migrator, { source: { kind: 'inline', migrations: postgresMigrations } });
      await migrator.destroy();
      return {
        // Each replica gets its own pool against the shared schema —
        // production topology (one Postgres, per-replica connections).
        connect: async () => createPostgresDb({ connectionString: isolatedUri, poolMax: 5 }),
        destroy: async () => undefined,
      };
    },
  };
}

if (RUN_PG) {
  runMultiReplicaSuite(postgresReplicaFactory());
} else {
  describe('multi-replica layer writes [postgres] (skipped)', () => {
    test('docker unavailable — PG multi-replica suite skipped', () => {
      // Sentinel to keep the file non-empty when skipped.
    });
  });
}
