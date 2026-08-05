import { randomBytes } from 'node:crypto';
import { DocumentsRepo, type DocumentRow } from '../db/repos/documents.repo';
import { TenantsRepo } from '../db/repos/tenants.repo';
import { StorageKeys } from '../storage/keys';
import type { ObjectBody, ObjectStoreWithInfo, PresignedUpload } from '../storage/ObjectStore';
import { DocumentSecurityProbe } from './DocumentSecurityProbe';
import type { DerivedRenderService } from './DerivedRenderService';
import type { UsageMeters } from '../licensing/UsageMeters';

export type DedupMode = 'always-create' | 'reuse-existing';

export interface InitInput {
  tenantId: string;
  sub: string;
  contentLength: number;
  /**
   * Customer-supplied SHA-256 of the bytes they intend to upload.
   * Required so we can do a pre-flight dedup check (reuse-existing)
   * and pin the verify-on-commit target. Phase 1 still verifies
   * server-side at commit time, so a lying customer never wins.
   */
  contentSha256: string;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  dedupMode?: DedupMode;
  /**
   * Customer-controlled doc id. If absent, server generates one. Used
   * for migration / tooling where the customer already has an id space.
   */
  docId?: string;
  /** Presigned URL TTL. */
  uploadTtlSec?: number;
}

export type InitResult =
  | { tag: 'created'; doc: DocumentRow }
  | { tag: 'resumed'; doc: DocumentRow }
  | { tag: 'deduped'; doc: DocumentRow };

export type InitUpload =
  | {
      kind: 'presigned';
      presigned: PresignedUpload;
      /** The storage key the client is uploading to (informational). */
      key: string;
    }
  | {
      kind: 'direct';
      /** Path on the API the client POSTs the body to. */
      url: string;
      key: string;
    };

export interface CommitInput {
  tenantId: string;
  docId: string;
  sha256: string;
}

export interface CommitResult {
  doc: DocumentRow;
}

export interface UploadDirectInput {
  tenantId: string;
  docId: string;
  body: ObjectBody;
  contentLength: number;
}

export interface DocumentLifecycleOptions {
  documents: DocumentsRepo;
  tenants: TenantsRepo;
  storage: ObjectStoreWithInfo;
  /**
   * If true, the lifecycle service auto-provisions a tenant row on
   * first admin call. Useful for dev / single-tenant deploys.
   * Production deployments should disable this and require explicit
   * tenant provisioning.
   */
  autoProvisionTenant?: boolean;
  securityProbe?: DocumentSecurityProbe;
  /** When present, commit warms the document's thumbnail (fire-and-forget). */
  derivedRenders?: DerivedRenderService;
  usageMeters?: UsageMeters;
}

/**
 * Orchestrator over `documents.repo`, `tenants.repo`, and the
 * `ObjectStore`. Implements the three-step `init -> PUT -> commit`
 * flow plus delete cascade and download.
 *
 * Failure model:
 *   - `init`     - returns `tag: deduped` on a content-sha match (no
 *                  upload needed). Throws `EngineError(InvalidArg)`
 *                  if the customer supplied a stale idempotency key
 *                  pointing at a different content sha.
 *   - `commit`   - returns `null`/throws `Conflict` if the row is no
 *                  longer pending. Verifies sha by reading
 *                  `objectStore.getSha256(key)`; mismatch -> marks
 *                  failed + throws `InvalidArg('sha_mismatch')`.
 *   - `delete`   - two-phase: flip to `deleting`, drop storage prefix,
 *                  remove DB row. A crash between phases leaves
 *                  `deleting` rows for the sweeper to retry.
 */
export class DocumentLifecycleService {
  private readonly documents: DocumentsRepo;
  private readonly tenants: TenantsRepo;
  private readonly storage: ObjectStoreWithInfo;
  private readonly autoProvisionTenant: boolean;
  private readonly securityProbe: DocumentSecurityProbe;
  private readonly derivedRenders?: DerivedRenderService;
  private readonly usageMeters?: UsageMeters;

  constructor(opts: DocumentLifecycleOptions) {
    this.documents = opts.documents;
    this.tenants = opts.tenants;
    this.storage = opts.storage;
    this.autoProvisionTenant = opts.autoProvisionTenant ?? false;
    this.securityProbe = opts.securityProbe ?? new DocumentSecurityProbe();
    this.derivedRenders = opts.derivedRenders;
    this.usageMeters = opts.usageMeters;
  }

  async init(input: InitInput): Promise<InitResult> {
    if (this.autoProvisionTenant) await this.tenants.ensure({ id: input.tenantId });

    const dedupMode: DedupMode = input.dedupMode ?? 'always-create';

    if (dedupMode === 'reuse-existing' && input.contentSha256) {
      const existing = await this.documents.findByBaseSha(input.tenantId, input.contentSha256);
      if (existing) {
        return { tag: 'deduped', doc: existing };
      }
    }

    if (input.idempotencyKey) {
      const existing = await this.documents.findByIdempotencyKey(
        input.tenantId,
        input.idempotencyKey,
      );
      if (existing) {
        // If the row is already committed, return `deduped` (no
        // upload). If pending, return `resumed` so the route hands
        // back a fresh upload URL to finish the half-finished work.
        if (existing.state === 'ready' || existing.state === 'failed') {
          return { tag: 'deduped', doc: existing };
        }
        return { tag: 'resumed', doc: existing };
      }
    }

    const docId = input.docId ?? generateDocId();
    if (docId.length < 2) {
      throw badRequest(`docId must be at least 2 characters: ${docId}`);
    }

    const created = await this.documents.createPending({
      id: docId,
      tenantId: input.tenantId,
      metadata: input.metadata ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      createdBy: input.sub,
    });

    return { tag: created.created ? 'created' : 'resumed', doc: created.row };
  }

  private buildUploadKey(docId: string, tenantId: string): string {
    return StorageKeys.basePdf(tenantId, docId);
  }

  /**
   * Materialize the upload artifact (presigned PUT for S3/cloud
   * backends, direct origin POST for FS). Called by the admin route
   * after `init`; the route owns the direct-upload URL space so the
   * service stays Fastify-agnostic.
   */
  async issueUpload(
    docId: string,
    tenantId: string,
    contentLength: number,
    directUrlForDoc: (docId: string) => string,
    opts: { ttlSec?: number } = {},
  ): Promise<InitUpload> {
    const key = this.buildUploadKey(docId, tenantId);
    const ttl = opts.ttlSec ?? 900;
    if (this.storage.info.kind === 'fs') {
      return { kind: 'direct', url: directUrlForDoc(docId), key };
    }
    const presigned = await this.storage.presignUpload(key, ttl, {
      contentLength,
      contentType: 'application/pdf',
    });
    if (!presigned) {
      return { kind: 'direct', url: directUrlForDoc(docId), key };
    }
    return { kind: 'presigned', presigned, key };
  }

  async uploadDirect(input: UploadDirectInput): Promise<{ sha256: string }> {
    const doc = await this.documents.requireOwned(input.docId, input.tenantId);
    if (doc.state !== 'pending') {
      throw conflict(`document ${doc.id} is not pending (state=${doc.state})`);
    }
    const key = this.buildUploadKey(doc.id, doc.tenantId);
    return this.storage.put(key, input.body, { contentLength: input.contentLength });
  }

  async commit(input: CommitInput): Promise<CommitResult> {
    const doc = await this.documents.requireOwned(input.docId, input.tenantId);
    if (doc.state === 'ready') {
      // Idempotent commit: if the existing base_sha matches, return
      // the doc unchanged; otherwise this is a programmer error.
      if (doc.baseSha === input.sha256) {
        await this.usageMeters?.recordUpload(doc.id, doc.createdAt);
        return { doc };
      }
      throw conflict(`document ${doc.id} already committed with different base_sha`);
    }
    if (doc.state !== 'pending') {
      throw conflict(`document ${doc.id} is not pending (state=${doc.state})`);
    }

    const key = this.buildUploadKey(doc.id, doc.tenantId);
    const stat = await this.storage.stat(key);
    if (!stat) {
      // Caller skipped the PUT.
      await this.documents.markFailed(doc.id, doc.tenantId, 'missing_upload');
      throw badRequest(`no bytes found at ${key}; PUT before commit`);
    }
    const observedSha = await this.storage.getSha256(key);
    if (!observedSha) {
      await this.documents.markFailed(doc.id, doc.tenantId, 'sha_unavailable');
      throw new Error('object store could not produce SHA-256 for the uploaded bytes');
    }
    if (observedSha !== input.sha256) {
      await this.documents.markFailed(doc.id, doc.tenantId, 'sha_mismatch');
      // Also remove the bad bytes so a retry isn't reading stale data.
      await this.storage.delete(key);
      throw badRequest(
        `sha_mismatch: client declared ${input.sha256} but server observed ${observedSha}`,
      );
    }

    const probe = await this.securityProbe.probe({
      key,
      expectedSha: observedSha,
    });

    // Meter only a newly committed document. The ready/idempotent return at
    // the top of this method never reaches this path.
    await this.usageMeters?.assertUploadAllowed();
    await this.usageMeters?.assertStorageAllowed(stat.size);

    const updated = await this.documents.commit({
      id: doc.id,
      tenantId: doc.tenantId,
      baseSha: observedSha,
      storageSizeBytes: stat.size,
      security: probe.security,
    });
    if (!updated) {
      throw conflict(`document ${doc.id} state changed during commit`);
    }
    await this.usageMeters?.recordUpload(updated.id, updated.createdAt);

    // Thumbnail lifecycle: user-password documents get NO
    // derived artifact — a thumbnail is content disclosure, and the lock
    // tile IS the correct render. Everything else warms fire-and-forget:
    // the read-through path is the correctness path, warming is latency.
    if (probe.security.encryptionRequiresPassword === true) {
      await this.documents.setThumbnail(doc.id, doc.tenantId, 'locked');
    } else if (this.derivedRenders) {
      void this.derivedRenders
        .warmDocumentThumbnail({
          tenantId: doc.tenantId,
          docId: doc.id,
          baseSha: observedSha,
          baseKey: key,
        })
        .catch(() => undefined); // warm records `failed` itself
    }

    return { doc: updated };
  }

  async list(tenantId: string, opts: { limit?: number } = {}): Promise<DocumentRow[]> {
    return this.documents.listForTenant(tenantId, opts);
  }

  async get(tenantId: string, docId: string): Promise<DocumentRow> {
    return this.documents.requireOwned(docId, tenantId);
  }

  async download(tenantId: string, docId: string): Promise<Uint8Array> {
    const doc = await this.documents.requireOwned(docId, tenantId);
    if (doc.state !== 'ready') {
      throw conflict(`document ${doc.id} is not ready (state=${doc.state})`);
    }
    const key = this.buildUploadKey(doc.id, doc.tenantId);
    const bytes = await this.storage.get(key);
    if (!bytes) {
      throw new Error(`document ${doc.id} bytes missing from storage at ${key}`);
    }
    return bytes;
  }

  async delete(tenantId: string, docId: string): Promise<void> {
    // Tenant isolation gate first. We deliberately distinguish:
    //   - row exists & belongs to this tenant: proceed with cascade
    //   - row exists & belongs to a different tenant: 403 (caught
    //     by requireOwned)
    //   - row doesn't exist anywhere: 204 (idempotent)
    const row = await this.documents.findById(docId);
    if (!row) return;
    if (row.tenantId !== tenantId) {
      const err = new Error(`document does not belong to tenant: ${docId}`) as Error & {
        code: string;
      };
      err.code = 'Forbidden';
      throw err;
    }
    const begun = await this.documents.beginDelete(docId, tenantId);
    if (!begun) {
      // Race: another caller advanced it. Still consider the cascade
      // our responsibility — fall through to storage cleanup so a
      // double-delete still leaves nothing behind.
    }
    const prefix = StorageKeys.docRoot(tenantId, docId);
    await this.storage.deletePrefix(prefix);
    await this.documents.finalizeDelete(docId, tenantId);
  }

  /**
   * Sweep stale `pending` rows + their (possibly orphaned) bytes.
   * Returns the count of swept documents. Safe to call from a
   * scheduled task in `buildApp`.
   */
  async sweepStalePending(opts: { olderThanMs: number }): Promise<number> {
    const stale = await this.documents.listStalePending(opts.olderThanMs);
    for (const doc of stale) {
      await this.delete(doc.tenantId, doc.id);
    }
    return stale.length;
  }
}

function generateDocId(): string {
  // 12 bytes -> 24 hex chars. Fits the 2-char shard naturally.
  return `doc_${randomBytes(12).toString('hex')}`;
}

function badRequest(message: string): Error {
  const e = new Error(message) as Error & { code: string; status: number };
  e.code = 'InvalidArg';
  e.status = 400;
  return e;
}

function conflict(message: string): Error {
  const e = new Error(message) as Error & { code: string; status: number };
  e.code = 'Conflict';
  e.status = 409;
  return e;
}
