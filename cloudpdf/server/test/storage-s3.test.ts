import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sdkStreamMixin } from '@smithy/util-stream';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { S3ObjectStore } from '../src/storage/adapters/S3ObjectStore';
import { ShaMismatchError } from '../src/storage/ObjectStore';
import { StorageKeys } from '../src/storage/keys';

const s3Mock = mockClient(S3Client);

beforeEach(() => {
  s3Mock.reset();
});
afterEach(() => {
  s3Mock.reset();
});

describe('S3ObjectStore', () => {
  test('put records SHA-256 in object metadata for verify-on-commit', async () => {
    const store = new S3ObjectStore({
      bucket: 'b',
      region: 'us-east-1',
      client: new S3Client({ region: 'us-east-1' }),
    });
    const bytes = randomBytes(512);
    const sha = sha256Hex(bytes);
    s3Mock.on(PutObjectCommand).resolves({});

    const r = await store.put('tenant/docs/ab/abx/base.pdf', bytes, {
      contentLength: bytes.byteLength,
    });
    expect(r.sha256).toBe(sha);
    const calls = s3Mock.commandCalls(PutObjectCommand);
    expect(calls).toHaveLength(1);
    const input = calls[0]!.args[0].input;
    expect(input.Bucket).toBe('b');
    expect(input.Key).toBe('tenant/docs/ab/abx/base.pdf');
    expect(input.ContentLength).toBe(bytes.byteLength);
    expect(input.ContentType).toBe('application/pdf');
    expect(input.Metadata).toEqual({ 'x-embedpdf-sha256': sha });
  });

  test('put rejects content-length mismatch without making an S3 call', async () => {
    const store = newStore();
    const bytes = randomBytes(64);
    s3Mock.on(PutObjectCommand).resolves({});
    await expect(store.put('k', bytes, { contentLength: bytes.byteLength - 1 })).rejects.toThrow(
      /contentLength/,
    );
    expect(s3Mock.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  test('getSha256 prefers the x-embedpdf-sha256 metadata header (no body read)', async () => {
    const store = newStore();
    const sha = 'a'.repeat(64);
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 1024,
      ETag: '"abc"',
      Metadata: { 'x-embedpdf-sha256': sha },
    });
    expect(await store.getSha256('k')).toBe(sha);
    expect(s3Mock.commandCalls(GetObjectCommand)).toHaveLength(0);
  });

  test('getSha256 falls back to body read when metadata is missing', async () => {
    const store = newStore();
    const bytes = randomBytes(256);
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: bytes.byteLength,
      ETag: '"abc"',
      Metadata: {},
    });
    s3Mock.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from([Buffer.from(bytes)])),
    });
    expect(await store.getSha256('k')).toBe(sha256Hex(bytes));
  });

  test('stat reads size + etag and returns null on 404', async () => {
    const store = newStore();
    s3Mock.on(HeadObjectCommand).resolves({ ContentLength: 8, ETag: '"xyz"' });
    expect(await store.stat('k')).toEqual({ size: 8, etag: 'xyz' });
    s3Mock.reset();
    s3Mock.on(HeadObjectCommand).rejects(makeNotFound());
    expect(await store.stat('missing')).toBeNull();
  });

  test('get streams the body into a Uint8Array; missing key -> null', async () => {
    const store = newStore();
    const bytes = randomBytes(128);
    s3Mock.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from([Buffer.from(bytes)])),
    });
    const got = await store.get('k');
    expect(got?.byteLength).toBe(bytes.byteLength);
    expect(sha256Hex(got!)).toBe(sha256Hex(bytes));

    s3Mock.reset();
    s3Mock.on(GetObjectCommand).rejects(makeNotFound());
    expect(await store.get('missing')).toBeNull();
  });

  test('presignUpload returns a signed URL and the required PUT headers', async () => {
    const store = newStore();
    const presigned = await store.presignUpload('tenant/docs/ab/abx/base.pdf', 60, {
      contentLength: 100,
      contentType: 'application/pdf',
    });
    expect(presigned).not.toBeNull();
    expect(presigned!.method).toBe('PUT');
    // S3 SDK v3 issues path-style or virtual-host URLs; either is fine
    // as long as the bucket + key + signing query params are present.
    expect(presigned!.url).toMatch(/amazonaws\.com\/.+tenant\/docs\/ab\/abx\/base\.pdf\?/);
    expect(presigned!.url).toContain('X-Amz-Signature');
    expect(presigned!.headers).toMatchObject({
      'Content-Type': 'application/pdf',
      'Content-Length': '100',
    });
    expect(presigned!.expiresAt).toBeGreaterThan(Date.now());
  });

  test('deletePrefix pages through ListObjectsV2 and DeleteObjects', async () => {
    const store = newStore();
    s3Mock.on(ListObjectsV2Command).resolvesOnce({
      Contents: [{ Key: 'p/a' }, { Key: 'p/b' }],
      IsTruncated: true,
      NextContinuationToken: 'tok-1',
    });
    s3Mock.on(ListObjectsV2Command, { ContinuationToken: 'tok-1' }).resolves({
      Contents: [{ Key: 'p/c' }],
      IsTruncated: false,
    });
    s3Mock.on(DeleteObjectsCommand).resolves({});
    const { deleted } = await store.deletePrefix('p/');
    expect(deleted).toBe(3);
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(2);
  });

  test('delete is idempotent against 404', async () => {
    const store = newStore();
    s3Mock.on(DeleteObjectCommand).resolves({});
    expect(await store.delete('k')).toBe(true);
    s3Mock.reset();
    s3Mock.on(DeleteObjectCommand).rejects(makeNotFound());
    expect(await store.delete('k')).toBe(false);
  });

  test('materializeLocal fans out parallel range GETs and writes pwrite-style', async () => {
    const store = newStore();
    const total = 5 * 1024;
    const bytes = randomBytes(total);
    const chunk = 1024;
    const sha = sha256Hex(bytes);

    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: total,
      ETag: '"abc"',
      Metadata: { 'x-embedpdf-sha256': sha },
    });
    // Each Range GET hands back its slice. The mock dispatches by
    // Range header so it doesn't matter which order the chunks fire.
    s3Mock.on(GetObjectCommand).callsFake((input: { Range?: string }) => {
      const m = /^bytes=(\d+)-(\d+)$/.exec(input.Range ?? '');
      if (!m) throw new Error(`unexpected range: ${input.Range}`);
      const start = parseInt(m[1]!, 10);
      const end = parseInt(m[2]!, 10);
      const slice = bytes.slice(start, end + 1);
      return { Body: sdkStreamMixin(Readable.from([Buffer.from(slice)])) };
    });

    const dir = await mkdtemp(join(tmpdir(), 's3-mat-'));
    try {
      const dest = join(dir, 'out.pdf');
      const r = await store.materializeLocal('k', dest, {
        expectedSha: sha,
        chunkSizeBytes: chunk,
        concurrency: 4,
      });
      expect(r.size).toBe(total);
      expect(r.sha256).toBe(sha);
      const got = await readFile(dest);
      expect(got).toEqual(Buffer.from(bytes));

      const getCalls = s3Mock.commandCalls(GetObjectCommand).length;
      expect(getCalls).toBe(Math.ceil(total / chunk));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('materializeLocal aborts cleanly when sha does not match', async () => {
    const store = newStore();
    const total = 2048;
    const bytes = randomBytes(total);

    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: total,
      ETag: '"x"',
      Metadata: { 'x-embedpdf-sha256': 'b'.repeat(64) }, // wrong sha
    });
    s3Mock.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from([Buffer.from(bytes)])),
    });

    const dir = await mkdtemp(join(tmpdir(), 's3-mat-'));
    try {
      const dest = join(dir, 'bad.pdf');
      await expect(
        store.materializeLocal('k', dest, { expectedSha: sha256Hex(bytes) }),
      ).rejects.toThrow(/sha mismatch/);
      await expect(stat(dest)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('materializeLocal hashes the download when no SHA metadata exists (presigned uploads)', async () => {
    const store = newStore();
    const total = 5 * 1024;
    const bytes = randomBytes(total);
    const chunk = 1024;
    const sha = sha256Hex(bytes);

    // A presigned browser PUT cannot carry signed x-amz-meta-* headers,
    // so HEAD reports no metadata and the fallback must hash the
    // finished partial. Regression: this branch used to re-read the
    // write-only descriptor and die with EBADF on every such upload.
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: total,
      ETag: '"abc"',
      Metadata: {},
    });
    s3Mock.on(GetObjectCommand).callsFake((input: { Range?: string }) => {
      const m = /^bytes=(\d+)-(\d+)$/.exec(input.Range ?? '');
      if (!m) throw new Error(`unexpected range: ${input.Range}`);
      const start = parseInt(m[1]!, 10);
      const end = parseInt(m[2]!, 10);
      const slice = bytes.slice(start, end + 1);
      return { Body: sdkStreamMixin(Readable.from([Buffer.from(slice)])) };
    });

    const dir = await mkdtemp(join(tmpdir(), 's3-mat-'));
    try {
      const dest = join(dir, 'out.pdf');
      const r = await store.materializeLocal('k', dest, {
        expectedSha: sha,
        chunkSizeBytes: chunk,
        concurrency: 4,
      });
      expect(r.size).toBe(total);
      expect(r.sha256).toBe(sha);
      expect(await readFile(dest)).toEqual(Buffer.from(bytes));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('materializeLocal without metadata rejects bytes that hash differently', async () => {
    const store = newStore();
    const total = 2048;
    const bytes = randomBytes(total);

    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: total,
      ETag: '"x"',
      Metadata: {},
    });
    s3Mock.on(GetObjectCommand).resolves({
      Body: sdkStreamMixin(Readable.from([Buffer.from(bytes)])),
    });

    const dir = await mkdtemp(join(tmpdir(), 's3-mat-'));
    try {
      const dest = join(dir, 'bad.pdf');
      const err = await store
        .materializeLocal('k', dest, { expectedSha: 'a'.repeat(64) })
        .then(
          () => null,
          (e: unknown) => e,
        );
      expect(err).toBeInstanceOf(ShaMismatchError);
      expect((err as ShaMismatchError).actual).toBe(sha256Hex(bytes));
      // Neither the destination nor any .partial.* may survive.
      await expect(stat(dest)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(dir)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('keys derived from StorageKeys make round-trip plausible', async () => {
    const store = newStore();
    const key = StorageKeys.basePdf('tnt', 'abxxxxx');
    // Shard = first 2 hex chars of sha256(docId) — id-format-blind fan-out.
    expect(key).toMatch(/^tnt\/docs\/[0-9a-f]{2}\/abxxxxx\/base\.pdf$/);
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 0,
      ETag: '""',
      Metadata: { 'x-embedpdf-sha256': 'f'.repeat(64) },
    });
    expect(await store.getSha256(key)).toBe('f'.repeat(64));
  });

  test('streamed put pipes the body through one PutObject and attaches sha via self-copy', async () => {
    const store = newStore();
    const bytes = randomBytes(50_000);
    const sha = sha256Hex(bytes);
    let received: Buffer | null = null;
    s3Mock.on(PutObjectCommand).callsFake(async (input: { Body?: unknown }) => {
      const drained: Buffer[] = [];
      for await (const c of input.Body as Readable) drained.push(Buffer.from(c as Uint8Array));
      received = Buffer.concat(drained);
      return {};
    });
    s3Mock.on(CopyObjectCommand).resolves({});

    const r = await store.put('tenant/docs/ab/abx/base.pdf', chunked(bytes, 4_096), {
      contentLength: bytes.byteLength,
    });
    expect(r.sha256).toBe(sha);
    expect(received).toEqual(Buffer.from(bytes));

    const put = s3Mock.commandCalls(PutObjectCommand)[0]!.args[0].input;
    expect(put.ContentLength).toBe(bytes.byteLength);
    // The digest doesn't exist pre-stream; metadata rides the copy.
    expect(put.Metadata).toBeUndefined();

    const copy = s3Mock.commandCalls(CopyObjectCommand)[0]!.args[0].input;
    expect(copy.Bucket).toBe('b');
    expect(copy.Key).toBe('tenant/docs/ab/abx/base.pdf');
    expect(copy.CopySource).toBe('b/tenant/docs/ab/abx/base.pdf');
    expect(copy.MetadataDirective).toBe('REPLACE');
    expect(copy.Metadata).toEqual({ 'x-embedpdf-sha256': sha });
    expect(copy.ContentType).toBe('application/pdf');
  });

  test('streamed put surfaces the exact length error on under-delivery and skips the copy', async () => {
    const store = newStore();
    s3Mock.on(PutObjectCommand).callsFake(async (input: { Body?: unknown }) => {
      const drained: Buffer[] = [];
      for await (const c of input.Body as Readable) drained.push(Buffer.from(c as Uint8Array));
      return {};
    });
    s3Mock.on(CopyObjectCommand).resolves({});
    await expect(
      store.put('k', chunked(randomBytes(400), 100), { contentLength: 500 }),
    ).rejects.toThrow(/contentLength=500 but got 400/);
    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(0);
  });

  test('streamed put aborts on over-delivery before the extra bytes flow', async () => {
    const store = newStore();
    s3Mock.on(PutObjectCommand).callsFake(async (input: { Body?: unknown }) => {
      const drained: Buffer[] = [];
      for await (const c of input.Body as Readable) drained.push(Buffer.from(c as Uint8Array));
      return {};
    });
    s3Mock.on(CopyObjectCommand).resolves({});
    await expect(
      store.put('k', chunked(randomBytes(400), 100), { contentLength: 300 }),
    ).rejects.toThrow(/received more/);
    expect(s3Mock.commandCalls(CopyObjectCommand)).toHaveLength(0);
  });

  test('streamed put fails when the metadata self-copy fails', async () => {
    const store = newStore();
    s3Mock.on(PutObjectCommand).callsFake(async (input: { Body?: unknown }) => {
      const drained: Buffer[] = [];
      for await (const c of input.Body as Readable) drained.push(Buffer.from(c as Uint8Array));
      return {};
    });
    s3Mock.on(CopyObjectCommand).rejects(new Error('copy denied'));
    await expect(
      store.put('k', chunked(randomBytes(200), 64), { contentLength: 200 }),
    ).rejects.toThrow(/copy denied/);
  });
});

function chunked(bytes: Uint8Array, size: number): Readable {
  const chunks: Buffer[] = [];
  for (let i = 0; i < bytes.byteLength; i += size) {
    chunks.push(Buffer.from(bytes.subarray(i, Math.min(i + size, bytes.byteLength))));
  }
  return Readable.from(chunks);
}

function newStore(): S3ObjectStore {
  return new S3ObjectStore({
    bucket: 'b',
    region: 'us-east-1',
    client: new S3Client({
      region: 'us-east-1',
      credentials: { accessKeyId: 'AKIA-TEST', secretAccessKey: 'SECRET' },
    }),
  });
}

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  for (let i = 0; i < n; i++) arr[i] = (i * 41 + 13) & 0xff;
  return arr;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function makeNotFound(): Error & { name: string; $metadata: { httpStatusCode: number } } {
  const err = new Error('not found') as Error & {
    name: string;
    $metadata: { httpStatusCode: number };
  };
  err.name = 'NotFound';
  err.$metadata = { httpStatusCode: 404 };
  return err;
}
