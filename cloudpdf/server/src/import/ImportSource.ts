/**
 * Pluggable read-only source family for `documents.importFrom` — the
 * server-side pull counterpart to the client-push upload pathway.
 *
 * A source is NOT an ObjectStore: it is deliberately incapable of
 * writing or deleting. The deployment's ObjectStore is "our bucket,
 * our credentials, read-write"; a source is "their bytes, someone
 * else's authority, read-only". v1 ships one universal kind — `url`
 * (a caller-minted presigned GET) — which covers every object store
 * that can presign. Native kinds (`s3`/`gcs`/`azure-blob` against
 * registered connections) can join later under the same factory,
 * following ADAPTERS.md conventions.
 *
 * `stat()` is intentionally absent: presigned GET URLs frequently
 * cannot be HEADed (S3 and GCS sign the HTTP method into the URL), so
 * the contract is open-then-read — `open()` resolves with the
 * source's declared length taken from the GET response itself, before
 * the body is consumed. Headers can lie; the byte-exact streaming
 * `ObjectStore.put` is the enforcement downstream.
 */
import type { Readable } from 'node:stream';

export type ImportSourceKind = 'url' | 's3' | 'gcs' | 'azure-blob' | 'fs';

/**
 * Diagnostic identity, mirroring the other adapter families:
 * `kind` is the discriminator; `location` is a public identifier
 * only — for URL sources that means origin + path, NEVER the query
 * string (a presigned query string IS the credential).
 */
export interface ImportSourceInfo {
  readonly kind: ImportSourceKind;
  readonly location: string;
  readonly [field: string]: unknown;
}

export interface ImportSourceOpen {
  /** The source bytes, exactly once, sequentially. */
  body: Readable;
  /** Source-declared byte length (verified byte-exactly downstream). */
  contentLength: number;
  /** Advisory only; the security probe is the arbiter of content. */
  contentType?: string;
  /**
   * The revision the backend actually served (S3 VersionId, GCS
   * generation, Azure version id), when the backend reports one —
   * even if the request didn't pin a revision. Recorded as
   * provenance; phase 3b pins async retries to it.
   */
  resolvedRevision?: string;
}

export interface ImportSource {
  readonly info: ImportSourceInfo;
  /**
   * Open the source for a single sequential read. Implementations
   * must honour `signal`, reject with {@link ImportSourceError} for
   * every anticipated failure, and hold at most constant memory
   * regardless of object size.
   */
  open(opts: { signal: AbortSignal }): Promise<ImportSourceOpen>;
}

/**
 * Failure classes for the import pathway.
 *
 *   - `policy`      rejected by deployment policy (scheme, network range, URL shape)
 *   - `not_found`   the source says the object does not exist
 *   - `denied`      the source refused access (expired presign, 401/403)
 *   - `unsupported` the source lacks a required capability (redirect, no Content-Length)
 *   - `too_large`   declared length exceeds the policy cap
 *   - `upstream`    network / 5xx / timeout — retryable
 */
export type ImportSourceErrorCode =
  | 'policy'
  | 'not_found'
  | 'denied'
  | 'unsupported'
  | 'too_large'
  | 'upstream';

export class ImportSourceError extends Error {
  constructor(
    readonly code: ImportSourceErrorCode,
    /**
     * Sanitized — safe for `failure_reason` and API responses. Must
     * never carry URL query strings or credentials.
     */
    message: string,
    /**
     * Retryable failures leave the document `pending` so the same
     * idempotency key can resume; terminal ones mark it `failed`.
     */
    readonly retryable: boolean = code === 'upstream',
  ) {
    super(message);
    this.name = 'ImportSourceError';
  }

  static is(err: unknown): err is ImportSourceError {
    return err instanceof ImportSourceError;
  }
}
