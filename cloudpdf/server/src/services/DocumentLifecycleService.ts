import { randomBytes } from 'node:crypto';

import type { AdminImportSource } from '@cloudpdf/contract';

import type { DerivedRenderService } from './DerivedRenderService';
import { DocumentSecurityProbe } from './DocumentSecurityProbe';
import {
  DocumentsRepo,
  type DocumentListOptions,
  type DocumentRow,
} from '../db/repos/documents.repo';
import type { ShareGrantsRepo } from '../db/repos/share_grants.repo';
import type { TenantUsageRepo } from '../db/repos/tenant_usage.repo';
import { TenantsRepo } from '../db/repos/tenants.repo';
import type { ImportPolicy } from '../import/config/ImportPolicySchema';
import { createImportSource } from '../import/createImportSource';
import { ImportSourceError, type ImportSourceOpen } from '../import/ImportSource';
import { Semaphore } from '../import/Semaphore';
import type { UsageMeters } from '../licensing/UsageMeters';
import type { BaseFileCache, LocalFileHandle } from '../storage/BaseFileCache';
import { StorageKeys } from '../storage/keys';
import {
  ShaMismatchError,
  type ObjectBody,
  type ObjectStoreWithInfo,
  type PresignedUpload,
} from '../storage/ObjectStore';

export type DedupMode = 'always-create' | 'reuse-existing';
export type UploadPreference = 'auto' | 'presigned' | 'proxy';
export type UploadProxyPolicy = 'fallback-only' | 'allowed' | 'disabled';

/** Integrity pins for `documents.import`; enforced when present. */
export interface ImportExpected {
  sizeBytes?: number;
  sha256?: string;
}

export interface ImportInput {
  tenantId: string;
  sub: string;
  /** Wire descriptor from the request body (v1: `{ kind: 'url' }`). */
  source: AdminImportSource;
  expected?: ImportExpected | null;
  metadata?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
  dedupMode?: DedupMode;
  docId?: string | undefined;
}

/**
 * `imported` — bytes were pulled, verified, and committed.
 * `deduped`  — an existing document satisfied the request without a
 *              transfer (content dedup or idempotent replay).
 */
export type ImportResult = { tag: 'imported' | 'deduped'; doc: DocumentRow };

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
  /** Preferred transfer path. `auto` keeps object storage off the origin. */
  uploadPreference?: UploadPreference;
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
      kind: 'proxy';
      /** Path on the API the client POSTs a multipart `file` to. */
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

export interface UploadProxyInput {
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
  /**
   * Base-file cache shared with the security probe and render plane.
   * When present, commit verifies the uploaded bytes by materialising
   * them into this cache — ONE object-store read serves both the
   * sha verification and the probe that follows. Absent (admin-only
   * deploys), commit falls back to a streaming remote hash.
   */
  fileCache?: Pick<BaseFileCache, 'acquire'>;
  /** When present, commit warms the document's thumbnail (fire-and-forget). */
  derivedRenders?: DerivedRenderService;
  usageMeters?: UsageMeters;
  /** When present, fresh commits also move the per-tenant upload fact. */
  tenantUsage?: TenantUsageRepo;
  /** When present, document delete revokes the document's share grants. */
  shareGrants?: ShareGrantsRepo;
  /** Controls whether origin-mediated uploads may be selected. */
  uploadProxyPolicy?: UploadProxyPolicy;
  /**
   * Server-side pull policy for `documents.import`. Absent = imports
   * disabled (the endpoint answers 403), which keeps direct service
   * construction (tests, admin-only deploys) closed by default;
   * `buildApp` supplies the schema defaults.
   */
  importPolicy?: ImportPolicy;
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
 *                  longer pending. Verifies sha by materialising the
 *                  upload into the base-file cache (one object-store
 *                  read, reused by the security probe); falls back to
 *                  a streaming `objectStore.getSha256(key)` when no
 *                  cache is wired. Mismatch -> marks failed + throws
 *                  `InvalidArg('sha_mismatch')`.
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
  private readonly fileCache?: Pick<BaseFileCache, 'acquire'>;
  private readonly derivedRenders?: DerivedRenderService;
  private readonly usageMeters?: UsageMeters;
  private readonly tenantUsage?: TenantUsageRepo;
  private readonly shareGrants?: ShareGrantsRepo;
  private readonly uploadProxyPolicy: UploadProxyPolicy;
  private readonly importPolicy?: ImportPolicy;
  private readonly importGate: Semaphore;
  /** Single-flight per (tenant, idempotencyKey): concurrent retries share one transfer. */
  private readonly inflightImports = new Map<string, Promise<ImportResult>>();

  constructor(opts: DocumentLifecycleOptions) {
    this.documents = opts.documents;
    this.tenants = opts.tenants;
    this.storage = opts.storage;
    this.autoProvisionTenant = opts.autoProvisionTenant ?? false;
    this.securityProbe = opts.securityProbe ?? new DocumentSecurityProbe();
    this.fileCache = opts.fileCache;
    this.derivedRenders = opts.derivedRenders;
    this.usageMeters = opts.usageMeters;
    this.tenantUsage = opts.tenantUsage;
    this.shareGrants = opts.shareGrants;
    this.uploadProxyPolicy = opts.uploadProxyPolicy ?? 'fallback-only';
    if (opts.importPolicy) this.importPolicy = opts.importPolicy;
    this.importGate = new Semaphore(opts.importPolicy?.maxConcurrent ?? 1);
  }

  async init(input: InitInput): Promise<InitResult> {
    if (this.autoProvisionTenant) {
      await this.tenants.ensure({ id: input.tenantId, autoProvisioned: true });
    }

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
        this.assertSameUploadIntent(existing, input);
        // If the row is already committed, return `deduped` (no
        // upload). If pending, return `resumed` so the route hands
        // back a fresh upload URL to finish the half-finished work.
        if (existing.state === 'ready') {
          return { tag: 'deduped', doc: existing };
        }
        if (existing.state === 'failed') {
          throw conflict(
            `idempotency key ${input.idempotencyKey} belongs to failed document ${existing.id}`,
          );
        }
        if (existing.state !== 'pending') {
          throw conflict(
            `idempotency key ${input.idempotencyKey} belongs to document ${existing.id} in state ${existing.state}`,
          );
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
      expectedSha256: input.contentSha256,
      expectedSizeBytes: input.contentLength,
    });

    // A concurrent request can win the idempotency-key insert between the
    // lookup and createPending. Validate the row returned from that race too.
    if (!created.created) this.assertSameUploadIntent(created.row, input);

    return { tag: created.created ? 'created' : 'resumed', doc: created.row };
  }

  private buildUploadKey(docId: string, tenantId: string): string {
    return StorageKeys.basePdf(tenantId, docId);
  }

  /**
   * Materialize the upload artifact (presigned PUT for object storage,
   * bounded origin proxy for the fallback). Called by the admin route
   * after `init`; the route owns the proxy URL space so the
   * service stays Fastify-agnostic.
   */
  async issueUpload(
    docId: string,
    tenantId: string,
    contentLength: number,
    proxyUrlForDoc: (docId: string) => string,
    opts: { ttlSec?: number; preference?: UploadPreference } = {},
  ): Promise<InitUpload> {
    const doc = await this.documents.requireOwned(docId, tenantId);
    if (doc.state !== 'pending') {
      throw conflict(`document ${doc.id} is not pending (state=${doc.state})`);
    }
    const key = this.buildUploadKey(docId, tenantId);
    const ttl = opts.ttlSec ?? 900;
    const preference = opts.preference ?? 'auto';
    const makePresigned = () =>
      this.storage.presignUpload(key, ttl, {
        contentLength,
        contentType: 'application/pdf',
      });

    let upload: InitUpload;
    if (preference === 'proxy') {
      if (this.uploadProxyPolicy === 'disabled') {
        throw badRequest('proxy uploads are disabled by this deployment');
      }
      if (this.uploadProxyPolicy === 'fallback-only') {
        const available = await makePresigned();
        if (available) {
          throw badRequest(
            'proxy uploads are fallback-only; use the presigned upload returned by auto mode',
          );
        }
      }
      upload = { kind: 'proxy', url: proxyUrlForDoc(docId), key };
    } else {
      const presigned = await makePresigned();
      if (presigned) {
        upload = { kind: 'presigned', presigned, key };
      } else if (preference === 'presigned') {
        throw badRequest('presigned uploads are unavailable for this storage adapter');
      } else if (this.uploadProxyPolicy === 'disabled') {
        throw badRequest(
          'this storage adapter cannot issue presigned uploads and proxy uploads are disabled',
        );
      } else {
        upload = { kind: 'proxy', url: proxyUrlForDoc(docId), key };
      }
    }

    const expiresAt =
      upload.kind === 'presigned' ? upload.presigned.expiresAt : Date.now() + ttl * 1000;
    const persisted = await this.documents.setUploadIntent({
      id: docId,
      tenantId,
      kind: upload.kind,
      expiresAt,
    });
    if (!persisted) throw conflict(`document ${docId} state changed while issuing upload access`);
    return upload;
  }

  async uploadProxy(input: UploadProxyInput): Promise<{ sha256: string }> {
    const doc = await this.documents.requireOwned(input.docId, input.tenantId);
    if (doc.state !== 'pending') {
      throw conflict(`document ${doc.id} is not pending (state=${doc.state})`);
    }
    if (doc.uploadKind !== 'proxy') {
      throw conflict(`document ${doc.id} was not initialized for a proxy upload`);
    }
    if (doc.uploadExpiresAt !== null && doc.uploadExpiresAt < Date.now()) {
      throw conflict(`proxy upload access expired for document ${doc.id}; call init again`);
    }
    if (doc.expectedSizeBytes !== null && doc.expectedSizeBytes !== input.contentLength) {
      throw badRequest(
        `size_mismatch: init declared ${doc.expectedSizeBytes} bytes but proxy received ${input.contentLength}`,
      );
    }
    const key = this.buildUploadKey(doc.id, doc.tenantId);
    return this.storage.put(key, input.body, { contentLength: input.contentLength });
  }

  /**
   * `documents.import` — the server-side pull. The same lifecycle as
   * init → PUT → commit with only the transfer phase swapped: the
   * server fetches the bytes from a caller-supplied source instead of
   * the client pushing them. Synchronous and bounded by policy
   * (`maxBytes` / `timeoutMs`); the doc row is the audit record, not
   * a job queue.
   *
   * Failure model:
   *   - policy/content failures (bad source, size/sha mismatch, too
   *     large, 404/denied at the source) are TERMINAL: the row is
   *     marked failed with a sanitized reason and the call maps to 400;
   *   - transport failures (network, source 5xx, timeout, truncated
   *     stream) are RETRYABLE: the row stays pending and the call maps
   *     to 502 — retrying with the same idempotencyKey resumes the
   *     same document. Abandoned pendings fall to the sweeper.
   */
  async importFromSource(input: ImportInput): Promise<ImportResult> {
    const policy = this.importPolicy;
    if (!policy || !policy.enabled) {
      throw forbiddenError('imports are disabled on this deployment');
    }
    const pins: ResolvedImportPins = {
      expectedSha: input.expected?.sha256?.toLowerCase() ?? null,
      expectedSize: input.expected?.sizeBytes ?? null,
    };
    const dedupMode: DedupMode = input.dedupMode ?? 'always-create';
    if (dedupMode === 'reuse-existing' && !pins.expectedSha) {
      throw badRequest(
        'dedupMode=reuse-existing requires expected.sha256: without a declared hash the server cannot know what content to reuse before transferring',
      );
    }
    if (this.autoProvisionTenant) {
      await this.tenants.ensure({ id: input.tenantId, autoProvisioned: true });
    }
    if (pins.expectedSha && dedupMode === 'reuse-existing') {
      const existing = await this.documents.findByBaseSha(input.tenantId, pins.expectedSha);
      if (existing) return { tag: 'deduped', doc: existing };
    }
    if (!input.idempotencyKey) return this.importResolved(input, pins);
    // Single-flight: concurrent same-key imports share one transfer
    // instead of racing double egress at the same storage key.
    const gateKey = `${input.tenantId}:${input.idempotencyKey}`;
    const running = this.inflightImports.get(gateKey);
    if (running) return running;
    const attempt = this.importResolved(input, pins).finally(() => {
      this.inflightImports.delete(gateKey);
    });
    this.inflightImports.set(gateKey, attempt);
    return attempt;
  }

  /** Resolve idempotent replay/resume, or create the pending row. */
  private async importResolved(
    input: ImportInput,
    pins: ResolvedImportPins,
  ): Promise<ImportResult> {
    if (input.idempotencyKey) {
      const existing = await this.documents.findByIdempotencyKey(
        input.tenantId,
        input.idempotencyKey,
      );
      if (existing) return this.importOntoExisting(existing, input, pins);
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
      expectedSha256: pins.expectedSha,
      expectedSizeBytes: pins.expectedSize,
    });
    // Same race as init: a concurrent same-key insert can win between
    // the lookup and createPending. Fold onto whatever row exists.
    if (!created.created) return this.importOntoExisting(created.row, input, pins);
    return this.runImportTransfer(created.row, input, pins);
  }

  /** An idempotency key led to an existing row — replay or resume it. */
  private async importOntoExisting(
    existing: DocumentRow,
    input: ImportInput,
    pins: ResolvedImportPins,
  ): Promise<ImportResult> {
    this.assertSameImportIntent(existing, input.idempotencyKey ?? null, pins);
    if (existing.state === 'ready') return { tag: 'deduped', doc: existing };
    if (existing.state !== 'pending') {
      throw conflict(
        `idempotency key ${input.idempotencyKey} belongs to document ${existing.id} in state ${existing.state}`,
      );
    }
    if (existing.uploadKind === 'presigned' || existing.uploadKind === 'proxy') {
      throw conflict(
        `idempotency key ${input.idempotencyKey} belongs to an init-created upload; finish it via its ${existing.uploadKind} flow`,
      );
    }
    return this.runImportTransfer(existing, input, pins);
  }

  /** The transfer itself: open the source, stream into storage, commit. */
  private async runImportTransfer(
    doc: DocumentRow,
    input: ImportInput,
    pins: ResolvedImportPins,
  ): Promise<ImportResult> {
    const policy = this.importPolicy!;
    const release = await this.importGate.acquire();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), policy.timeoutMs);
    timer.unref?.();
    try {
      const marked = await this.documents.setUploadIntent({
        id: doc.id,
        tenantId: doc.tenantId,
        kind: 'pull',
        expiresAt: Date.now() + policy.timeoutMs,
      });
      if (!marked) throw conflict(`document ${doc.id} state changed while starting import`);

      let opened: ImportSourceOpen;
      try {
        const source = createImportSource(input.source, policy);
        opened = await source.open({ signal: abort.signal });
      } catch (err) {
        throw await this.importFailure(doc, err);
      }
      try {
        if (opened.contentLength > policy.maxBytes) {
          throw new ImportSourceError(
            'too_large',
            `source declares ${opened.contentLength} bytes; this deployment caps imports at ${policy.maxBytes}`,
            false,
          );
        }
        if (pins.expectedSize !== null && pins.expectedSize !== opened.contentLength) {
          throw new ImportSourceError(
            'unsupported',
            `size_mismatch: expected.sizeBytes declared ${pins.expectedSize} but the source declares ${opened.contentLength}`,
            false,
          );
        }
        // Fail fast on quota before paying for the transfer; commit
        // re-asserts both meters authoritatively.
        await this.usageMeters?.assertUploadAllowed();
        await this.usageMeters?.assertStorageAllowed(opened.contentLength);
      } catch (err) {
        opened.body.destroy();
        throw await this.importFailure(doc, err);
      }

      const key = this.buildUploadKey(doc.id, doc.tenantId);
      const onAbort = (): void => {
        opened.body.destroy(new Error('import timed out'));
      };
      abort.signal.addEventListener('abort', onAbort, { once: true });
      let observedSha: string;
      try {
        const putRes = await this.storage.put(key, opened.body, {
          contentLength: opened.contentLength,
        });
        observedSha = putRes.sha256;
      } catch (err) {
        // Truncated/over-long streams and connection resets land here.
        // The streaming put is atomic (no visible partial object), so
        // the row can stay pending for a same-key retry.
        throw await this.importFailure(
          doc,
          new ImportSourceError('upstream', `transfer failed: ${sanitizeImportDetail(err)}`, true),
        );
      } finally {
        abort.signal.removeEventListener('abort', onAbort);
      }

      if (pins.expectedSha && observedSha !== pins.expectedSha) {
        await this.documents.markFailed(doc.id, doc.tenantId, 'sha_mismatch');
        await this.storage.delete(key);
        throw badRequest(
          `sha_mismatch: expected.sha256 declared ${pins.expectedSha} but the source bytes hash to ${observedSha}`,
        );
      }
      // From here the EXISTING commit path owns verification, the
      // security probe, metering, and thumbnail warming — the import
      // pathway adds no verification machinery of its own.
      const committed = await this.commit({
        tenantId: doc.tenantId,
        docId: doc.id,
        sha256: observedSha,
      });
      return { tag: 'imported', doc: committed.doc };
    } finally {
      clearTimeout(timer);
      release();
    }
  }

  /**
   * Map a transfer-stage failure onto the row + an HTTP-shaped error.
   * Terminal failures mark the row failed (sanitized reason — never a
   * URL query string); retryable ones leave it pending for a same-key
   * resume and surface as 502.
   */
  private async importFailure(doc: DocumentRow, err: unknown): Promise<Error> {
    if (ImportSourceError.is(err)) {
      if (!err.retryable) {
        await this.documents.markFailed(
          doc.id,
          doc.tenantId,
          `import_${err.code}: ${err.message}`.slice(0, 500),
        );
      }
      const mapped = new Error(err.message) as Error & { code: string; status: number };
      if (err.retryable) {
        mapped.code = 'UpstreamError';
        mapped.status = 502;
      } else {
        mapped.code = 'InvalidArg';
        mapped.status = 400;
      }
      return mapped;
    }
    return err instanceof Error ? err : new Error(String(err));
  }

  /**
   * Import-flavoured intent check. Unlike init (which REQUIRES the
   * sha upfront), imports may omit pins — so mismatches are enforced
   * only when both sides declare a value.
   */
  private assertSameImportIntent(
    existing: DocumentRow,
    idempotencyKey: string | null,
    pins: ResolvedImportPins,
  ): void {
    const knownSha = existing.expectedSha256 ?? existing.baseSha;
    if (pins.expectedSha && knownSha && pins.expectedSha !== knownSha) {
      throw conflict(`idempotency key ${idempotencyKey} was already used for different content`);
    }
    const knownSize = existing.expectedSizeBytes ?? existing.storageSizeBytes;
    if (pins.expectedSize !== null && knownSize !== null && pins.expectedSize !== knownSize) {
      throw conflict(
        `idempotency key ${idempotencyKey} was already used for a different byte length`,
      );
    }
  }

  async commit(input: CommitInput): Promise<CommitResult> {
    const doc = await this.documents.requireOwned(input.docId, input.tenantId);
    if (doc.state === 'ready') {
      // Idempotent commit: if the existing base_sha matches, return
      // the doc unchanged; otherwise this is a programmer error. The
      // event dedupe reports counted: false here, so the tenant fact
      // never double-moves.
      if (doc.baseSha === input.sha256) {
        const recorded = await this.usageMeters?.recordUpload(doc.id, doc.createdAt);
        if (recorded?.counted) await this.tenantUsage?.recordUpload(doc.tenantId);
        return { doc };
      }
      throw conflict(`document ${doc.id} already committed with different base_sha`);
    }
    if (doc.state !== 'pending') {
      throw conflict(`document ${doc.id} is not pending (state=${doc.state})`);
    }
    if (doc.expectedSha256 !== null && doc.expectedSha256 !== input.sha256) {
      throw conflict(`commit SHA does not match the SHA pinned at init for document ${doc.id}`);
    }

    const key = this.buildUploadKey(doc.id, doc.tenantId);
    const stat = await this.storage.stat(key);
    if (!stat) {
      // Caller skipped the PUT.
      await this.documents.markFailed(doc.id, doc.tenantId, 'missing_upload');
      throw badRequest(`no bytes found at ${key}; PUT before commit`);
    }
    if (doc.expectedSizeBytes !== null && stat.size !== doc.expectedSizeBytes) {
      await this.documents.markFailed(doc.id, doc.tenantId, 'size_mismatch');
      await this.storage.delete(key);
      throw badRequest(
        `size_mismatch: init declared ${doc.expectedSizeBytes} bytes but storage contains ${stat.size}`,
      );
    }
    const declaredSha = doc.expectedSha256 ?? input.sha256;
    if (!/^[0-9a-f]{64}$/.test(declaredSha)) {
      await this.documents.markFailed(doc.id, doc.tenantId, 'sha_mismatch');
      await this.storage.delete(key);
      throw badRequest('sha_mismatch: declared sha256 must be 64 lowercase hex chars');
    }

    // Verify the uploaded bytes with a SINGLE object-store read.
    // `fileCache.acquire` materialises the object into the base-file
    // cache and hashes it on the way down (ShaMismatchError when the
    // bytes don't hash to `declaredSha`); the security probe below then
    // reuses that warm entry instead of downloading a second time.
    let baseHandle: LocalFileHandle | null = null;
    try {
      if (this.fileCache) {
        try {
          baseHandle = await this.fileCache.acquire({ sha: declaredSha, key });
        } catch (err) {
          if (err instanceof ShaMismatchError) {
            await this.documents.markFailed(doc.id, doc.tenantId, 'sha_mismatch');
            // Also remove the bad bytes so a retry isn't reading stale data.
            await this.storage.delete(key);
            throw badRequest(
              `sha_mismatch: init declared ${err.expected} but server observed ${err.actual}`,
            );
          }
          throw err;
        }
      }
      if (!baseHandle || baseHandle.sourceKey !== key) {
        // No cache wired, OR the content-addressed cache already held
        // these bytes materialised from a DIFFERENT object's key — a
        // hit proves nothing about what is stored at OUR key, so hash
        // the remote object directly (streaming, constant memory).
        const observedSha = await this.storage.getSha256(key);
        if (!observedSha) {
          await this.documents.markFailed(doc.id, doc.tenantId, 'sha_unavailable');
          throw new Error('object store could not produce SHA-256 for the uploaded bytes');
        }
        if (observedSha !== declaredSha) {
          await this.documents.markFailed(doc.id, doc.tenantId, 'sha_mismatch');
          // Also remove the bad bytes so a retry isn't reading stale data.
          await this.storage.delete(key);
          throw badRequest(
            `sha_mismatch: init declared ${declaredSha} but server observed ${observedSha}`,
          );
        }
      }

      const probe = await this.securityProbe.probe({
        key,
        expectedSha: declaredSha,
      });

      // Meter only a newly committed document. The ready/idempotent return at
      // the top of this method never reaches this path.
      await this.usageMeters?.assertUploadAllowed();
      await this.usageMeters?.assertStorageAllowed(stat.size);

      const updated = await this.documents.commit({
        id: doc.id,
        tenantId: doc.tenantId,
        baseSha: declaredSha,
        storageSizeBytes: stat.size,
        security: probe.security,
      });
      if (!updated) {
        throw conflict(`document ${doc.id} state changed during commit`);
      }
      const recorded = await this.usageMeters?.recordUpload(updated.id, updated.createdAt);
      if (recorded?.counted) await this.tenantUsage?.recordUpload(updated.tenantId);

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
            baseSha: declaredSha,
            baseKey: key,
          })
          .catch(() => undefined); // warm records `failed` itself
      }

      return { doc: updated };
    } finally {
      baseHandle?.release();
    }
  }

  private assertSameUploadIntent(existing: DocumentRow, input: InitInput): void {
    const expectedSha = existing.expectedSha256 ?? existing.baseSha;
    const expectedSize = existing.expectedSizeBytes ?? existing.storageSizeBytes;
    if (expectedSha !== null && expectedSha !== input.contentSha256) {
      throw conflict(
        `idempotency key ${input.idempotencyKey} was already used for different content`,
      );
    }
    if (expectedSize !== null && expectedSize !== input.contentLength) {
      throw conflict(
        `idempotency key ${input.idempotencyKey} was already used for a different byte length`,
      );
    }
  }

  async list(tenantId: string, opts: DocumentListOptions = {}): Promise<DocumentRow[]> {
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
    // Grants die with the document — explicitly, not via FK cascade,
    // because SQLite deployments may run without foreign_keys ON and a
    // dangling grant would be a stored 404, not a security hole (the
    // exchange re-checks the document), but still a wart in listings.
    await this.shareGrants?.deleteByDoc(docId, tenantId);
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

interface ResolvedImportPins {
  expectedSha: string | null;
  expectedSize: number | null;
}

function forbiddenError(message: string): Error {
  const e = new Error(message) as Error & { code: string; status: number };
  e.code = 'Forbidden';
  e.status = 403;
  return e;
}

/** Strip anything query-shaped so presigned credentials can't leak into reasons. */
function sanitizeImportDetail(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/\?\S*/g, '?[redacted]').slice(0, 300);
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
