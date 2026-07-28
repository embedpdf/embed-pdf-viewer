import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Kysely } from 'kysely';
import {
  buildApp,
  createSqliteDb,
  defaultWorkerEntryUrl,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '@cloudpdf/server';

/**
 * Shared cloud-test scaffolding for the Phase 4 versioned read
 * pipeline. The cloud SDK's `annotations.list()` and `text.read()`
 * now require the doc to be visible to `DocumentService` (which
 * reads from the SQL `documents` table), so cloud tests that used
 * to seed via the legacy `kind: 'bytes'` open path now boot a
 * full DB-backed `buildApp` and seed via direct INSERT.
 *
 * `defaultWorkerEntryUrl` keeps the real PDFium worker pool so we
 * preserve the original tests' end-to-end depth — we're only
 * changing the open path, not the engine surface under test.
 */
export interface DbSeededFixture {
  bundle: AppBundle;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
  secret: string;
}

export async function buildDbSeededFixture(
  opts: { secret: string } = { secret: 'cloud-test-secret' },
): Promise<DbSeededFixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'cloud-test-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'cloud-test-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildApp({
    verifier: { mode: 'hs256', secret: opts.secret },
    workerEntry: defaultWorkerEntryUrl,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 4 * 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return { bundle, db, baseUrl, storageRoot, cacheRoot, secret: opts.secret };
}

export async function teardownDbSeededFixture(fx: DbSeededFixture | undefined): Promise<void> {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

/**
 * Seed a `ready` document from a real PDF file. The bytes are
 * stored under the canonical object-store key so the
 * `BaseFileCache` resolves them when the worker pool opens the
 * doc; the SHA-256 is computed once and recorded as `base_sha`.
 *
 * `pageCount` is read by the caller (we don't decode the PDF
 * here — that's the engine's job). For PDFium fixtures the test
 * author already knows the count.
 */
export async function seedDocumentFromBytes(
  fx: DbSeededFixture,
  tenantId: string,
  docId: string,
  bytesPath: string,
  pageCount: number,
): Promise<{ sha: string; size: number }> {
  const bytes = new Uint8Array(await readFile(bytesPath));
  const sha = createHash('sha256').update(bytes).digest('hex');

  const storage = new FsObjectStore({ root: fx.storageRoot });
  const key = StorageKeys.basePdf(tenantId, docId);
  await storage.put(key, bytes, { contentLength: bytes.byteLength });

  await fx.db
    .insertInto('tenants')
    .values({ id: tenantId, name: tenantId })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: tenantId,
      state: 'ready',
      base_sha: sha,
      storage_size_bytes: bytes.byteLength,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
  return { sha, size: bytes.byteLength };
}

export function docScopedToken(
  fx: DbSeededFixture,
  tenantId: string,
  docId: string,
  scope: ReadonlyArray<string> = ['*'],
  layerName?: string,
): string {
  return signDevToken(fx.secret, {
    sub: layerName ? `cloud-test-${layerName}` : 'cloud-test',
    tenant_id: tenantId,
    doc_id: docId,
    scope,
    ...(layerName ? { layer_name: layerName } : {}),
  });
}

export function tenantToken(
  fx: DbSeededFixture,
  tenantId: string,
  scope: ReadonlyArray<string> = ['*'],
): string {
  return signDevToken(fx.secret, {
    sub: 'cloud-test-tenant',
    tenant_id: tenantId,
    scope,
  });
}
