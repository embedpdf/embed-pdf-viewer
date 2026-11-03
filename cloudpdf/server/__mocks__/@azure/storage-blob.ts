/**
 * In-memory stand-in for `@azure/storage-blob`, served to every test file
 * that calls `vi.mock('@azure/storage-blob')` without a factory (see
 * "Faking an SDK in tests" in `docs/conventions/server-adapters.md`).
 *
 * The fake keeps bytes, metadata and an optional version id per blob, and
 * records how each SAS was signed, so both presigning paths (user
 * delegation and account key) and version pinning run end to end. Tests
 * read and reset {@link blobs} directly.
 */
import { Readable } from 'node:stream';

interface FakeBlob {
  bytes: Buffer;
  contentType?: string;
  metadata: Record<string, string>;
  versionId?: string;
}

export const blobs = {
  /** Every container's blobs, by name. */
  objects: new Map<string, FakeBlob>(),
  /** A name here fails every read with this error. */
  failures: new Map<string, Error>(),
  delegationKeyRequests: 0,
  sharedKeyCount: 0,
  lastSasCredentialKind: '' as 'shared-key' | 'user-delegation' | '',
};

export function blobError(message: string, statusCode: number, code?: string): Error {
  return Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });
}

export class FakeBlobClient {
  constructor(
    readonly accountUrl: string,
    readonly container: string,
    readonly key: string,
    readonly versionId?: string,
  ) {}
  get url(): string {
    return `${this.accountUrl}/${this.container}/${this.key}`;
  }
  withVersion(versionId: string): FakeBlobClient {
    return new FakeBlobClient(this.accountUrl, this.container, this.key, versionId);
  }
  /** The blob this client reads; throws as Azure would when there is none. */
  protected stored(): FakeBlob {
    const failure = blobs.failures.get(this.key);
    if (failure) throw failure;
    const o = blobs.objects.get(this.key);
    if (!o || (this.versionId !== undefined && this.versionId !== o.versionId)) {
      throw blobError('BlobNotFound', 404, 'BlobNotFound');
    }
    return o;
  }
  async exists(): Promise<boolean> {
    return blobs.objects.has(this.key);
  }
  async getProperties(): Promise<Record<string, unknown>> {
    const o = this.stored();
    return {
      contentLength: o.bytes.byteLength,
      etag: `"etag-${o.bytes.byteLength}"`,
      metadata: o.metadata,
      blobType: 'BlockBlob',
    };
  }
  async setMetadata(metadata: Record<string, string>): Promise<void> {
    this.stored().metadata = { ...metadata };
  }
  async downloadToBuffer(): Promise<Buffer> {
    return this.stored().bytes;
  }
  async download(
    offset = 0,
    count?: number,
    opts?: { abortSignal?: AbortSignal },
  ): Promise<Record<string, unknown>> {
    if (opts?.abortSignal?.aborted) throw blobError('aborted', 0, 'AbortError');
    const o = this.stored();
    const end = count === undefined ? o.bytes.byteLength : offset + count;
    const range = o.bytes.subarray(offset, end);
    return {
      contentLength: range.byteLength,
      readableStreamBody: Readable.from([range]),
      ...(o.contentType ? { contentType: o.contentType } : {}),
      ...(o.versionId ? { versionId: o.versionId } : {}),
    };
  }
  async deleteIfExists(): Promise<{ succeeded: boolean }> {
    return { succeeded: blobs.objects.delete(this.key) };
  }
}

export class FakeBlockBlobClient extends FakeBlobClient {
  async upload(
    body: Buffer,
    _len: number,
    opts: { blobHTTPHeaders?: { blobContentType?: string }; metadata?: Record<string, string> },
  ): Promise<void> {
    blobs.objects.set(this.key, {
      bytes: Buffer.from(body),
      contentType: opts.blobHTTPHeaders?.blobContentType ?? 'application/octet-stream',
      metadata: opts.metadata ?? {},
    });
  }
  async uploadStream(
    stream: Readable,
    _bufferSize?: number,
    _maxConcurrency?: number,
    opts?: { blobHTTPHeaders?: { blobContentType?: string } },
  ): Promise<void> {
    // Drain-then-commit mirrors real Azure block staging: a stream
    // error rejects before commitBlockList, no visible blob.
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c as Uint8Array));
    blobs.objects.set(this.key, {
      bytes: Buffer.concat(chunks),
      contentType: opts?.blobHTTPHeaders?.blobContentType ?? 'application/octet-stream',
      metadata: {},
    });
  }
}

export class FakeContainerClient {
  constructor(
    readonly accountUrl: string,
    readonly container: string,
  ) {}
  getBlobClient(key: string): FakeBlobClient {
    return new FakeBlobClient(this.accountUrl, this.container, key);
  }
  getBlockBlobClient(key: string): FakeBlockBlobClient {
    return new FakeBlockBlobClient(this.accountUrl, this.container, key);
  }
  async *listBlobsFlat({ prefix }: { prefix: string }): AsyncGenerator<{ name: string }> {
    for (const k of [...blobs.objects.keys()]) {
      if (k.startsWith(prefix)) yield { name: k };
    }
  }
}

export class BlobServiceClient {
  constructor(
    readonly url: string,
    readonly credential: unknown,
  ) {}
  getContainerClient(container: string): FakeContainerClient {
    return new FakeContainerClient(this.url, container);
  }
  async getUserDelegationKey(_start: Date, _end: Date): Promise<{ value: string }> {
    blobs.delegationKeyRequests++;
    return { value: 'fake-user-delegation-key' };
  }
}

export class StorageSharedKeyCredential {
  constructor(
    readonly accountName: string,
    readonly accountKey: string,
  ) {
    blobs.sharedKeyCount++;
  }
}

export const BlobSASPermissions = { parse: (p: string) => ({ toString: () => p }) };
export const SASProtocol = { Https: 'https' };

export function generateBlobSASQueryParameters(
  opts: { blobName: string; permissions: { toString(): string } },
  credential: unknown,
  _accountName?: string,
): { toString(): string } {
  blobs.lastSasCredentialKind =
    credential instanceof StorageSharedKeyCredential ? 'shared-key' : 'user-delegation';
  return {
    toString: () =>
      `sv=2023-11-03&sp=${opts.permissions.toString()}&sig=fake-signature-for-${opts.blobName}`,
  };
}
