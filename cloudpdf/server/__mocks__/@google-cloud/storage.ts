/**
 * In-memory stand-in for `@google-cloud/storage`. A test file that calls
 * `vi.mock('@google-cloud/storage')` without a factory gets this module
 * wherever the SDK is imported, including the adapters' lazy
 * `await import('@google-cloud/storage')`.
 *
 * It's a file rather than a `vi.mock` factory so that it always applies.
 * vitest 2 skips a factory mock for an import that overlaps another
 * import of the same module from the same file, and every adapter
 * instance starts its own import. A store built while an earlier store's
 * import was still in flight got the real client, which called
 * storage.googleapis.com for the test bucket. A `__mocks__` file is
 * served by path, with no such window.
 *
 * The fake keeps bytes and custom metadata, so an adapter's real logic
 * (sha-in-metadata, content-length guard, ranged reads, prefix delete)
 * runs end to end. Tests read and reset {@link gcs} directly.
 */
import { Readable, Writable } from 'node:stream';

interface FakeObject {
  bytes: Buffer;
  contentType: string;
  metadata: Record<string, string>;
}

/** Every bucket's objects, by key, and the signed-URL requests made. */
export const gcs = {
  objects: new Map<string, FakeObject>(),
  signedUrlCalls: [] as unknown[],
};

function notFound(): Error & { code: number } {
  const err = new Error('Not Found') as Error & { code: number };
  err.code = 404;
  return err;
}

export class FakeFile {
  constructor(
    readonly bucketName: string,
    readonly key: string,
  ) {}
  async exists(): Promise<[boolean]> {
    return [gcs.objects.has(this.key)];
  }
  async getMetadata(): Promise<[Record<string, unknown>]> {
    const o = gcs.objects.get(this.key);
    if (!o) throw notFound();
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
    if (!o) throw notFound();
    return [o.bytes];
  }
  createReadStream(opts?: { start?: number; end?: number }): Readable {
    const o = gcs.objects.get(this.key);
    if (!o) {
      const r = new Readable({ read() {} });
      process.nextTick(() => r.destroy(notFound()));
      return r;
    }
    const start = opts?.start ?? 0;
    // GCS createReadStream end is inclusive.
    const end = opts?.end === undefined ? o.bytes.byteLength - 1 : opts.end;
    return Readable.from([o.bytes.subarray(start, end + 1)]);
  }
  createWriteStream(opts?: {
    resumable?: boolean;
    contentType?: string;
    metadata?: { metadata?: Record<string, string> };
  }): Writable {
    // Commit-on-finish mirrors real GCS: a destroyed stream (source
    // error, length violation) must leave no visible object.
    const chunks: Buffer[] = [];
    const key = this.key;
    return new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk as Uint8Array));
        cb();
      },
      final(cb) {
        gcs.objects.set(key, {
          bytes: Buffer.concat(chunks),
          contentType: opts?.contentType ?? 'application/octet-stream',
          metadata: opts?.metadata?.metadata ?? {},
        });
        cb();
      },
    });
  }
  async setMetadata(meta: { metadata?: Record<string, string> }): Promise<void> {
    const o = gcs.objects.get(this.key);
    if (!o) throw notFound();
    o.metadata = { ...o.metadata, ...(meta.metadata ?? {}) };
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
      throw notFound();
    }
    gcs.objects.delete(this.key);
  }
}

export class FakeBucket {
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

export class Storage {
  bucket(name: string): FakeBucket {
    return new FakeBucket(name);
  }
}
