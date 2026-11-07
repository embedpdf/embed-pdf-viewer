/**
 * In-memory stand-in for `@google-cloud/storage`, served to every test file
 * that calls `vi.mock('@google-cloud/storage')` without a factory (see
 * "Faking an SDK in tests" in `docs/conventions/server-adapters.md`).
 *
 * The fake keeps bytes, custom metadata and a generation per object, so the
 * adapters' real logic (sha-in-metadata, content-length guard, ranged reads,
 * prefix delete, generation pinning) runs end to end. Tests read and reset
 * {@link gcs} directly.
 */
import { Readable, Writable } from 'node:stream';

interface FakeObject {
  bytes: Buffer;
  contentType?: string;
  metadata: Record<string, string>;
  generation: number;
}

export const gcs = {
  /** Every bucket's objects, by key. */
  objects: new Map<string, FakeObject>(),
  signedUrlCalls: [] as unknown[],
  /** A key here fails every read with this GCS error code. */
  failures: new Map<string, number>(),
  /** The last generation handed out; each write takes the next one. */
  generation: 0,
};

export function gcsError(code: number): Error & { code: number } {
  return Object.assign(new Error(code === 404 ? 'Not Found' : `GCS error ${code}`), { code });
}

export class FakeFile {
  constructor(
    readonly bucketName: string,
    readonly key: string,
    readonly generation?: number,
  ) {}
  /** The object this handle reads; throws as GCS would when there is none. */
  private stored(): FakeObject {
    const failure = gcs.failures.get(this.key);
    if (failure !== undefined) throw gcsError(failure);
    const o = gcs.objects.get(this.key);
    if (!o || (this.generation !== undefined && this.generation !== o.generation)) {
      throw gcsError(404);
    }
    return o;
  }
  private write(bytes: Buffer, contentType?: string, metadata?: Record<string, string>): void {
    gcs.objects.set(this.key, {
      bytes,
      contentType: contentType ?? 'application/octet-stream',
      metadata: metadata ?? {},
      generation: ++gcs.generation,
    });
  }
  async exists(): Promise<[boolean]> {
    try {
      this.stored();
      return [true];
    } catch (err) {
      if ((err as { code?: number }).code === 404) return [false];
      throw err;
    }
  }
  async getMetadata(): Promise<[Record<string, unknown>]> {
    const o = this.stored();
    return [
      {
        size: String(o.bytes.byteLength),
        etag: `etag-${o.bytes.byteLength}`,
        generation: String(o.generation),
        ...(o.contentType ? { contentType: o.contentType } : {}),
        metadata: o.metadata,
      },
    ];
  }
  async save(
    buf: Buffer,
    opts: { contentType?: string; metadata?: { metadata?: Record<string, string> } },
  ): Promise<void> {
    this.write(Buffer.from(buf), opts.contentType, opts.metadata?.metadata);
  }
  async download(): Promise<[Buffer]> {
    return [this.stored().bytes];
  }
  createReadStream(opts?: { start?: number; end?: number }): Readable {
    let o: FakeObject;
    try {
      o = this.stored();
    } catch (err) {
      const r = new Readable({ read() {} });
      process.nextTick(() => r.destroy(err as Error));
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
    return new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk as Uint8Array));
        cb();
      },
      final: (cb) => {
        this.write(Buffer.concat(chunks), opts?.contentType, opts?.metadata?.metadata);
        cb();
      },
    });
  }
  async setMetadata(meta: { metadata?: Record<string, string> }): Promise<void> {
    const o = this.stored();
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
      throw gcsError(404);
    }
    gcs.objects.delete(this.key);
  }
}

export class FakeBucket {
  constructor(readonly name: string) {}
  file(key: string, opts?: { generation?: number }): FakeFile {
    return new FakeFile(this.name, key, opts?.generation);
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
