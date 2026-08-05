import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { BaseFileCache, type BaseFileCacheEvent } from '../src/storage/BaseFileCache';
import { FsObjectStore } from '../src/storage/adapters/FsObjectStore';
import { StorageKeys } from '../src/storage/keys';

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

interface Fixture {
  storageRoot: string;
  cacheRoot: string;
  store: FsObjectStore;
  cache: BaseFileCache;
  events: BaseFileCacheEvent[];
}

async function setup(opts: { maxBytes?: number } = {}): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'bfc-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'bfc-cache-'));
  const store = new FsObjectStore({ root: storageRoot });
  const events: BaseFileCacheEvent[] = [];
  const cache = new BaseFileCache({
    root: cacheRoot,
    maxBytes: opts.maxBytes ?? 64 * 1024 * 1024,
    store,
    onEvent: (e) => events.push(e),
  });
  return { storageRoot, cacheRoot, store, cache, events };
}

async function tearDown(fx: Fixture): Promise<void> {
  await fx.cache.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

async function putObject(
  fx: Fixture,
  bytes: Uint8Array,
  tenantId = 'tenant-a',
  docId = 'doc12345abcdef',
): Promise<{ key: string; sha: string }> {
  const key = StorageKeys.basePdf(tenantId, docId);
  await fx.store.put(key, bytes, { contentLength: bytes.byteLength });
  return { key, sha: sha256(bytes) };
}

describe('BaseFileCache', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await setup();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('first acquire materialises; second acquire is a cache hit', async () => {
    const bytes = randomBytes(4096);
    const { key, sha } = await putObject(fx, bytes);

    const h1 = await fx.cache.acquire({ sha, key });
    expect(h1.size).toBe(bytes.byteLength);
    expect(h1.sha256).toBe(sha);
    expect(await readFile(h1.path)).toEqual(Buffer.from(bytes));

    const h2 = await fx.cache.acquire({ sha, key });
    expect(h2.path).toBe(h1.path);

    const hits = fx.events.filter((e) => e.kind === 'hit').length;
    const misses = fx.events.filter((e) => e.kind === 'miss').length;
    expect(hits).toBe(1);
    expect(misses).toBe(1);

    h1.release();
    h2.release();
  });

  test('singleflight: concurrent acquires share one materialise', async () => {
    const bytes = randomBytes(64 * 1024);
    const { key, sha } = await putObject(fx, bytes);

    const acquirers = Array.from({ length: 16 }, () => fx.cache.acquire({ sha, key }));
    const handles = await Promise.all(acquirers);
    expect(new Set(handles.map((h) => h.path)).size).toBe(1);

    const materializeStarts = fx.events.filter((e) => e.kind === 'materialize-start').length;
    expect(materializeStarts).toBe(1);

    for (const h of handles) h.release();
  });

  test('sha mismatch rejects with a clear error and removes the partial', async () => {
    const bytes = randomBytes(2048);
    const { key } = await putObject(fx, bytes);
    const wrongSha = 'a'.repeat(64);

    await expect(fx.cache.acquire({ sha: wrongSha, key })).rejects.toThrow(/sha mismatch/);

    // The cache must not retain a partial entry.
    expect(fx.cache.stats().entries).toBe(0);
    // And the cache dir must not have any leftover .partial files.
    const swept = await fx.cache.sweepPartials();
    expect(swept).toBe(0);
  });

  test('LRU eviction drops refcount=0 entries to stay under budget', async () => {
    await fx.cache.destroy();
    fx = await setup({ maxBytes: 8 * 1024 }); // 8 KiB budget

    const big = randomBytes(6 * 1024);
    const big2 = randomBytes(6 * 1024);
    const a = await putObject(fx, big, 'tenant', 'docA1234567890');
    const b = await putObject(fx, big2, 'tenant', 'docB1234567890');

    const hA = await fx.cache.acquire({ sha: a.sha, key: a.key });
    expect(fx.cache.stats().usedBytes).toBe(6 * 1024);
    hA.release();

    const hB = await fx.cache.acquire({ sha: b.sha, key: b.key });
    // After acquiring B (also 6KB), usedBytes is briefly 12KB > 8KB
    // budget; the LRU sweeper evicts the refcount=0 entry A.
    const evicted = fx.events.filter((e) => e.kind === 'evict');
    expect(evicted).toHaveLength(1);
    expect((evicted[0] as { sha: string }).sha).toBe(a.sha);
    expect(fx.cache.stats().usedBytes).toBe(6 * 1024);
    hB.release();
  });

  test('refcounted entries are pinned and never evicted', async () => {
    await fx.cache.destroy();
    fx = await setup({ maxBytes: 8 * 1024 });

    const a = await putObject(fx, randomBytes(6 * 1024), 't', 'docA1234567890');
    const b = await putObject(fx, randomBytes(6 * 1024), 't', 'docB1234567890');

    const hA = await fx.cache.acquire({ sha: a.sha, key: a.key });
    const hB = await fx.cache.acquire({ sha: b.sha, key: b.key });

    // Both entries refcounted; we are over budget but the LRU
    // sweeper must NOT evict either of them.
    expect(fx.events.find((e) => e.kind === 'evict')).toBeUndefined();
    expect(fx.cache.stats().entries).toBe(2);
    expect(fx.cache.stats().refcounted).toBe(2);

    hA.release();
    hB.release();
  });

  test('sweepPartials removes orphaned .partial files on boot', async () => {
    // Plant an orphan partial in the cache root.
    const orphanDir = join(fx.cacheRoot, 'ab');
    await mkdir(orphanDir, { recursive: true });
    await writeFile(join(orphanDir, 'abcdef.pdf.partial.dead'), 'orphan');

    const removed = await fx.cache.sweepPartials();
    expect(removed).toBe(1);
    const sweeps = fx.events.filter((e) => e.kind === 'sweep-partial');
    expect(sweeps).toHaveLength(1);
  });

  test('handle.release is idempotent', async () => {
    const bytes = randomBytes(1024);
    const { key, sha } = await putObject(fx, bytes);
    const h = await fx.cache.acquire({ sha, key });

    h.release();
    h.release(); // no-op
    const releases = fx.events.filter((e) => e.kind === 'release').length;
    expect(releases).toBe(1);
  });

  test('two docs with the same content share one cache entry', async () => {
    const bytes = randomBytes(4096);
    const k1 = StorageKeys.basePdf('t', 'docA1234567890');
    const k2 = StorageKeys.basePdf('t', 'docB1234567890');
    await fx.store.put(k1, bytes, { contentLength: bytes.byteLength });
    await fx.store.put(k2, bytes, { contentLength: bytes.byteLength });
    const sha = sha256(bytes);

    const h1 = await fx.cache.acquire({ sha, key: k1 });
    const h2 = await fx.cache.acquire({ sha, key: k2 });
    expect(h1.path).toBe(h2.path);

    const materializeStarts = fx.events.filter((e) => e.kind === 'materialize-start').length;
    expect(materializeStarts).toBe(1);
    h1.release();
    h2.release();
  });

  test('failed materialise allows a clean retry', async () => {
    const bytes = randomBytes(1024);
    const { key, sha } = await putObject(fx, bytes);

    await expect(fx.cache.acquire({ sha: 'b'.repeat(64), key })).rejects.toThrow();
    // Retry with the correct sha succeeds and goes through a fresh
    // materialise.
    const h = await fx.cache.acquire({ sha, key });
    expect(h.sha256).toBe(sha);
    h.release();
  });
});

describe('FsObjectStore.materializeLocal', () => {
  let fx: Fixture;
  beforeEach(async () => {
    fx = await setup();
  });
  afterEach(async () => {
    await tearDown(fx);
  });

  test('produces a byte-identical file with verified sha', async () => {
    const bytes = randomBytes(32 * 1024);
    const { key, sha } = await putObject(fx, bytes);
    const dest = join(fx.cacheRoot, 'staged.pdf');

    const r = await fx.store.materializeLocal(key, dest, { expectedSha: sha });
    expect(r.size).toBe(bytes.byteLength);
    expect(r.sha256).toBe(sha);
    const got = await readFile(r.path);
    expect(got).toEqual(Buffer.from(bytes));
  });

  test('aborts cleanly when sha does not match expected', async () => {
    const bytes = randomBytes(1024);
    const { key } = await putObject(fx, bytes);
    const dest = join(fx.cacheRoot, 'bad.pdf');
    await expect(
      fx.store.materializeLocal(key, dest, { expectedSha: 'c'.repeat(64) }),
    ).rejects.toThrow(/sha mismatch/);

    // Final file must not exist; partials cleaned up.
    await expect(stat(dest)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
