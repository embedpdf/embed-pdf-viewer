import { describe, expect, test } from 'vitest';
import { type Kysely } from 'kysely';
import { DocumentsRepo } from '../../src/db/repos/documents.repo';
import { TenantsRepo } from '../../src/db/repos/tenants.repo';
import type { Database } from '../../src/db/schema';
import type { MigrationSource } from '../../src/db/migrator/runner';
import { migrate } from '../../src/db/migrator/runner';

/**
 * Dialect-agnostic repo conformance suite.
 *
 * Both `db-sqlite.test.ts` and `db-postgres.test.ts` import this and
 * pass their own `setup` that builds a Kysely instance + applies the
 * dialect's migration set. The assertions below MUST pass identically
 * against either dialect — that's the whole point of the abstraction.
 *
 * To prove the suite actually catches dialect drift, add an assertion
 * here before adding the equivalent PG/SQLite migration.
 */
export interface DialectFixture {
  /** Build a fresh, migrated, isolated Kysely instance. */
  makeDb: () => Promise<Kysely<Database>>;
  /** Tear down a Kysely instance built by `makeDb`. */
  destroyDb: (db: Kysely<Database>) => Promise<void>;
  /** Diagnostic label printed in the `describe` block. */
  label: string;
}

export function runDbConformance(fx: DialectFixture): void {
  const dialect = fx.label;

  describe(`migrator [${dialect}]`, () => {
    test('applies pending migrations and records checksums', async () => {
      const db = await fx.makeDb();
      try {
        const rows = await db.selectFrom('schema_migrations').selectAll().execute();
        expect(rows.length).toBeGreaterThanOrEqual(1);
        expect(rows[0]!.version).toBe('001');
        expect(rows[0]!.checksum.length).toBe(64);
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('re-running migrate is a no-op when up-to-date', async () => {
      const db = await fx.makeDb();
      try {
        const before = await db
          .selectFrom('schema_migrations')
          .select(db.fn.countAll().as('n'))
          .executeTakeFirst();
        const second = await migrate(db, {
          source: { kind: 'inline', migrations: [] as ReadonlyArray<MigrationSource> },
        });
        expect(second).toHaveLength(0);
        const after = await db
          .selectFrom('schema_migrations')
          .select(db.fn.countAll().as('n'))
          .executeTakeFirst();
        expect(after?.n).toEqual(before?.n);
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('rejects rename of an already-applied migration', async () => {
      const db = await fx.makeDb();
      try {
        await expect(
          migrate(db, {
            source: {
              kind: 'inline',
              migrations: [{ version: '001', name: '001_renamed.sql', sql: 'SELECT 1;' }],
            },
          }),
        ).rejects.toThrow(/renamed/);
      } finally {
        await fx.destroyDb(db);
      }
    });
  });

  describe(`TenantsRepo [${dialect}]`, () => {
    test('ensure is idempotent and returns the existing row', async () => {
      const db = await fx.makeDb();
      try {
        const repo = new TenantsRepo(db);
        const a = await repo.ensure({ id: 'tenant-1', name: 'Acme' });
        const b = await repo.ensure({ id: 'tenant-1', name: 'Different name ignored' });
        expect(a.id).toBe('tenant-1');
        expect(a.name).toBe('Acme');
        expect(b.name).toBe('Acme');
      } finally {
        await fx.destroyDb(db);
      }
    });
  });

  describe(`DocumentsRepo [${dialect}]`, () => {
    test('createPending returns a pending row', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });

        const r = await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: { name: 'Q1' },
          idempotencyKey: null,
          createdBy: 'admin-1',
        });
        expect(r.created).toBe(true);
        expect(r.row.state).toBe('pending');
        expect(r.row.metadata).toEqual({ name: 'Q1' });
        expect(r.row.createdBy).toBe('admin-1');
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('idempotency-key returns the existing row on retry', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        const first = await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: 'kx-1',
          createdBy: null,
        });
        const second = await docs.createPending({
          id: 'doc99999',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: 'kx-1',
          createdBy: null,
        });
        expect(second.created).toBe(false);
        expect(second.row.id).toBe(first.row.id);
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('idempotency-key is scoped per-tenant', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        await tenants.ensure({ id: 'tenant-b' });
        await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: 'kx-1',
          createdBy: null,
        });
        const other = await docs.createPending({
          id: 'doc23456',
          tenantId: 'tenant-b',
          metadata: null,
          idempotencyKey: 'kx-1',
          createdBy: null,
        });
        expect(other.created).toBe(true);
        expect(other.row.id).toBe('doc23456');
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('commit promotes pending -> ready exactly once', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: null,
          createdBy: null,
        });
        const updated = await docs.commit({
          id: 'doc12345',
          tenantId: 'tenant-a',
          baseSha: 'a'.repeat(64),
          storageSizeBytes: 1024,
        });
        expect(updated?.state).toBe('ready');
        expect(updated?.baseSha).toBe('a'.repeat(64));
        expect(updated?.storageSizeBytes).toBe(1024);

        const second = await docs.commit({
          id: 'doc12345',
          tenantId: 'tenant-a',
          baseSha: 'a'.repeat(64),
          storageSizeBytes: 1024,
        });
        expect(second).toBeNull();
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('commit persists security probe booleans portably', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        await docs.createPending({
          id: 'docsecure',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: null,
          createdBy: null,
        });
        const updated = await docs.commit({
          id: 'docsecure',
          tenantId: 'tenant-a',
          baseSha: 'b'.repeat(64),
          storageSizeBytes: 2048,
          security: {
            encryptionState: 'none',
            encryptionRequiresPassword: false,
            pdfPermissionsBits: 0xffffffff,
            pdfPermissionsAllAllowed: true,
            pdfOpenedAs: 'none',
            securityProbedAt: 123,
          },
        });
        expect(updated?.security).toMatchObject({
          encryptionState: 'none',
          encryptionRequiresPassword: false,
          pdfPermissionsBits: 0xffffffff,
          pdfPermissionsAllAllowed: true,
          pdfOpenedAs: 'none',
          securityProbedAt: 123,
        });
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('requireOwned rejects cross-tenant reads', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        await tenants.ensure({ id: 'tenant-b' });
        await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: null,
          createdBy: null,
        });
        await expect(docs.requireOwned('doc12345', 'tenant-b')).rejects.toThrow(/tenant/);
        await expect(docs.requireOwned('nope', 'tenant-a')).rejects.toThrow(/not found/);
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('beginDelete + finalizeDelete are idempotent', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: null,
          createdBy: null,
        });
        expect((await docs.beginDelete('doc12345', 'tenant-a'))?.state).toBe('deleting');
        expect(await docs.beginDelete('doc12345', 'tenant-a')).toBeNull();
        await docs.finalizeDelete('doc12345', 'tenant-a');
        expect(await docs.findById('doc12345')).toBeNull();
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('listStalePending only returns rows older than the cutoff', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: null,
          createdBy: null,
        });
        expect(await docs.listStalePending(1_000_000)).toHaveLength(0);
        expect(await docs.listStalePending(0, Date.now() + 1_000_000)).toHaveLength(1);
      } finally {
        await fx.destroyDb(db);
      }
    });

    test('findByBaseSha returns the latest ready doc per tenant', async () => {
      const db = await fx.makeDb();
      try {
        const tenants = new TenantsRepo(db);
        const docs = new DocumentsRepo(db);
        await tenants.ensure({ id: 'tenant-a' });
        await tenants.ensure({ id: 'tenant-b' });
        await docs.createPending({
          id: 'doc12345',
          tenantId: 'tenant-a',
          metadata: null,
          idempotencyKey: null,
          createdBy: null,
        });
        await docs.commit({
          id: 'doc12345',
          tenantId: 'tenant-a',
          baseSha: 'b'.repeat(64),
          storageSizeBytes: 1,
        });
        expect((await docs.findByBaseSha('tenant-a', 'b'.repeat(64)))?.id).toBe('doc12345');
        expect(await docs.findByBaseSha('tenant-a', 'c'.repeat(64))).toBeNull();
        expect(await docs.findByBaseSha('tenant-b', 'b'.repeat(64))).toBeNull();
      } finally {
        await fx.destroyDb(db);
      }
    });
  });
}
