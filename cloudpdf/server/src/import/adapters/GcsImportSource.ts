/**
 * GCS import source — reads one object from an operator-registered
 * Google Cloud Storage connection. Read-only: stat + a single ranged
 * read; authority is Application Default Credentials (Workload
 * Identity / key file via the SDK chain), never the request.
 *
 * `revision` maps to the OBJECT GENERATION: a positive decimal
 * integer ('0' has precondition semantics in GCS and is refused).
 * The read is pinned to the generation observed at stat time even
 * for unpinned requests, so the declared size and the streamed bytes
 * can never belong to different generations; that generation is
 * reported back as `resolvedRevision`.
 *
 * Lazy-load per ADAPTERS.md.
 */
import type { Readable } from 'node:stream';

import type { GcsImportConnection } from '../config/ImportConnectionSchema';
import type { ImportPolicy } from '../config/ImportPolicySchema';
import {
  ImportSourceError,
  type ImportSource,
  type ImportSourceInfo,
  type ImportSourceOpen,
} from '../ImportSource';

// Type-only — does NOT trigger the runtime import (see ADAPTERS.md).
type StorageModule = typeof import('@google-cloud/storage');
type Bucket = ReturnType<InstanceType<StorageModule['Storage']>['bucket']>;

const GENERATION_PATTERN = /^[1-9][0-9]*$/;

export interface GcsImportSourceOptions {
  connection: GcsImportConnection;
  key: string;
  revision?: string | undefined;
  policy: ImportPolicy;
}

export class GcsImportSource implements ImportSource {
  readonly info: ImportSourceInfo;
  private readonly bucketPromise: Promise<Bucket>;

  constructor(private readonly opts: GcsImportSourceOptions) {
    if (opts.revision !== undefined && !GENERATION_PATTERN.test(opts.revision)) {
      throw new ImportSourceError(
        'unsupported',
        'GCS revisions are object generations: a positive decimal integer',
        false,
      );
    }
    this.info = {
      kind: 'gcs',
      location: `gs://${opts.connection.bucket}/${opts.key}`,
      connectionId: opts.connection.id,
    };
    this.bucketPromise = this.createBucket();
  }

  private async createBucket(): Promise<Bucket> {
    const mod = (await import('@google-cloud/storage')) as StorageModule;
    const conn = this.opts.connection;
    const storage = new mod.Storage(conn.projectId ? { projectId: conn.projectId } : {});
    return storage.bucket(conn.bucket);
  }

  async open(opts: { signal: AbortSignal }): Promise<ImportSourceOpen> {
    if (opts.signal.aborted) {
      throw new ImportSourceError(
        'upstream',
        'import timed out or was aborted before contacting the source',
        true,
      );
    }
    const bucket = await this.bucketPromise;
    const requested = this.opts.revision !== undefined ? Number(this.opts.revision) : undefined;
    const file =
      requested !== undefined
        ? bucket.file(this.opts.key, { generation: requested })
        : bucket.file(this.opts.key);
    let meta: Record<string, unknown>;
    try {
      const res = (await file.getMetadata()) as unknown as [Record<string, unknown>, unknown];
      meta = res[0];
    } catch (err) {
      throw mapGcsImportError(err, this.info.location, opts.signal);
    }
    const rawSize = meta['size'];
    const contentLength = typeof rawSize === 'string' ? Number(rawSize) : Number(rawSize ?? NaN);
    if (!Number.isFinite(contentLength)) {
      throw new ImportSourceError(
        'unsupported',
        `GCS stat at ${this.info.location} did not declare a length`,
        false,
      );
    }
    if (contentLength < 1) {
      throw new ImportSourceError(
        'unsupported',
        `source object at ${this.info.location} is empty; imports require at least one byte`,
        false,
      );
    }
    if (contentLength > this.opts.policy.maxBytes) {
      throw new ImportSourceError(
        'too_large',
        `source declares ${contentLength} bytes; this deployment caps imports at ${this.opts.policy.maxBytes}`,
        false,
      );
    }
    const resolvedRevision =
      meta['generation'] !== undefined && meta['generation'] !== null
        ? String(meta['generation'])
        : undefined;
    // Pin the stream to the stat'ed generation: size and bytes must
    // come from the SAME object version even if the key is
    // overwritten between stat and read.
    const pinned =
      resolvedRevision !== undefined
        ? bucket.file(this.opts.key, { generation: Number(resolvedRevision) })
        : file;
    const body = pinned.createReadStream() as Readable;
    const contentType = typeof meta['contentType'] === 'string' ? meta['contentType'] : undefined;
    return {
      body,
      contentLength,
      ...(contentType ? { contentType } : {}),
      ...(resolvedRevision ? { resolvedRevision } : {}),
    };
  }
}

function mapGcsImportError(err: unknown, location: string, signal: AbortSignal): ImportSourceError {
  if (signal.aborted) {
    return new ImportSourceError(
      'upstream',
      'import timed out or was aborted while contacting the source',
      true,
    );
  }
  const e = err as { code?: number | string; status?: number } | null;
  const status = typeof e?.code === 'number' ? e.code : (e?.status ?? 0);
  if (status === 404) {
    return new ImportSourceError('not_found', `source object not found at ${location}`, false);
  }
  if (status === 401 || status === 403) {
    return new ImportSourceError(
      'denied',
      `source refused access (HTTP ${status}) at ${location}`,
      false,
    );
  }
  if (status >= 400 && status < 500) {
    return new ImportSourceError(
      'unsupported',
      `source responded HTTP ${status} at ${location}`,
      false,
    );
  }
  return new ImportSourceError(
    'upstream',
    `could not fetch from source: ${(err as Error)?.message?.slice(0, 120) ?? 'network error'}`,
    true,
  );
}
