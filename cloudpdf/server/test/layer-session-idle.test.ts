import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import type { DocumentService, OpenContext } from '../src/services/DocumentService';

/**
 * Layer sessions don't pile up: a worker session nobody asks for closes
 * after `layerSessionIdleMs`, and a document keeps at most
 * `maxLayerSessionsPerDoc` open, so a layer per visitor costs an open PDF
 * only while that visitor is around. The next request reopens a closed
 * session from the durable artifact.
 */

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const IDLE_MS = 60_000;
const TENANT = 'tenant-idle';
const DOC = 'docidle00001';
const CTX: OpenContext = { tenantId: TENANT, sub: 'test' };

interface Fixture {
  bundle: AppBundle;
  service: DocumentService;
  db: Kysely<DbSchema>;
  storageRoot: string;
  cacheRoot: string;
  /** Worker dispatches as `kind:layerName`. */
  dispatched: string[];
}

let fx: Fixture;

beforeEach(async () => {
  fx = await buildFixture({ maxLayerSessionsPerDoc: 2 });
  await seedDocument(fx);
});

afterEach(async () => {
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
});

const open = (layer: string) => fx.service.ensureLayerOnPool(CTX, DOC, layer);
const later = () => Date.now() + IDLE_MS + 1;
const count = (entry: string) => fx.dispatched.filter((kind) => kind === entry).length;

describe('the idle sweep', () => {
  test('closes a session nobody asked for, and the next request reopens it', async () => {
    await open('alice');
    expect(fx.service.stats().openLayerSessions).toBe(1);
    const closes = count('layer.close:alice');

    expect(await fx.service.closeIdleLayerSessions(later())).toBe(1);
    expect(fx.service.stats().openLayerSessions).toBe(0);
    expect(count('layer.close:alice')).toBe(closes + 1);

    await open('alice');
    expect(fx.service.stats().openLayerSessions).toBe(1);
    expect(count('open.layerFileBase:alice')).toBe(2);
  });

  test('leaves a session that was asked for within the idle time', async () => {
    await open('alice');
    expect(await fx.service.closeIdleLayerSessions(Date.now() + IDLE_MS / 2)).toBe(0);
    expect(fx.service.stats().openLayerSessions).toBe(1);
  });

  test('leaves a session with a write in flight, and counts idle from when it ends', async () => {
    await open('alice');
    const settle = fx.service.beginLayerWrite(DOC, 'alice');
    expect(await fx.service.closeIdleLayerSessions(later())).toBe(0);
    settle();
    expect(await fx.service.closeIdleLayerSessions(Date.now() + IDLE_MS / 2)).toBe(0);
    expect(await fx.service.closeIdleLayerSessions(later())).toBe(1);
  });

  test('a request that arrives while the sweep closes waits and reopens', async () => {
    await open('alice');
    const sweep = fx.service.closeIdleLayerSessions(later());
    await open('alice');
    expect(await sweep).toBe(1);
    expect(fx.service.stats().openLayerSessions).toBe(1);
    expect(count('open.layerFileBase:alice')).toBe(2);
  });
});

describe('the per-document cap', () => {
  test('opening one more session closes the longest-unasked one', async () => {
    await open('alice');
    await tick();
    await open('bob');
    await tick();
    await open('alice'); // asked for again: bob is now the longest-unasked
    await tick();
    const alice = count('layer.close:alice');
    const bob = count('layer.close:bob');
    await open('carol');

    await until(() => fx.service.stats().openLayerSessions === 2);
    expect(count('layer.close:bob')).toBe(bob + 1);
    expect(count('layer.close:alice')).toBe(alice);

    // Bob's next request reopens him, which in turn closes the longest-unasked other: alice.
    await tick();
    await open('bob');
    await until(() => count('layer.close:alice') === alice + 1);
    expect(fx.service.stats().openLayerSessions).toBe(2);
  });
});

async function buildFixture(opts: { maxLayerSessionsPerDoc: number }): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'layer-idle-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'layer-idle-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: 'layer-idle-secret' },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
    layerSessionIdleMs: IDLE_MS,
    maxLayerSessionsPerDoc: opts.maxLayerSessionsPerDoc,
  });
  const dispatched: string[] = [];
  const pool = bundle.pool as unknown as {
    run: (
      docId: string,
      build: (id: number) => { payload: { kind: string; layerName?: string } },
      signal?: unknown,
    ) => Promise<unknown>;
  };
  const run = pool.run.bind(pool);
  pool.run = async (docId, build, signal) =>
    run(
      docId,
      ((id: number) => {
        const pack = build(id);
        dispatched.push(`${pack.payload.kind}:${pack.payload.layerName ?? ''}`);
        return pack;
      }) as never,
      signal as never,
    );
  return { bundle, service: bundle.documentService!, db, storageRoot, cacheRoot, dispatched };
}

async function seedDocument(fx: Fixture): Promise<void> {
  const bytes = new Uint8Array(4096);
  bytes[0] = 2;
  bytes.set(randomBytes(4094), 2);
  const sha = createHash('sha256').update(bytes).digest('hex');
  await new FsObjectStore({ root: fx.storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, {
    contentLength: bytes.byteLength,
  });
  await fx.db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: DOC,
      tenant_id: TENANT,
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
}

/** Let the clock move, so two touches never share a millisecond. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

async function until(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !condition(); i++) await tick();
  expect(condition()).toBe(true);
}
