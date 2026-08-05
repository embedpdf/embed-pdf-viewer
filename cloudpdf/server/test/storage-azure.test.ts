/**
 * AzureBlobObjectStore unit tests.
 *
 * No first-party Azure mock library, so we `vi.mock` both
 * `@azure/storage-blob` and `@azure/identity` with a faithful
 * in-memory fake. The fake stores bytes + metadata and records how
 * SAS was signed, so we verify BOTH presigning paths:
 *   - keyless (no accountKey)  → DefaultAzureCredential + user-delegation SAS
 *   - keyed   (accountKey set) → StorageSharedKeyCredential + account-key SAS
 *
 * Live Azure acceptance runs out-of-band against a real account / the
 * Azurite emulator (STORAGE_LIVE=1), not in CI.
 */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const az = vi.hoisted(() => {
  interface Obj {
    bytes: Buffer;
    contentType: string;
    metadata: Record<string, string>;
  }
  return {
    objects: new Map<string, Obj>(),
    delegationKeyRequests: 0,
    defaultCredentialCount: 0,
    sharedKeyCount: 0,
    lastSasCredentialKind: '' as 'shared-key' | 'user-delegation' | '',
  };
});

vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: class {
    constructor() {
      az.defaultCredentialCount++;
    }
  },
}));

vi.mock('@azure/storage-blob', () => {
  class FakeBlockBlobClient {
    constructor(
      readonly accountUrl: string,
      readonly container: string,
      readonly key: string,
    ) {}
    get url(): string {
      return `${this.accountUrl}/${this.container}/${this.key}`;
    }
    async exists(): Promise<boolean> {
      return az.objects.has(this.key);
    }
    async getProperties(): Promise<Record<string, unknown>> {
      const o = az.objects.get(this.key);
      if (!o) throw Object.assign(new Error('BlobNotFound'), { statusCode: 404 });
      return {
        contentLength: o.bytes.byteLength,
        etag: `"etag-${o.bytes.byteLength}"`,
        metadata: o.metadata,
        blobType: 'BlockBlob',
      };
    }
    async upload(
      body: Buffer,
      _len: number,
      opts: { blobHTTPHeaders?: { blobContentType?: string }; metadata?: Record<string, string> },
    ): Promise<void> {
      az.objects.set(this.key, {
        bytes: Buffer.from(body),
        contentType: opts.blobHTTPHeaders?.blobContentType ?? 'application/octet-stream',
        metadata: opts.metadata ?? {},
      });
    }
    async downloadToBuffer(): Promise<Buffer> {
      const o = az.objects.get(this.key);
      if (!o) throw Object.assign(new Error('BlobNotFound'), { statusCode: 404 });
      return o.bytes;
    }
    async download(offset = 0, count?: number): Promise<{ readableStreamBody: Readable }> {
      const o = az.objects.get(this.key);
      if (!o) throw Object.assign(new Error('BlobNotFound'), { statusCode: 404 });
      const end = count === undefined ? o.bytes.byteLength : offset + count;
      return { readableStreamBody: Readable.from([o.bytes.subarray(offset, end)]) };
    }
    async deleteIfExists(): Promise<{ succeeded: boolean }> {
      return { succeeded: az.objects.delete(this.key) };
    }
  }

  class FakeContainerClient {
    constructor(
      readonly accountUrl: string,
      readonly container: string,
    ) {}
    getBlockBlobClient(key: string): FakeBlockBlobClient {
      return new FakeBlockBlobClient(this.accountUrl, this.container, key);
    }
    async *listBlobsFlat({ prefix }: { prefix: string }): AsyncGenerator<{ name: string }> {
      for (const k of [...az.objects.keys()]) {
        if (k.startsWith(prefix)) yield { name: k };
      }
    }
  }

  class FakeBlobServiceClient {
    constructor(
      readonly url: string,
      readonly credential: unknown,
    ) {}
    getContainerClient(container: string): FakeContainerClient {
      return new FakeContainerClient(this.url, container);
    }
    async getUserDelegationKey(_start: Date, _end: Date): Promise<{ value: string }> {
      az.delegationKeyRequests++;
      return { value: 'fake-user-delegation-key' };
    }
  }

  class StorageSharedKeyCredential {
    constructor(
      readonly accountName: string,
      readonly accountKey: string,
    ) {
      az.sharedKeyCount++;
    }
  }

  return {
    BlobServiceClient: FakeBlobServiceClient,
    StorageSharedKeyCredential,
    BlobSASPermissions: { parse: (p: string) => ({ toString: () => p }) },
    SASProtocol: { Https: 'https' },
    generateBlobSASQueryParameters: (
      opts: { blobName: string; permissions: { toString(): string } },
      credential: unknown,
      _accountName?: string,
    ) => {
      az.lastSasCredentialKind =
        credential instanceof StorageSharedKeyCredential ? 'shared-key' : 'user-delegation';
      return {
        toString: () =>
          `sv=2023-11-03&sp=${opts.permissions.toString()}&sig=fake-signature-for-${opts.blobName}`,
      };
    },
  };
});

const { AzureBlobObjectStore } = await import('../src/storage/adapters/AzureBlobObjectStore');
const { runObjectStoreConformance } = await import('./_helpers/object-store-conformance');

// Same contract suite the FS oracle runs — proves the Azure adapter
// doesn't diverge. Uses the keyless variant (managed-identity path).
runObjectStoreConformance('azure-blob', () => {
  az.objects.clear();
  az.delegationKeyRequests = 0;
  return new AzureBlobObjectStore({ container: 'c', accountName: 'acct' });
});

function sha256Hex(b: Uint8Array): string {
  return createHash('sha256').update(b).digest('hex');
}
function bytes(n: number): Uint8Array {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 7) % 256;
  return a;
}

let tmp: string;
beforeEach(async () => {
  az.objects.clear();
  az.delegationKeyRequests = 0;
  az.defaultCredentialCount = 0;
  az.sharedKeyCount = 0;
  az.lastSasCredentialKind = '';
  tmp = await mkdtemp(join(tmpdir(), 'azure-test-'));
});
afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe('AzureBlobObjectStore', () => {
  const keyless = () => new AzureBlobObjectStore({ container: 'c', accountName: 'acct' });
  const keyed = () =>
    new AzureBlobObjectStore({ container: 'c', accountName: 'acct', accountKey: 'KEY==' });

  test('info reports the auth mode (managed-identity vs account-key)', () => {
    expect(keyless().info).toMatchObject({ kind: 'azure-blob', auth: 'managed-identity' });
    expect(keyed().info).toMatchObject({ kind: 'azure-blob', auth: 'account-key' });
  });

  test('put records SHA-256 in metadata (hyphen-free Azure key) and returns it', async () => {
    const store = keyless();
    const b = bytes(512);
    const r = await store.put('t/x/base.pdf', b, { contentLength: b.byteLength });
    expect(r.sha256).toBe(sha256Hex(b));
    expect(az.objects.get('t/x/base.pdf')?.metadata).toEqual({
      xembedpdfsha256: sha256Hex(b),
    });
  });

  test('put rejects content-length mismatch without storing', async () => {
    const store = keyless();
    const b = bytes(64);
    await expect(store.put('k', b, { contentLength: 1 })).rejects.toThrow(/contentLength/);
    expect(az.objects.has('k')).toBe(false);
  });

  test('getSha256 / stat / exists reflect stored object; missing → null', async () => {
    const store = keyless();
    const b = bytes(256);
    await store.put('k', b, { contentLength: b.byteLength });
    expect(await store.getSha256('k')).toBe(sha256Hex(b));
    expect(await store.exists('k')).toBe(true);
    expect((await store.stat('k'))?.size).toBe(256);
    expect(await store.stat('missing')).toBeNull();
    expect(await store.getSha256('missing')).toBeNull();
  });

  test('keyless presignUpload uses a user-delegation SAS + blob-type header', async () => {
    const store = keyless();
    const up = await store.presignUpload('k', 900, {
      contentLength: 10,
      contentType: 'application/pdf',
    });
    expect(up?.method).toBe('PUT');
    expect(up?.headers['x-ms-blob-type']).toBe('BlockBlob');
    expect(up?.url).toContain('sig=fake-signature');
    expect(az.lastSasCredentialKind).toBe('user-delegation');
    expect(az.delegationKeyRequests).toBe(1);
    expect(az.defaultCredentialCount).toBe(1); // no account key → AAD credential
  });

  test('keyed presignUpload uses an account-key SAS (no delegation key, no AAD)', async () => {
    const store = keyed();
    const up = await store.presignUpload('k', 900, {
      contentLength: 10,
      contentType: 'application/pdf',
    });
    expect(up?.url).toContain('sig=fake-signature');
    expect(az.lastSasCredentialKind).toBe('shared-key');
    expect(az.delegationKeyRequests).toBe(0);
    expect(az.defaultCredentialCount).toBe(0);
    expect(az.sharedKeyCount).toBe(1);
  });

  test('user-delegation key is cached across presigns', async () => {
    const store = keyless();
    await store.presignUpload('a', 900, { contentLength: 1, contentType: 'application/pdf' });
    await store.presignDownload('b', 900);
    await store.presignDownload('c', 900);
    expect(az.delegationKeyRequests).toBe(1); // fetched once, reused
  });

  test('delete returns true when present, false when missing', async () => {
    const store = keyless();
    await store.put('k', bytes(8), { contentLength: 8 });
    expect(await store.delete('k')).toBe(true);
    expect(await store.delete('k')).toBe(false);
  });

  test('deletePrefix removes matching blobs and counts them', async () => {
    const store = keyless();
    await store.put('t/a/1', bytes(4), { contentLength: 4 });
    await store.put('t/a/2', bytes(4), { contentLength: 4 });
    await store.put('t/b/1', bytes(4), { contentLength: 4 });
    const r = await store.deletePrefix('t/a/');
    expect(r.deleted).toBe(2);
    expect(az.objects.has('t/b/1')).toBe(true);
  });

  test('materializeLocal fans out ranges, verifies sha, writes atomically', async () => {
    const store = keyless();
    const b = bytes(40_000);
    const sha = sha256Hex(b);
    await store.put('k', b, { contentLength: b.byteLength });
    const dest = join(tmp, 'out.pdf');
    const res = await store.materializeLocal('k', dest, {
      expectedSha: sha,
      concurrency: 4,
      chunkSizeBytes: 8192,
    });
    expect(res.size).toBe(40_000);
    expect(res.sha256).toBe(sha);
    expect(new Uint8Array(await readFile(dest))).toEqual(b);
  });

  test('materializeLocal throws on sha mismatch and leaves no file', async () => {
    const store = keyless();
    const b = bytes(1000);
    await store.put('k', b, { contentLength: b.byteLength });
    const dest = join(tmp, 'out.pdf');
    await expect(
      store.materializeLocal('k', dest, { expectedSha: 'deadbeef', chunkSizeBytes: 256 }),
    ).rejects.toThrow(/sha mismatch/);
    await expect(readFile(dest)).rejects.toThrow();
  });
});
