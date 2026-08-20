/**
 * S3 import source — reads one object from an operator-registered S3
 * (or S3-compatible: R2, MinIO, Wasabi) connection.
 *
 * Deliberately read-only: the only operation is a single GetObject.
 * Authority comes from the SDK's default credential chain (IAM role /
 * env), never from the request — the connection's authorization gates
 * (credential class, tenant binding, prefix scope, self-storage
 * refusal) all fire in `createImportSource` BEFORE this adapter is
 * constructed.
 *
 * `revision` maps to S3 VersionId; the response's VersionId is
 * reported back as `resolvedRevision` even for unpinned reads, so
 * provenance always records what was actually served.
 *
 * Lazy-load per ADAPTERS.md: `@aws-sdk/client-s3` imports on first
 * use, never at module load.
 */
import type { Readable } from 'node:stream';

import type { S3ImportConnection } from '../config/ImportConnectionSchema';
import type { ImportPolicy } from '../config/ImportPolicySchema';
import {
  ImportSourceError,
  type ImportSource,
  type ImportSourceInfo,
  type ImportSourceOpen,
} from '../ImportSource';

// Type-only — does NOT trigger the runtime import (see ADAPTERS.md).
type S3Module = typeof import('@aws-sdk/client-s3');
type S3Client = InstanceType<S3Module['S3Client']>;

export interface S3ImportSourceOptions {
  connection: S3ImportConnection;
  key: string;
  revision?: string | undefined;
  policy: ImportPolicy;
}

export class S3ImportSource implements ImportSource {
  readonly info: ImportSourceInfo;
  /**
   * Unlike destination adapters (constructed once at boot), sources
   * are per-request: construction must stay a pure validation step
   * with NO side effects, so the lazy SDK import starts on first
   * open() — construct-and-discard (async eligibility gates, tests)
   * never leaves a dangling in-flight import behind.
   */
  private depsPromise?: Promise<{ client: S3Client; cmd: S3Module }>;

  constructor(private readonly opts: S3ImportSourceOptions) {
    this.info = {
      kind: 's3',
      location: `s3://${opts.connection.bucket}/${opts.key}`,
      connectionId: opts.connection.id,
    };
  }

  private deps(): Promise<{ client: S3Client; cmd: S3Module }> {
    this.depsPromise ??= this.createDeps();
    return this.depsPromise;
  }

  private async createDeps(): Promise<{ client: S3Client; cmd: S3Module }> {
    const cmd = (await import('@aws-sdk/client-s3')) as S3Module;
    const conn = this.opts.connection;
    const client = new cmd.S3Client({
      region: conn.region,
      ...(conn.endpoint ? { endpoint: conn.endpoint, forcePathStyle: true } : {}),
    });
    return { client, cmd };
  }

  async open(opts: { signal: AbortSignal }): Promise<ImportSourceOpen> {
    if (opts.signal.aborted) {
      throw new ImportSourceError(
        'upstream',
        'import timed out or was aborted before contacting the source',
        true,
      );
    }
    const { client, cmd } = await this.deps();
    const conn = this.opts.connection;
    let res;
    try {
      res = await client.send(
        new cmd.GetObjectCommand({
          Bucket: conn.bucket,
          Key: this.opts.key,
          ...(this.opts.revision ? { VersionId: this.opts.revision } : {}),
        }),
        { abortSignal: opts.signal },
      );
    } catch (err) {
      throw mapS3ImportError(err, this.info.location, opts.signal);
    }
    const contentLength = res.ContentLength;
    if (!res.Body || typeof contentLength !== 'number' || !Number.isFinite(contentLength)) {
      throw new ImportSourceError(
        'unsupported',
        `S3 GET at ${this.info.location} returned no readable body with a declared length`,
        false,
      );
    }
    const body = res.Body as Readable;
    if (contentLength < 1) {
      body.destroy();
      throw new ImportSourceError(
        'unsupported',
        `source object at ${this.info.location} is empty; imports require at least one byte`,
        false,
      );
    }
    if (contentLength > this.opts.policy.maxBytes) {
      body.destroy();
      throw new ImportSourceError(
        'too_large',
        `source declares ${contentLength} bytes; this deployment caps imports at ${this.opts.policy.maxBytes}`,
        false,
      );
    }
    return {
      body,
      contentLength,
      ...(res.ContentType ? { contentType: res.ContentType } : {}),
      ...(res.VersionId ? { resolvedRevision: res.VersionId } : {}),
    };
  }
}

function mapS3ImportError(err: unknown, location: string, signal: AbortSignal): ImportSourceError {
  if (signal.aborted) {
    return new ImportSourceError(
      'upstream',
      'import timed out or was aborted while contacting the source',
      true,
    );
  }
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } } | null;
  const status = e?.$metadata?.httpStatusCode;
  const name = e?.name ?? '';
  if (name === 'NoSuchKey' || name === 'NoSuchVersion' || name === 'NotFound' || status === 404) {
    return new ImportSourceError('not_found', `source object not found at ${location}`, false);
  }
  // Before the denied branch: Glacier's InvalidObjectState also
  // arrives as HTTP 403 and would be shadowed by the status check.
  if (name === 'InvalidObjectState') {
    return new ImportSourceError(
      'unsupported',
      `source object at ${location} is archived (Glacier) and not directly readable`,
      false,
    );
  }
  if (name === 'AccessDenied' || status === 403) {
    return new ImportSourceError(
      'denied',
      `source refused access (AccessDenied) at ${location}`,
      false,
    );
  }
  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new ImportSourceError(
      'unsupported',
      `source responded HTTP ${status} at ${location}`,
      false,
    );
  }
  return new ImportSourceError(
    'upstream',
    `could not fetch from source: ${name || 'network error'}`,
    true,
  );
}
