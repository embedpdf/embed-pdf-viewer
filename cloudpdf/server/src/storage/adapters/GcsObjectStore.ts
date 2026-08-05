/**
 * Google Cloud Storage object store.
 *
 * Auth: keyless-first. The `@google-cloud/storage` client uses
 * Application Default Credentials (ADC) — on GKE/Cloud Run/GCE it
 * reads short-lived tokens from the metadata server (Workload
 * Identity), so no service-account JSON key lives in our config. ADC
 * also transparently honours `GOOGLE_APPLICATION_CREDENTIALS` (a key
 * file) for environments that prefer keyed auth or run outside GCP —
 * we don't branch; the SDK's credential chain picks whichever is
 * present.
 *
 * Presigned URLs: `getSignedUrl({ version: 'v4' })` signs locally when
 * ADC found a private key (key-file path), and falls back to the IAM
 * `signBlob` API when only metadata-server creds are available
 * (keyless path). The SDK auto-detects; we just request v4 signing.
 * Keyless presigning needs the runtime identity to hold
 * `iam.serviceAccounts.signBlob` (roles/iam.serviceAccountTokenCreator).
 *
 * SHA-256: GCS exposes crc32c/md5 but not sha256, so — exactly like
 * the S3 adapter — we compute sha256 on `put` and stash it in custom
 * object metadata under {@link SHA256_METADATA_KEY}, reading it back
 * on `getSha256` / `materializeLocal` to skip a re-hash. Objects PUT
 * out-of-band (presigned PUT by a client that didn't set metadata)
 * fall back to a streaming hash.
 *
 * Lazy-load: the SDK import happens on first use via `clientPromise`,
 * never at module load, so installs that don't use GCS don't pay for
 * `@google-cloud/storage` (declared in optionalDependencies).
 */

import { Readable } from 'node:stream';
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
  computeSha256Hex,
  drainReadable,
  materializeViaRanges,
  SHA256_METADATA_KEY,
  streamingSha256,
} from './_internal';

// Type-only — does NOT trigger the runtime import (see ADAPTERS.md).
type StorageModule = typeof import('@google-cloud/storage');
type Bucket = ReturnType<InstanceType<StorageModule['Storage']>['bucket']>;

export interface GcsObjectStoreOptions {
  /** Required: bucket name. */
  bucket: string;
  /** Optional: GCP project id. ADC usually infers it; explicit wins. */
  projectId?: string;
}

export class GcsObjectStore implements ObjectStore {
  readonly info: { kind: 'gcs'; location: string; bucket: string; projectId?: string };
  private readonly bucketName: string;
  private readonly bucketPromise: Promise<Bucket>;

  constructor(opts: GcsObjectStoreOptions) {
    if (!opts.bucket) throw new Error('GcsObjectStore requires bucket');
    this.bucketName = opts.bucket;
    this.info = {
      kind: 'gcs',
      location: `gs://${opts.bucket}`,
      bucket: opts.bucket,
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
    };
    this.bucketPromise = this.createBucket(opts);
  }

  private async createBucket(opts: GcsObjectStoreOptions): Promise<Bucket> {
    const mod = (await import('@google-cloud/storage')) as StorageModule;
    const storage = new mod.Storage(opts.projectId ? { projectId: opts.projectId } : {});
    return storage.bucket(opts.bucket);
  }

  async exists(key: string): Promise<boolean> {
    const bucket = await this.bucketPromise;
    const [exists] = await bucket.file(key).exists();
    return exists;
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const bucket = await this.bucketPromise;
    try {
      const [meta] = await bucket.file(key).getMetadata();
      const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size ?? 0);
      return { size, etag: meta.etag ?? '' };
    } catch (err) {
      if (isGcsNotFound(err)) return null;
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
        `GcsObjectStore.put: declared contentLength=${opts.contentLength} but got ${bytes.byteLength}`,
      );
    }
    const sha256 = computeSha256Hex(bytes);
    const bucket = await this.bucketPromise;
    await bucket.file(key).save(Buffer.from(bytes), {
      resumable: false,
      contentType: opts.contentType ?? 'application/pdf',
      metadata: { metadata: { [SHA256_METADATA_KEY]: sha256 } },
    });
    return { sha256 };
  }

  async get(key: string): Promise<Uint8Array | null> {
    const bucket = await this.bucketPromise;
    try {
      const [buf] = await bucket.file(key).download();
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      if (isGcsNotFound(err)) return null;
      throw err;
    }
  }

  async getSha256(key: string): Promise<string | null> {
    const bucket = await this.bucketPromise;
    try {
      const [meta] = await bucket.file(key).getMetadata();
      const fromMeta = meta.metadata?.[SHA256_METADATA_KEY];
      if (typeof fromMeta === 'string' && fromMeta) return fromMeta;
      // Fall back to streaming the body (object PUT out-of-band).
      return await streamingSha256(bucket.file(key).createReadStream());
    } catch (err) {
      if (isGcsNotFound(err)) return null;
      throw err;
    }
  }

  async presignUpload(
    key: string,
    ttlSec: number,
    opts: PresignUploadOpts,
  ): Promise<PresignedUpload | null> {
    const bucket = await this.bucketPromise;
    const expiresAt = Date.now() + ttlSec * 1000;
    const [url] = await bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType: opts.contentType,
    });
    // The client MUST send the same Content-Type it was signed with;
    // GCS rejects the PUT otherwise. Content-Length is required by the
    // HTTP PUT; Content-MD5 is optional integrity at the edge.
    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': opts.contentType,
        'Content-Length': String(opts.contentLength),
        ...(opts.contentMd5Base64 ? { 'Content-MD5': opts.contentMd5Base64 } : {}),
      },
      expiresAt,
    };
  }

  async presignDownload(key: string, ttlSec: number): Promise<PresignedDownload | null> {
    const bucket = await this.bucketPromise;
    const expiresAt = Date.now() + ttlSec * 1000;
    const [url] = await bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: expiresAt,
    });
    return { url, expiresAt };
  }

  async delete(key: string): Promise<boolean> {
    const bucket = await this.bucketPromise;
    try {
      await bucket.file(key).delete({ ignoreNotFound: false });
      return true;
    } catch (err) {
      if (isGcsNotFound(err)) return false;
      throw err;
    }
  }

  async materializeLocal(
    key: string,
    destPath: string,
    opts: MaterializeOpts,
  ): Promise<MaterializeResult> {
    const bucket = await this.bucketPromise;
    const file = bucket.file(key);
    const [meta] = await file.getMetadata();
    const size = typeof meta.size === 'string' ? Number(meta.size) : (meta.size ?? 0);
    const knownSha256 =
      typeof meta.metadata?.[SHA256_METADATA_KEY] === 'string'
        ? (meta.metadata[SHA256_METADATA_KEY] as string)
        : null;

    return materializeViaRanges(
      destPath,
      {
        size,
        knownSha256,
        // GCS ranged read: createReadStream({ start, end }) is inclusive.
        fetchRange: async (start, end) => file.createReadStream({ start, end }),
      },
      opts,
      'GcsObjectStore',
    );
  }

  async deletePrefix(prefix: string): Promise<{ deleted: number }> {
    const bucket = await this.bucketPromise;
    // Count first (deleteFiles doesn't report a count), then bulk-delete.
    const [files] = await bucket.getFiles({ prefix });
    if (files.length === 0) return { deleted: 0 };
    await bucket.deleteFiles({ prefix, force: true });
    return { deleted: files.length };
  }
}

function isGcsNotFound(err: unknown): boolean {
  const e = err as { code?: number; status?: number } | null;
  if (!e) return false;
  return e.code === 404 || e.status === 404;
}
