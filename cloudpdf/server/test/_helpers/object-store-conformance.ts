/**
 * Shared ObjectStore conformance suite.
 *
 * The anti-divergence guarantee: every backend must observably behave
 * the same for the universal contract (put/get/stat/exists/getSha256/
 * delete/deletePrefix/materializeLocal). One assertion set, run against
 * each adapter — FsObjectStore is the always-on correctness oracle in
 * CI; GcsObjectStore and AzureBlobObjectStore run against their
 * in-memory SDK fakes. If an adapter drifts, the SAME test fails.
 *
 * Presigning is intentionally NOT covered here — it legitimately
 * differs per backend (FS returns null; clouds return signed
 * descriptors with backend-specific headers). Per-adapter tests pin
 * those shapes.
 *
 * Usage (inside a test file that has already set up any vi.mock for
 * the backend's SDK):
 *
 *   runObjectStoreConformance('gcs', async () => {
 *     resetFake();
 *     return new GcsObjectStore({ bucket: 'b' });
 *   });
 */
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { ObjectStore } from '../../src/storage/ObjectStore';

function sha256Hex(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex');
}
function patternBytes(n: number, seed = 1): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * seed + 13) % 256;
  return a;
}

/**
 * @param label  backend name, shown in the describe block.
 * @param makeStore  returns a FRESH, empty store each call (the impl
 *   is responsible for resetting any in-memory fake state).
 */
export function runObjectStoreConformance(
  label: string,
  makeStore: () => Promise<ObjectStore> | ObjectStore,
): void {
  describe(`ObjectStore conformance — ${label}`, () => {
    let store: ObjectStore;
    let tmp: string;

    beforeEach(async () => {
      store = await makeStore();
      tmp = await mkdtemp(join(tmpdir(), `conf-${label}-`));
    });
    afterEach(async () => {
      await rm(tmp, { recursive: true, force: true });
    });

    const KEY = 'tnt-1/docs/ab/abx/base.pdf';

    test('put → get round-trips the exact bytes', async () => {
      const bytes = patternBytes(2048);
      const { sha256 } = await store.put(KEY, bytes, { contentLength: bytes.byteLength });
      expect(sha256).toBe(sha256Hex(bytes));
      const got = await store.get(KEY);
      expect(got).not.toBeNull();
      expect(new Uint8Array(got!)).toEqual(bytes);
    });

    test('get / stat / getSha256 return null for a missing key', async () => {
      expect(await store.get('tnt-1/docs/zz/zzz/missing.pdf')).toBeNull();
      expect(await store.stat('tnt-1/docs/zz/zzz/missing.pdf')).toBeNull();
      expect(await store.getSha256('tnt-1/docs/zz/zzz/missing.pdf')).toBeNull();
    });

    test('exists reflects presence', async () => {
      expect(await store.exists(KEY)).toBe(false);
      await store.put(KEY, patternBytes(16), { contentLength: 16 });
      expect(await store.exists(KEY)).toBe(true);
    });

    test('stat reports size and a non-empty etag', async () => {
      await store.put(KEY, patternBytes(321), { contentLength: 321 });
      const st = await store.stat(KEY);
      expect(st?.size).toBe(321);
      expect(typeof st?.etag).toBe('string');
      expect((st?.etag ?? '').length).toBeGreaterThan(0);
    });

    test('getSha256 matches the digest returned by put', async () => {
      const bytes = patternBytes(4096, 3);
      const { sha256 } = await store.put(KEY, bytes, { contentLength: bytes.byteLength });
      expect(await store.getSha256(KEY)).toBe(sha256);
    });

    test('put rejects a content-length mismatch and stores nothing new', async () => {
      const bytes = patternBytes(128);
      await expect(
        store.put('tnt-1/docs/cd/cde/x.pdf', bytes, { contentLength: bytes.byteLength - 1 }),
      ).rejects.toThrow();
      expect(await store.exists('tnt-1/docs/cd/cde/x.pdf')).toBe(false);
    });

    test('put is overwrite-idempotent (last write wins)', async () => {
      await store.put(KEY, patternBytes(100, 1), { contentLength: 100 });
      const second = patternBytes(200, 9);
      await store.put(KEY, second, { contentLength: 200 });
      expect(new Uint8Array((await store.get(KEY))!)).toEqual(second);
    });

    test('delete returns true once, then false (idempotent)', async () => {
      await store.put(KEY, patternBytes(8), { contentLength: 8 });
      expect(await store.delete(KEY)).toBe(true);
      expect(await store.delete(KEY)).toBe(false);
      expect(await store.exists(KEY)).toBe(false);
    });

    test('deletePrefix recurses, returns the count, and spares siblings', async () => {
      await store.put('tnt-1/docs/ab/abx/base.pdf', patternBytes(8), { contentLength: 8 });
      await store.put('tnt-1/docs/ab/abx/layers/main/v1.layer', patternBytes(8), {
        contentLength: 8,
      });
      await store.put('tnt-1/docs/cd/cde/base.pdf', patternBytes(8), { contentLength: 8 });
      const { deleted } = await store.deletePrefix('tnt-1/docs/ab/abx/');
      expect(deleted).toBe(2);
      expect(await store.exists('tnt-1/docs/ab/abx/base.pdf')).toBe(false);
      expect(await store.exists('tnt-1/docs/cd/cde/base.pdf')).toBe(true);
    });

    test('deletePrefix on a missing prefix is a no-op', async () => {
      expect(await store.deletePrefix('tnt-1/docs/zz/zzz/')).toEqual({ deleted: 0 });
    });

    test('materializeLocal writes a verified file (multi-range fan-out)', async () => {
      const bytes = patternBytes(50_000, 5);
      const sha = sha256Hex(bytes);
      await store.put(KEY, bytes, { contentLength: bytes.byteLength });
      const dest = join(tmp, 'out.pdf');
      const res = await store.materializeLocal(KEY, dest, {
        expectedSha: sha,
        concurrency: 4,
        chunkSizeBytes: 8192, // forces several ranges
      });
      expect(res.size).toBe(50_000);
      expect(res.sha256).toBe(sha);
      expect(res.path).toBe(dest);
      expect(new Uint8Array(await readFile(dest))).toEqual(bytes);
    });

    test('materializeLocal rejects a sha mismatch and leaves no file behind', async () => {
      const bytes = patternBytes(3000, 7);
      await store.put(KEY, bytes, { contentLength: bytes.byteLength });
      const dest = join(tmp, 'out.pdf');
      await expect(
        store.materializeLocal(KEY, dest, { expectedSha: 'deadbeef', chunkSizeBytes: 512 }),
      ).rejects.toThrow(/sha mismatch/i);
      await expect(readFile(dest)).rejects.toThrow();
    });

    test('info carries a kind discriminator and a location string', () => {
      expect(typeof store.info.kind).toBe('string');
      expect(typeof store.info.location).toBe('string');
      expect(store.info.location.length).toBeGreaterThan(0);
    });
  });
}
