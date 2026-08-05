import { createHash } from 'node:crypto';
import {
  AdminDocumentCommitResponseSchema,
  AdminDocumentInitResponseSchema,
  AdminDocumentListResponseSchema,
  AdminDocumentResponseSchema,
  AdminUploadDirectResponseSchema,
  adminWirePaths,
} from '@cloudpdf/admin-api';
import { AdminError } from '../transport/AdminError';
import { HttpClient } from '../transport/HttpClient';
import type { CommitResponse, DedupMode, DocumentRecord, InitResponse } from './types';

export interface DocumentCreateInput {
  /** PDF bytes. The SDK computes SHA-256 in flight. */
  bytes: Uint8Array | Buffer;
  /** Arbitrary JSON metadata persisted alongside the doc. */
  metadata?: Record<string, unknown>;
  /**
   * Safe-retry key. If a previous attempt with this key succeeded,
   * the existing doc is returned and no new upload is performed.
   * Per-tenant scoped.
   */
  idempotencyKey?: string;
  /**
   * - `always-create` (default): each call produces a new doc, even
   *   for content-identical uploads.
   * - `reuse-existing`: if a doc with the same SHA-256 already
   *   exists in this tenant, return it without re-uploading.
   */
  dedupMode?: DedupMode;
  /** Explicit doc id; auto-generated when absent. */
  docId?: string;
  /** Lifetime for the presigned PUT issued by `init`. */
  uploadTtlSec?: number;
  /** Progress callback for the upload phase. */
  onProgress?: (loaded: number, total: number) => void;
  /** Aborts both the upload and the bracketing init/commit calls. */
  signal?: AbortSignal;
}

export interface DocumentCreateResult {
  document: DocumentRecord;
  /** `created`: fresh doc + upload. `deduped`: matched an existing doc, no upload. */
  tag: 'created' | 'deduped';
}

export interface DocumentInitInput {
  contentLength: number;
  contentSha256: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  dedupMode?: DedupMode;
  docId?: string;
  uploadTtlSec?: number;
}

export interface DocumentCommitInput {
  docId: string;
  sha256: string;
}

/**
 * High-level documents API. Hides the three-step `init -> PUT -> commit`
 * dance behind a single `create()` call. The escape-hatch
 * (`init`/`commit`/`uploadDirect`) is exposed for customers using
 * uppy / resumable.js / AzCopy.
 */
export class Documents {
  constructor(private readonly http: HttpClient) {}

  /**
   * Single-call upload. Streams the PDF straight to cloud storage
   * (presigned PUT) or through the origin (FS adapter) — the SDK
   * picks based on the `init` response. Server-side SHA-256
   * verification is unconditional, so a midstream corruption fails
   * `commit` rather than silently storing bad bytes.
   */
  async create(input: DocumentCreateInput): Promise<DocumentCreateResult> {
    const bytes = toUint8Array(input.bytes);
    const sha256 = sha256Hex(bytes);

    const init = await this.init({
      contentLength: bytes.byteLength,
      contentSha256: sha256,
      metadata: input.metadata,
      idempotencyKey: input.idempotencyKey,
      dedupMode: input.dedupMode,
      docId: input.docId,
      uploadTtlSec: input.uploadTtlSec,
    });

    if (init.tag === 'deduped') {
      input.onProgress?.(bytes.byteLength, bytes.byteLength);
      return { document: init.document, tag: 'deduped' };
    }

    // The server returns either a presigned PUT URL (S3) or a direct
    // URL into our own admin upload-direct route (FS). Either way,
    // the SDK is responsible for pushing the bytes.
    const upload = init.upload;
    if (upload.kind === 'presigned') {
      if (!upload.presigned) {
        throw new AdminError({
          code: 'BadServerResponse',
          status: 500,
          message: 'server returned presigned upload without details',
        });
      }
      input.onProgress?.(0, bytes.byteLength);
      await this.http.putPresigned(upload.presigned.url, bytes, upload.presigned.headers, {
        signal: input.signal,
      });
      input.onProgress?.(bytes.byteLength, bytes.byteLength);
    } else {
      if (!upload.url) {
        throw new AdminError({
          code: 'BadServerResponse',
          status: 500,
          message: 'server returned direct upload without url',
        });
      }
      input.onProgress?.(0, bytes.byteLength);
      // The direct URL is owned by our origin, so re-attach tenant auth
      // through the same JSON-validating client path as the public helper.
      await this.http.postBytesJson(
        upload.url,
        bytes,
        (raw) => AdminUploadDirectResponseSchema.parse(raw),
        {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(bytes.byteLength),
          },
          signal: input.signal,
        },
      );
      input.onProgress?.(bytes.byteLength, bytes.byteLength);
    }

    const commit = await this.commit({
      docId: init.document.id,
      sha256,
    });
    return { document: commit.document, tag: 'created' };
  }

  async init(input: DocumentInitInput): Promise<InitResponse> {
    return this.http.postJson(adminWirePaths.documentsInit, input, (raw) =>
      AdminDocumentInitResponseSchema.parse(raw),
    );
  }

  async commit(input: DocumentCommitInput): Promise<CommitResponse> {
    return this.http.postJson(
      adminWirePaths.documentCommit(input.docId),
      { sha256: input.sha256 },
      (raw) => AdminDocumentCommitResponseSchema.parse(raw),
    );
  }

  /**
   * Lower-level direct upload helper. Useful when uploading from a
   * Readable source you don't want to buffer to compute sha first.
   * For the typical case use `create`.
   */
  async uploadDirect(input: { docId: string; body: Uint8Array; contentLength: number }): Promise<{
    sha256: string;
  }> {
    return this.http.postBytesJson(
      adminWirePaths.documentUploadDirect(input.docId),
      input.body,
      (raw) => AdminUploadDirectResponseSchema.parse(raw),
      {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Length': String(input.contentLength),
        },
      },
    );
  }

  async get(docId: string): Promise<DocumentRecord> {
    const response = await this.http.getJson(adminWirePaths.document(docId), (raw) =>
      AdminDocumentResponseSchema.parse(raw),
    );
    return response.document;
  }

  async list(opts: { limit?: number } = {}): Promise<DocumentRecord[]> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    const path =
      params.size > 0 ? `${adminWirePaths.documents}?${params}` : adminWirePaths.documents;
    const response = await this.http.getJson(path, (raw) =>
      AdminDocumentListResponseSchema.parse(raw),
    );
    return response.documents;
  }

  async delete(docId: string): Promise<void> {
    await this.http.deleteEmpty(adminWirePaths.document(docId));
  }

  /** Admin-side download for verification / migration tooling. */
  async download(docId: string): Promise<Uint8Array> {
    const res = await this.http.getResponse(adminWirePaths.documentDownload(docId));
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  }
}

function toUint8Array(input: Uint8Array | Buffer): Uint8Array {
  if (input instanceof Uint8Array) return input;
  return new Uint8Array(input);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
