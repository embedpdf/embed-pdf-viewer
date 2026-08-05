/**
 * S3 object store. Built around the AWS SDK v3; presigned PUTs / GETs
 * are the default upload/download pathway in production.
 *
 * Auth: keyless-first via the SDK's default credential chain (IAM role
 * / IRSA on AWS, or `AWS_ACCESS_KEY_ID`/`SECRET` env for keyed setups)
 * — nothing credential-shaped lives in our config. Works against any
 * S3-compatible endpoint (R2, MinIO, Wasabi, ...) via `endpoint`.
 *
 * Lazy-load: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
 * import on first use via `depsPromise`, never at module load — so
 * they live in `optionalDependencies` and an FS-only install pays
 * nothing for them (matches the GCS/Azure adapters; see ADAPTERS.md).
 *
 * Notes on `getSha256`: S3 doesn't expose an object's SHA-256 (ETag is
 * MD5 for single-part PUTs, a composite hash for MPU). We compute
 * sha256 on `put`, stash it in object metadata, and read it back on
 * `getSha256`/`materializeLocal` to skip a full re-hash; objects PUT
 * out-of-band fall back to a streaming hash.
 */

import { Readable } from 'node:stream';
import type { ObjectIdentifier } from '@aws-sdk/client-s3';
import type {
  MaterializeOpts,
  MaterializeResult,
  ObjectBody,
  ObjectStat,
  ObjectStore,
  PresignedDownload,
  PresignedUpload,
  PresignUploadOpts,
} from '../ObjectStore';
import {
  drainReadable,
  computeSha256Hex,
  materializeViaRanges,
  SHA256_METADATA_KEY,
} from './_internal';

// Type-only — these do NOT trigger the runtime import (see ADAPTERS.md).
type S3Module = typeof import('@aws-sdk/client-s3');
type PresignerModule = typeof import('@aws-sdk/s3-request-presigner');
type S3Client = InstanceType<S3Module['S3Client']>;

interface S3Deps {
  client: S3Client;
  /** Command constructors, captured from the lazily-imported module. */
  cmd: S3Module;
  getSignedUrl: PresignerModule['getSignedUrl'];
}

export interface S3ObjectStoreOptions {
  /** Required: bucket name. */
  bucket: string;
  /** Required: AWS region (e.g. `us-east-1`). */
  region: string;
  /**
   * Pre-constructed client. Tests inject a mocked client here. In
   * production deployments the SDK builds one from the credential
   * chain (IRSA / env).
   */
  client?: S3Client;
  /**
   * For non-AWS S3-compatible endpoints (Cloudflare R2, MinIO,
   * Wasabi, ...). Implies `forcePathStyle: true`.
   */
  endpoint?: string;
}

export class S3ObjectStore implements ObjectStore {
  readonly info: {
    kind: 's3';
    location: string;
    bucket: string;
    region: string;
    endpoint?: string;
  };
  private readonly bucket: string;
  private readonly depsPromise: Promise<S3Deps>;

  constructor(opts: S3ObjectStoreOptions) {
    this.bucket = opts.bucket;
    this.info = {
      kind: 's3',
      location: opts.endpoint ? `${opts.endpoint}/${opts.bucket}` : `s3://${opts.bucket}`,
      bucket: opts.bucket,
      region: opts.region,
      ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
    };
    this.depsPromise = this.createDeps(opts);
  }

  private async createDeps(opts: S3ObjectStoreOptions): Promise<S3Deps> {
    const [cmd, presigner] = await Promise.all([
      import('@aws-sdk/client-s3') as Promise<S3Module>,
      import('@aws-sdk/s3-request-presigner') as Promise<PresignerModule>,
    ]);
    const client =
      opts.client ??
      new cmd.S3Client({
        region: opts.region,
        ...(opts.endpoint ? { endpoint: opts.endpoint, forcePathStyle: true } : {}),
      });
    return { client, cmd, getSignedUrl: presigner.getSignedUrl };
  }

  async exists(key: string): Promise<boolean> {
    return (await this.stat(key)) !== null;
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const { client, cmd } = await this.depsPromise;
    try {
      const r = await client.send(new cmd.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      if (typeof r.ContentLength !== 'number') return null;
      return {
        size: r.ContentLength,
        etag: (r.ETag ?? '').replace(/"/g, ''),
      };
    } catch (err) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
  }

  async put(
    key: string,
    body: ObjectBody,
    opts: { contentLength: number; contentType?: string },
  ): Promise<{ sha256: string }> {
    const bytes = body instanceof Uint8Array ? body : await drainReadable(body as Readable);
    if (bytes.byteLength !== opts.contentLength) {
      throw new Error(
        `S3ObjectStore.put: declared contentLength=${opts.contentLength} but got ${bytes.byteLength}`,
      );
    }
    const sha256 = computeSha256Hex(bytes);
    const { client, cmd } = await this.depsPromise;
    await client.send(
      new cmd.PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentLength: opts.contentLength,
        ContentType: opts.contentType ?? 'application/pdf',
        Metadata: { [SHA256_METADATA_KEY]: sha256 },
      }),
    );
    return { sha256 };
  }

  async get(key: string): Promise<Uint8Array | null> {
    const { client, cmd } = await this.depsPromise;
    try {
      const r = await client.send(new cmd.GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!r.Body) return null;
      return await drainReadable(r.Body as Readable);
    } catch (err) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
  }

  async getSha256(key: string): Promise<string | null> {
    const { client, cmd } = await this.depsPromise;
    try {
      const r = await client.send(new cmd.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      const meta = r.Metadata ?? {};
      // S3 lowercases user-metadata keys on read.
      const fromMeta = meta[SHA256_METADATA_KEY];
      if (fromMeta) return fromMeta;
      // Fall back to streaming the body. Only used when an object was
      // PUT outside our SDK (presigned PUT by a misbehaving client).
      const bytes = await this.get(key);
      if (!bytes) return null;
      return computeSha256Hex(bytes);
    } catch (err) {
      if (isS3NotFound(err)) return null;
      throw err;
    }
  }

  async presignUpload(
    key: string,
    ttlSec: number,
    opts: PresignUploadOpts,
  ): Promise<PresignedUpload | null> {
    const { client, cmd, getSignedUrl } = await this.depsPromise;
    const command = new cmd.PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentLength: opts.contentLength,
      ContentType: opts.contentType,
      ...(opts.contentMd5Base64 ? { ContentMD5: opts.contentMd5Base64 } : {}),
    });
    const url = await getSignedUrl(client, command, { expiresIn: ttlSec });
    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': opts.contentType,
        'Content-Length': String(opts.contentLength),
        ...(opts.contentMd5Base64 ? { 'Content-MD5': opts.contentMd5Base64 } : {}),
      },
      expiresAt: Date.now() + ttlSec * 1000,
    };
  }

  async presignDownload(key: string, ttlSec: number): Promise<PresignedDownload | null> {
    const { client, cmd, getSignedUrl } = await this.depsPromise;
    const url = await getSignedUrl(
      client,
      new cmd.GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: ttlSec },
    );
    return { url, expiresAt: Date.now() + ttlSec * 1000 };
  }

  async delete(key: string): Promise<boolean> {
    const { client, cmd } = await this.depsPromise;
    try {
      await client.send(new cmd.DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (err) {
      if (isS3NotFound(err)) return false;
      throw err;
    }
  }

  async materializeLocal(
    key: string,
    destPath: string,
    opts: MaterializeOpts,
  ): Promise<MaterializeResult> {
    const { client, cmd } = await this.depsPromise;
    // HEAD to learn total size + the SHA we stored on PUT (so we can
    // skip a full re-hash). Without the size up front we'd issue blind
    // ranges past EOF or fall back to a slow single stream.
    const head = await client.send(new cmd.HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    const size = head.ContentLength;
    if (typeof size !== 'number') {
      throw new Error(`S3ObjectStore.materializeLocal: HEAD did not return ContentLength`);
    }
    const knownSha256 = head.Metadata?.[SHA256_METADATA_KEY] ?? null;

    return materializeViaRanges(
      destPath,
      {
        size,
        knownSha256,
        fetchRange: async (start, end) => {
          const got = await client.send(
            new cmd.GetObjectCommand({
              Bucket: this.bucket,
              Key: key,
              Range: `bytes=${start}-${end}`,
            }),
          );
          if (!got.Body) throw new Error(`S3 GET ${key} bytes=${start}- returned no body`);
          return got.Body as Readable;
        },
      },
      opts,
      'S3ObjectStore',
    );
  }

  async deletePrefix(prefix: string): Promise<{ deleted: number }> {
    const { client, cmd } = await this.depsPromise;
    let deleted = 0;
    let continuationToken: string | undefined;
    do {
      const list = await client.send(
        new cmd.ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const objects: ObjectIdentifier[] =
        list.Contents?.map((o) => ({ Key: o.Key! })).filter((o) => o.Key) ?? [];
      if (objects.length > 0) {
        // DeleteObjects accepts up to 1000 keys per call; S3
        // ListObjectsV2 also returns at most 1000, so a single batch
        // per page works.
        await client.send(
          new cmd.DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
        deleted += objects.length;
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
    return { deleted };
  }
}

function isS3NotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  if (!e) return false;
  if (e.name === 'NotFound' || e.name === 'NoSuchKey') return true;
  if (e.$metadata?.httpStatusCode === 404) return true;
  return false;
}
