/**
 * Pluggable object-store interface for @cloudpdf/server.
 *
 * Adapters: `FsObjectStore`, `S3ObjectStore`, `GcsObjectStore`,
 * `AzureBlobObjectStore`. Every adapter exposes the same key shape
 * (`StorageKeys`) and the same operation set, so `rclone sync`
 * migrates verbatim between backends. The shared `objectStore`
 * conformance suite (test/_helpers/object-store-conformance.ts) pins
 * all four to identical observable behaviour.
 *
 * Phase 3 adds `materializeLocal`: copy a remote object to a local
 * path so PDFium can `pread()` it (or load it into memory). The
 * `BaseFileCache` calls this once per (sha, worker host) tuple, then
 * relies on the OS page cache for hot data.
 */

import type { Readable } from 'node:stream';

/**
 * The bytes payload for a one-shot upload. We accept either a
 * fully-buffered `Uint8Array` (Phase 1 admin pathway: customer
 * POSTs the PDF directly through origin) or a Node `Readable`
 * (future: streaming sources without materializing in RAM).
 */
export type ObjectBody = Uint8Array | Readable;

export interface PresignUploadOpts {
  /** Required by S3 SigV4. We declare exactly what the client will PUT. */
  contentLength: number;
  /** Always `application/pdf` for our pathway. */
  contentType: string;
  /**
   * Optional client-supplied MD5 hash, base64-encoded (S3 `Content-MD5`).
   * Provides at-the-edge integrity. We don't rely on it for security;
   * the SHA-256 verify-on-commit is the source of truth.
   */
  contentMd5Base64?: string;
}

export interface PresignedUpload {
  /** The URL the client PUTs to. */
  url: string;
  /**
   * Headers the client MUST include verbatim on the PUT, in the order
   * given. S3 includes `Host` and any signed metadata headers.
   */
  headers: Record<string, string>;
  /** HTTP method to use. Always `PUT` for our flows. */
  method: 'PUT';
  /** Absolute epoch ms when the presigned URL stops working. */
  expiresAt: number;
}

export interface PresignedDownload {
  url: string;
  /** Absolute epoch ms when the download URL stops working. */
  expiresAt: number;
}

export interface ObjectStat {
  size: number;
  /**
   * Strong identifier set by the backend on PUT. For S3 this is the
   * ETag (sans quotes); for FS it's the SHA-256 we compute as we
   * write. Used as a coarse change detector, NOT as a cryptographic
   * hash for our base PDF dedup; that comes from
   * `getSha256`/server-side verification on commit.
   */
  etag: string;
}

/**
 * The minimum operations a storage backend must support.
 *
 * Adapter expectations:
 *   - All keys are tenant-rooted; the caller (admin routes) is
 *     responsible for using `StorageKeys` to enforce isolation.
 *   - `put` and `delete` are idempotent: putting the same key twice
 *     overwrites; deleting a missing key is a no-op (returns false).
 *   - `deletePrefix` MUST recurse, return only after every child is
 *     gone, and tolerate concurrent deletes. Backends that can't
 *     deliver atomicity (S3) should at least be eventually consistent
 *     once they return.
 *
 * The `info` field follows the unified adapter pattern (see
 * ADAPTERS.md) — `kind` is the discriminator, other fields are
 * public identifiers safe to expose via `/v1/admin/status`.
 */
export interface ObjectStore {
  /**
   * Diagnostic identity. `kind` matches the config Zod schema's
   * discriminator; other fields are public identifiers only —
   * bucket names, hostnames, root paths. Never secrets.
   */
  readonly info: ObjectStoreInfo;

  /** Strong-consistency existence check. */
  exists(key: string): Promise<boolean>;

  /** Strong-consistency stat. Returns null if the key doesn't exist. */
  stat(key: string): Promise<ObjectStat | null>;

  /**
   * Direct origin-mediated upload. Used by:
   *   - FS adapter (where there's no presigned PUT to issue)
   *   - Customers behind strict egress policies that can't talk to S3
   * Returns the SHA-256 hex digest of the bytes that were written.
   * Implementations stream-hash if `body` is a `Readable`.
   */
  put(
    key: string,
    body: ObjectBody,
    opts: { contentLength: number; contentType?: string },
  ): Promise<{ sha256: string }>;

  /**
   * One-shot full download. Returns `null` for missing keys. Phase 1
   * only uses this for the admin /download verification endpoint;
   * Phase 3 will add `materializeLocal` for engine reads.
   */
  get(key: string): Promise<Uint8Array | null>;

  /**
   * Compute SHA-256 over the stored object without loading it all
   * into memory. Used by `commit` to verify the customer-claimed sha
   * against the bytes that landed in storage. May be a no-op for
   * adapters that hash on PUT and return the digest via `stat.etag`.
   */
  getSha256(key: string): Promise<string | null>;

  /** Return null if presigned uploads aren't supported (FsObjectStore). */
  presignUpload(
    key: string,
    ttlSec: number,
    opts: PresignUploadOpts,
  ): Promise<PresignedUpload | null>;

  /** Return null if presigned downloads aren't supported. */
  presignDownload(key: string, ttlSec: number): Promise<PresignedDownload | null>;

  delete(key: string): Promise<boolean>;
  /** Recursive prefix delete. Used by `documents.delete` cascade. */
  deletePrefix(prefix: string): Promise<{ deleted: number }>;

  /**
   * Phase 3 — copy a remote object to a local file path so the
   * worker can pread it. The implementation is allowed to use
   * whichever fan-out strategy gives best throughput (parallel range
   * GET for S3, hard-link or stream-copy for FS).
   *
   * Atomicity contract:
   *   - Writes go to `${destPath}.partial.<random>` first; an atomic
   *     `rename` produces the final `destPath` only after the entire
   *     payload landed without error.
   *   - On any failure the partial file is removed; callers see the
   *     thrown error and never an incomplete file.
   *
   * Returns the size and SHA-256 of the materialised bytes. If the
   * adapter stores the SHA in object metadata (S3) we trust that and
   * skip a redundant rehash; otherwise we hash during materialise.
   * `expectedSha` is verified at the end; mismatch throws.
   */
  materializeLocal(
    key: string,
    destPath: string,
    opts: MaterializeOpts,
  ): Promise<MaterializeResult>;
}

export interface MaterializeOpts {
  /**
   * SHA-256 hex of the object as recorded at commit time. Verified
   * against the materialised file; mismatch throws (we never deliver
   * corrupted bytes to PDFium).
   */
  expectedSha: string;
  /**
   * Override the parallelism level. Sensible default per-adapter (eg
   * 8 concurrent range GETs for S3, 1 stream-copy for FS).
   */
  concurrency?: number;
  /** Per-range chunk size in bytes (S3 only). Defaults to 16 MiB. */
  chunkSizeBytes?: number;
  /** Cooperative cancellation. */
  signal?: AbortSignal;
}

export interface MaterializeResult {
  /** Absolute path of the freshly written local file. */
  path: string;
  size: number;
  /** SHA-256 hex of the materialised bytes; always re-verified. */
  sha256: string;
}

/**
 * Discriminator for `ObjectStore.info.kind`. Matches the variants in
 * `ObjectStoreConfigSchema`. `azure-blob` replaces the older
 * `'azure'` label so it's symmetric with the env-var naming
 * (`CLOUDPDF_STORAGE_AZURE_BLOB_*`).
 */
export type ObjectStoreKind = 'fs' | 's3' | 'gcs' | 'azure-blob';

/**
 * Diagnostic identity for an ObjectStore. `kind` is the discriminator;
 * other fields are public identifiers safe to expose via
 * `/v1/admin/status` — bucket names, hostnames, root paths. Never
 * secret material.
 */
export interface ObjectStoreInfo {
  readonly kind: ObjectStoreKind;
  /** Public identifier for diagnostics. `s3://bucket`, `gs://bucket`, root path, etc. */
  readonly location: string;
  readonly [field: string]: unknown;
}

/**
 * @deprecated Use `ObjectStore` directly — `info` is now required on
 * the base interface. Kept as a type alias for back-compat with
 * downstream code; remove after callers migrate.
 */
export type ObjectStoreWithInfo = ObjectStore;
