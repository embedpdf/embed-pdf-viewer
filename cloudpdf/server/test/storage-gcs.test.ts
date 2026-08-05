/**
 * GcsObjectStore unit tests.
 *
 * `@google-cloud/storage` has no first-party mock library (unlike S3's
 * aws-sdk-client-mock), so we `vi.mock` the module with a faithful
 * in-memory fake bucket. The fake stores bytes + custom metadata, so
 * the adapter's real logic (sha-in-metadata, content-length guard,
 * ranged materialize, prefix delete) is exercised end-to-end.
 *
 * Live GCS acceptance runs out-of-band against a real bucket / the
 * fake-gcs-server emulator (STORAGE_LIVE=1), not in CI.
 */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// In-memory store shared between the mock and the assertions.
const gcs = vi.hoisted(() => {
  interface Obj {
    bytes: Buffer;
    contentType: string;
    metadata: Record<string, string>;
  }
  const objects = new Map<string, Obj>();
  return { objects, signedUrlCalls: [] as unknown[] };
});

vi.mock('@google-cloud/storage', () => {
  class FakeFile {
    constructor(
      readonly bucketName: string,
      readonly key: string,
    ) {}
    async exists(): Promise<[boolean]> {
      return [gcs.objects.has(this.key)];
    }
    async getMetadata(): Promise<[Record<string, unknown>]> {
      const o = gcs.objects.get(this.key);
      if (!o) {
        const err = new Error('Not Found') as Error & { code: number };
        err.code = 404;
        throw err;
      }
      return [
        {
          size: String(o.bytes.byteLength),
          etag: `etag-${o.bytes.byteLength}`,
          contentType: o.contentType,
          metadata: o.metadata,
        },
      ];
    }
    async save(
      buf: Buffer,
      opts: { contentType?: string; metadata?: { metadata?: Record<string, string> } },
    ): Promise<void> {
      gcs.objects.set(this.key, {
        bytes: Buffer.from(buf),
        contentType: opts.contentType ?? 'application/octet-stream',
        metadata: opts.metadata?.metadata ?? {},
      });
    }
    async download(): Promise<[Buffer]> {
      const o = gcs.objects.get(this.key);
      if (!o) {
        const err = new Error('Not Found') as Error & { code: number };
        err.code = 404;
        throw err;
      }
      return [o.bytes];
    }
    createReadStream(opts?: { start?: number; end?: number }): Readable {
      const o = gcs.objects.get(this.key);
      if (!o) {
        const r = new Readable({ read() {} });
        process.nextTick(() => r.destroy(Object.assign(new Error('Not Found'), { code: 404 })));
        return r;
      }
      const start = opts?.start ?? 0;
      // GCS createReadStream end is inclusive.
      const end = opts?.end === undefined ? o.bytes.byteLength - 1 : opts.end;
      return Readable.from([o.bytes.subarray(start, end + 1)]);
    }
    async getSignedUrl(opts: {
      version: string;
      action: string;
      expires: number;
      contentType?: string;
    }): Promise<[string]> {
      gcs.signedUrlCalls.push({ key: this.key, ...opts });
      const q = `?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=${opts.expires}&action=${opts.action}`;
      return [`https://storage.googleapis.com/${this.bucketName}/${this.key}${q}`];
    }
    async delete(opts?: { ignoreNotFound?: boolean }): Promise<void> {
      if (!gcs.objects.has(this.key)) {
        if (opts?.ignoreNotFound) return;
        const err = new Error('Not Found') as Error & { code: number };
        err.code = 404;
        throw err;
      }
      gcs.objects.delete(this.key);
    }
  }

  class FakeBucket {
    constructor(readonly name: string) {}
    file(key: string): FakeFile {
      return new FakeFile(this.name, key);
    }
    async getFiles({ prefix }: { prefix: string }): Promise<[FakeFile[]]> {
      const matching = [...gcs.objects.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((k) => new FakeFile(this.name, k));
      return [matching];
    }
    async deleteFiles({ prefix }: { prefix: string; force?: boolean }): Promise<void> {
      for (const k of [...gcs.objects.keys()]) {
        if (k.startsWith(prefix)) gcs.objects.delete(k);
      }
    }
  }

  return {
    Storage: class {
      bucket(name: string): FakeBucket {
        return new FakeBucket(name);
      }
    },
  };
});

// Import AFTER the mock is registered.
const { GcsObjectStore } = await import('../src/storage/adapters/GcsObjectStore');
const { runObjectStoreConformance } = await import('./_helpers/object-store-conformance');

// Same contract suite the FS oracle runs — proves the GCS adapter
// doesn't diverge from the universal ObjectStore behaviour.
runObjectStoreConformance('gcs', () => {
  gcs.objects.clear();
  gcs.signedUrlCalls.length = 0;
  return new GcsObjectStore({ bucket: 'b', projectId: 'p' });
});

function sha256Hex(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex');
}
function randomBytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = i % 256;
  return a;
}

let tmp: string;
beforeEach(async () => {
  gcs.objects.clear();
  gcs.signedUrlCalls.length = 0;
  tmp = await mkdtemp(join(tmpdir(), 'gcs-test-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('GcsObjectStore', () => {
  const newStore = () => new GcsObjectStore({ bucket: 'b', projectId: 'p' });

  test('info exposes public identifiers only', () => {
    expect(newStore().info).toEqual({
      kind: 'gcs',
      location: 'gs://b',
      bucket: 'b',
      projectId: 'p',
    });
  });

  test('put records SHA-256 in custom metadata and returns it', async () => {
    const store = newStore();
    const bytes = randomBytes(512);
    const r = await store.put('t/docs/ab/x/base.pdf', bytes, { contentLength: bytes.byteLength });
    expect(r.sha256).toBe(sha256Hex(bytes));
    expect(gcs.objects.get('t/docs/ab/x/base.pdf')?.metadata).toEqual({
      'x-embedpdf-sha256': sha256Hex(bytes),
    });
  });

  test('put rejects content-length mismatch without storing', async () => {
    const store = newStore();
    const bytes = randomBytes(64);
    await expect(store.put('k', bytes, { contentLength: bytes.byteLength - 1 })).rejects.toThrow(
      /contentLength/,
    );
    expect(gcs.objects.has('k')).toBe(false);
  });

  test('getSha256 reads from metadata; stat/exists reflect presence', async () => {
    const store = newStore();
    const bytes = randomBytes(256);
    await store.put('k', bytes, { contentLength: bytes.byteLength });
    expect(await store.getSha256('k')).toBe(sha256Hex(bytes));
    expect(await store.exists('k')).toBe(true);
    expect((await store.stat('k'))?.size).toBe(256);
    expect(await store.stat('missing')).toBeNull();
    expect(await store.getSha256('missing')).toBeNull();
  });

  test('presignUpload returns a v4 PUT descriptor with content headers', async () => {
    const store = newStore();
    const up = await store.presignUpload('k', 900, {
      contentLength: 1234,
      contentType: 'application/pdf',
    });
    expect(up?.method).toBe('PUT');
    expect(up?.url).toContain('GOOG4-RSA-SHA256');
    expect(up?.headers['Content-Type']).toBe('application/pdf');
    expect(up?.headers['Content-Length']).toBe('1234');
    expect(gcs.signedUrlCalls[0]).toMatchObject({ version: 'v4', action: 'write' });
  });

  test('delete returns true when present, false when missing', async () => {
    const store = newStore();
    await store.put('k', randomBytes(8), { contentLength: 8 });
    expect(await store.delete('k')).toBe(true);
    expect(await store.delete('k')).toBe(false);
  });

  test('deletePrefix recurses and reports the count', async () => {
    const store = newStore();
    await store.put('t/a/1', randomBytes(4), { contentLength: 4 });
    await store.put('t/a/2', randomBytes(4), { contentLength: 4 });
    await store.put('t/b/1', randomBytes(4), { contentLength: 4 });
    const r = await store.deletePrefix('t/a/');
    expect(r.deleted).toBe(2);
    expect(gcs.objects.has('t/b/1')).toBe(true);
  });

  test('materializeLocal fans out ranges, verifies sha, writes atomically', async () => {
    const store = newStore();
    const bytes = randomBytes(40_000);
    const sha = sha256Hex(bytes);
    await store.put('k', bytes, { contentLength: bytes.byteLength });
    const dest = join(tmp, 'out.pdf');
    const res = await store.materializeLocal('k', dest, {
      expectedSha: sha,
      concurrency: 4,
      chunkSizeBytes: 8192, // force multiple ranges
    });
    expect(res.size).toBe(40_000);
    expect(res.sha256).toBe(sha);
    expect(new Uint8Array(await readFile(dest))).toEqual(bytes);
  });

  test('materializeLocal throws on sha mismatch and leaves no file', async () => {
    const store = newStore();
    const bytes = randomBytes(1000);
    await store.put('k', bytes, { contentLength: bytes.byteLength });
    const dest = join(tmp, 'out.pdf');
    await expect(
      store.materializeLocal('k', dest, { expectedSha: 'deadbeef', chunkSizeBytes: 256 }),
    ).rejects.toThrow(/sha mismatch/);
    await expect(readFile(dest)).rejects.toThrow();
  });
});
