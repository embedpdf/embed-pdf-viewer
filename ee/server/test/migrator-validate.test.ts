import { describe, expect, test } from 'vitest';
import { sql } from 'kysely';
import { createSqliteDb } from '../src/db/drivers/sqlite';
import {
  migrate,
  status,
  validate,
  validateOrThrow,
  type MigrationSource,
} from '../src/db/migrator/runner';
import { sqliteMigrations } from '../src/db/migrations/sqlite/index';

/**
 * Drift detection tests. Each test builds a fresh in-memory DB so the
 * scenarios are completely isolated.
 *
 * The detector is the single most important safety net in Phase 2:
 * if it misses a real drift, production starts on the wrong schema
 * and corrupts data. We test it harder than anything else here.
 */

async function freshDb() {
  const db = createSqliteDb({ path: ':memory:' });
  return db;
}

describe('migrator.status', () => {
  test('reports all migrations as pending on a fresh db', async () => {
    const db = await freshDb();
    const rows = await status(db, sqliteMigrations);
    expect(rows.every((r) => r.state === 'pending')).toBe(true);
    await db.destroy();
  });

  test('reports all migrations as applied after migrate', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const rows = await status(db, sqliteMigrations);
    expect(rows.every((r) => r.state === 'applied')).toBe(true);
    expect(rows.every((r) => typeof r.appliedAt === 'number')).toBe(true);
    await db.destroy();
  });

  test('reports drift when an applied migration is edited in code', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });

    const tampered: MigrationSource[] = sqliteMigrations.map((m) =>
      m.version === '001' ? { ...m, sql: `${m.sql}\n-- malicious edit after apply\n` } : m,
    );
    const rows = await status(db, tampered);
    const v1 = rows.find((r) => r.version === '001');
    expect(v1?.state).toBe('drift');
    expect(v1?.drift).toBeDefined();
    expect(v1?.drift?.dbChecksum).not.toBe(v1?.drift?.codeChecksum);
    await db.destroy();
  });

  test('reports orphan when an applied migration is missing from code', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const truncated: MigrationSource[] = []; // code claims zero migrations exist.
    const rows = await status(db, truncated);
    expect(rows.every((r) => r.state === 'orphan')).toBe(true);
    await db.destroy();
  });
});

describe('migrator.validate', () => {
  test('clean db with applied migrations returns no issues', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    expect(await validate(db, sqliteMigrations)).toEqual([]);
    await db.destroy();
  });

  test('catches checksum mismatch and tags it correctly', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const tampered: MigrationSource[] = sqliteMigrations.map((m) =>
      m.version === '001' ? { ...m, sql: `${m.sql}\n-- evil\n` } : m,
    );
    const issues = await validate(db, tampered);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]!.kind).toBe('checksum_mismatch');
    expect(issues[0]!.version).toBe('001');
    expect(issues[0]!.message).toMatch(/checksum drift/);
    await db.destroy();
  });

  test('catches renamed migration', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    // Manually fake a rename in the DB to simulate the scenario.
    await db
      .updateTable('schema_migrations')
      .set({ name: 'old_name.sql' })
      .where('version', '=', '001')
      .execute();
    const issues = await validate(db, sqliteMigrations);
    const rename = issues.find((i) => i.kind === 'renamed');
    expect(rename).toBeDefined();
    expect(rename?.version).toBe('001');
    await db.destroy();
  });

  test('catches missing_in_code (orphan)', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const issues = await validate(db, []);
    expect(issues.length).toBe(sqliteMigrations.length);
    expect(issues[0]!.kind).toBe('missing_in_code');
    await db.destroy();
  });

  test('treatPendingAsDrift surfaces pending as unknown_in_db', async () => {
    const db = await freshDb();
    // Apply nothing; all migrations are "pending".
    const lax = await validate(db, sqliteMigrations);
    expect(lax).toEqual([]); // default: pending is OK
    const strict = await validate(db, sqliteMigrations, { treatPendingAsDrift: true });
    expect(strict.length).toBe(sqliteMigrations.length);
    expect(strict[0]!.kind).toBe('unknown_in_db');
    await db.destroy();
  });

  test('validateOrThrow throws a multi-line aggregate error', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    // Inject two distinct drift scenarios: edit + delete-from-code.
    await sql`
      INSERT INTO schema_migrations(version, name, checksum, applied_at)
      VALUES ('999', 'phantom.sql', 'deadbeef', 1)
    `.execute(db);
    const tampered: MigrationSource[] = sqliteMigrations.map((m) =>
      m.version === '001' ? { ...m, sql: `${m.sql}\n-- evil\n` } : m,
    );
    await expect(validateOrThrow(db, tampered)).rejects.toThrow(
      /migration drift detected[\s\S]*checksum_mismatch[\s\S]*missing_in_code/,
    );
    await db.destroy();
  });
});

describe('buildApp drift guard', () => {
  test('refuses to start when checksum drift is present', async () => {
    const db = await freshDb();
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const tampered: MigrationSource[] = sqliteMigrations.map((m) =>
      m.version === '001' ? { ...m, sql: `${m.sql}\n-- evil\n` } : m,
    );
    // Mirror how buildApp does it.
    const { buildApp } = await import('../src/app/buildApp');
    const { createValidTestLicenseGate } = await import('../src/licensing/testing');
    const { FsObjectStore } = await import('../src/storage/adapters/FsObjectStore');
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = await mkdtemp(join(tmpdir(), 'drift-'));
    try {
      await expect(
        buildApp({
          licenseGate: createValidTestLicenseGate(),
          verifier: { mode: 'hs256', secret: 'x' },
          workerEntry: null,
          db,
          objectStore: new FsObjectStore({ root: dir }),
          expectedMigrations: tampered,
        }),
      ).rejects.toThrow(/migration drift detected/);
    } finally {
      await rm(dir, { recursive: true, force: true });
      await db.destroy();
    }
  });
});
