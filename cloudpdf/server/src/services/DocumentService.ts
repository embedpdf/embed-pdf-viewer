import type { PageMeasurementViewport } from '@embedpdf/engine-core/runtime';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  EngineError,
  EngineErrorCode,
  decodePdfBits,
  securityStateFromProbe,
  toPageRef,
  wirePack,
  type DocumentSecurityState,
  type DocumentMetadata,
  type DocumentActionsSnapshot,
  type DocumentSecurityProbeInfo,
  type PageListSnapshot,
  type PageState,
  type PdfBits,
  type PdfSaveMode,
  type WorkerJobId,
  type WorkerResultPayload,
  type EmbeddedFileItem,
  type EmbeddedFileRef,
  type AnnotationRef,
  type WirePack,
  type WorkerRequest,
  type AnalyzeInput,
  type ChangeAnalysis,
  type SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import { DEFAULT_LAYER_NAME, wirePaths } from '@embedpdf/engine-core/wire';
import type { DocumentManifest, LayerScopes } from '@embedpdf/engine-core/wire';

import type { LayerStateService } from './LayerStateService';
import type { EngineCounters } from '../app/engine-counters';
import { pinnedLayerName, type RequestJwtContext } from '../app/jwt-plugin';
import type { BaseVersionRow, BaseVersionsRepo } from '../db/repos/base_versions.repo';
import type { DocumentsRepo, DocumentRow } from '../db/repos/documents.repo';
import type {
  PasswordSessionFacts,
  PdfPasswordSessionsRepo,
} from '../db/repos/pdf_password_sessions.repo';
import type {
  PasswordVerificationRow,
  PdfPasswordVerificationsRepo,
} from '../db/repos/pdf_password_verifications.repo';
import { runReadWithReopen, type BuildPack } from '../runtime/EnginePool';
import type { EnginePool } from '../runtime/EnginePool';
import { signPasswordGrant, verifyPasswordGrant, type PasswordSessionBinding } from '../security';
import type { BaseFileCache, LocalFileHandle } from '../storage/BaseFileCache';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';

/**
 * Public head shape returned by `GET /v1/docs/:docId/head`.
 *
 * `docVersion` is the single monotonic integer per document — bumps
 * on any mutation that could change the manifest's content (page
 * list, per-page content, per-page annotations, per-page weak-flag).
 * That makes `/manifest@docVersion=N` content-addressed and CDN-cacheable for
 * a year. `LayerService`'s mutation handlers are what bump it.
 */
export interface DocumentHead {
  id: string;
  baseSha: string;
  storageSizeBytes: number;
  /** Cache-busting integer; bumps on every content-changing mutation. */
  docVersion: number;
  /** Lifecycle state, exposed so the SDK can render "deleting" / "failed" UI. */
  state: DocumentRow['state'];
  encryption: {
    state: DocumentRow['security']['encryptionState'];
    requiresPassword: boolean | null;
  };
  permissions: {
    known: boolean;
    bits: number | null;
    allAllowed: boolean | null;
    openedAs: NonNullable<DocumentRow['security']['pdfOpenedAs']> | null;
    securityHandlerRevision: number | null;
    canUpgradeToOwner: boolean;
  };
  access: {
    required: boolean;
    reasons: Array<'password' | 'cdn' | 'permissions-unknown'>;
    endpoint?: string;
  };
}

// The manifest shape is owned by engine-core (the wire contract). Re-export
// it here so existing `@cloudpdf/server` consumers keep their import path,
// but there is a single source of truth — no server-local shadow that can
// drift from the wire type (e.g. miss `layoutVersion`).
export type { DocumentManifest } from '@embedpdf/engine-core/wire';

export interface DocumentServiceOptions {
  /** The base version catalog (migration 030): the head's row supplies the manifest's pointers and byte length. */
  baseVersions: BaseVersionsRepo;
  documents: DocumentsRepo;
  cache: BaseFileCache;
  storage: ObjectStore;
  pool: EnginePool;
  layerState: LayerStateService;
  /** Operational counters read by metrics collect closures. */
  counters?: EngineCounters;
  passwordVerifications?: PdfPasswordVerificationsRepo;
  passwordSessions?: PdfPasswordSessionsRepo;
  passwordSessionServerSecret?: { id: string; secret: string | Buffer };
  passwordSessionTtlMs?: number;
  passwordSessionRenewalTtlMs?: number;
  /**
   * When true, every /head response carries `access.required = true`
   * with `'cdn'` in `reasons` (in addition to any password-related
   * reasons). The SDK uses this to trigger /v1/access automatically
   * so it can pick up CDN-signed URLs/cookies before the first
   * cacheable read. Set when the app is built with a non-`none`
   * CdnSigner.
   */
  cdnAccessRequired?: boolean;
}

export interface OpenContext {
  tenantId: string;
  sub: string;
  jwt?: RequestJwtContext;
  /** Mutating client's engine-instance id (X-Engine-Session-Id), stored on
   *  audit rows for SSE own-echo suppression. Absent on read contexts. */
  originSessionId?: string | null;
}

export interface SavedPdfFile {
  path: string;
  size: number;
  cleanup(): Promise<void>;
}

/**
 * A decoded embedded file written to a temp path by the worker
 * (`EPDFAttachment_ExtractFile` + `FPDF_FILEWRITE` — the payload never
 * crosses the thread boundary). The route streams it and calls
 * `cleanup()`; a zero-byte attachment is a valid empty file.
 */
export interface SavedAttachmentFile {
  path: string;
  size: number;
  name: string;
  mimeType?: string;
  cleanup(): Promise<void>;
}

export interface UnlockLayerAccessInput {
  password?: string | null;
  passwordGrant?: string | null;
  mode?: 'any' | 'owner';
}

export interface UnlockLayerAccessResult {
  security: DocumentSecurityState;
  probe: DocumentSecurityProbeInfo;
  passwordGrant: string | null;
  expiresAt: number | null;
}

/**
 * Orchestrates a doc-scoped request from the moment the SDK calls
 * `/head` until the worker holds the PDFium document open.
 *
 * Pipeline for a cold-cache open:
 *   1. Lookup `documents` row, verify tenant ownership + `ready` state.
 *   2. Acquire a refcounted file handle from `BaseFileCache`.
 *      Concurrent acquirers of the same `base_sha` share one
 *      materialisation; concurrent acquirers of the same `docId` share
 *      one `EnginePool.runOpen` via this service's own
 *      singleflight map.
 *   3. Pass the materialised path to the worker via `pool.runOpen`
 *      with sticky-by-baseSha routing. The worker opens PDFium through
 *      file-backed FPDF_FILEACCESS, so Node never copies the full base
 *      into JS or worker memory.
 *   4. Keep the cache handle pinned while the worker session is open.
 *      Release it on explicit close, pool eviction, or app shutdown.
 *   5. Cache the head data so warm `/head` is a single Map lookup.
 *
 * Eviction model: when the pool evicts a `docId` from a worker slot
 * (slot-cap LRU), `onPoolEvict(evt)` flushes the head cache. The next
 * request lazily re-opens.
 */
export class DocumentService {
  private readonly documents: DocumentsRepo;
  private readonly baseVersions: BaseVersionsRepo;
  private readonly cache: BaseFileCache;
  private readonly storage: ObjectStore;
  private readonly pool: EnginePool;
  private readonly layerState: LayerStateService;
  private readonly passwordVerifications: PdfPasswordVerificationsRepo | null;
  private readonly passwordSessions: PdfPasswordSessionsRepo | null;
  private readonly passwordSessionServerSecret: { id: string; secret: string | Buffer } | null;
  private readonly passwordSessionTtlMs: number;
  private readonly passwordSessionRenewalTtlMs: number;
  private readonly cdnAccessRequired: boolean;
  private readonly heads = new Map<string, DocumentHead>();
  private readonly opens = new Map<string, Promise<DocumentHead>>();
  private readonly baseHandles = new Map<string, LocalFileHandle>();
  private readonly layerArtifactHandles = new Map<string, LocalFileHandle>();
  /**
   * The layer-session fence: sessionKey → the `layers.current_version` the
   * worker materialization embodies (0 = opened fresh, before any row).
   *
   * A worker layer session is a write-through cache of the durable layer
   * artifact. This map is what makes that cache honest: a session may only
   * serve a mutation when its entry equals the row's `current_version` —
   * otherwise it is a stale materialization from another replica's past
   * and must reload (close + reopen from the current artifact) first.
   * Absent entry = no live session (never opened, invalidated, or evicted).
   */
  private readonly layerSessionVersions = new Map<string, number>();
  private readonly layerOpens = new Map<string, Promise<void>>();
  /**
   * One marker per layer while a write op is in flight (worker mutation
   * dispatched, durable commit pending). During that window the worker
   * session holds uncommitted state — reads must not treat it as a clean
   * materialization of the current version. Never rejects; settles when
   * the write finishes either way.
   */
  private readonly layerWritesInFlight = new Map<string, Promise<void>>();
  /**
   * Engine generation captured at write-alignment time (the
   * `forWrite` door of {@link ensureLayerFreshOnPool}), consumed by
   * {@link advanceLayerSession}. Correct without per-write threading
   * because the layer write queue (`enqueueLayerWrite`) serializes
   * writes per sessionKey in-process — at most one write sits between
   * alignment and commit at any time, so the stored generation always
   * belongs to the write that is committing. Survives host restarts on
   * purpose: the stale generation is exactly the datum that detects a
   * session recreated by a reader on a new engine after the aligned
   * engine died.
   */
  private readonly writeAlignGens = new Map<string, number>();

  private readonly counters?: EngineCounters;

  constructor(opts: DocumentServiceOptions) {
    this.documents = opts.documents;
    this.baseVersions = opts.baseVersions;
    this.counters = opts.counters;
    this.cache = opts.cache;
    this.storage = opts.storage;
    this.pool = opts.pool;
    this.layerState = opts.layerState;
    this.passwordVerifications = opts.passwordVerifications ?? null;
    this.passwordSessions = opts.passwordSessions ?? null;
    this.passwordSessionServerSecret = opts.passwordSessionServerSecret ?? null;
    this.passwordSessionTtlMs = opts.passwordSessionTtlMs ?? 60 * 60 * 1000;
    this.passwordSessionRenewalTtlMs = opts.passwordSessionRenewalTtlMs ?? 60 * 60 * 1000;
    this.cdnAccessRequired = opts.cdnAccessRequired ?? false;
  }

  /**
   * Idempotent open. Returns a `DocumentHead` for `docId`. Triggers a
   * cache fetch + worker open on the first call; subsequent calls
   * for the same docId resolve from the in-memory head cache.
   *
   * Concurrent first-callers share one open via singleflight.
   */
  /**
   * The read-dispatch door: ensure (layer or base) → dispatch → one
   * reopen-retry when the session vanished between ensure and dispatch
   * (a read parked across an engine respawn). Every engine read —
   * service-internal and route-level — goes through this verb, so the
   * recovery cannot be skipped by a future call site, and routes need no
   * `EnginePool` of their own. One reopen per request is the law: a
   * second DocNotOpen means the engine respawned twice inside one
   * request, and the error handler's 503 (`EngineRestarting`) is the
   * honest answer. Mutations never use this — generation fencing and rebase own
   * their retry (see `LayerService.runWithRebase`); the password
   * bootstrap keeps its special reensure via `runReadWithReopen`.
   */
  readOnPool(
    ctx: OpenContext,
    docId: string,
    /** undefined = the base view (shared reads use no layer session). */
    layerName: string | undefined,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    return runReadWithReopen(
      () =>
        layerName !== undefined
          ? this.ensureLayerOnPool(ctx, docId, layerName)
          : this.openOnPool(ctx, docId),
      () => this.pool.run(docId, build, signal),
    );
  }

  async openOnPool(
    ctx: OpenContext,
    docId: string,
    password: string | null = null,
  ): Promise<DocumentHead> {
    const cached = this.heads.get(docId);
    // An unprotected warm session needs no password authorization. An
    // explicit password is the viewer `/v1/access` bootstrap path: its
    // caller validates that password immediately after ensuring the
    // canonical session exists.
    if (
      cached &&
      (password !== null ||
        cached.encryption.state !== 'encrypted' ||
        cached.encryption.requiresPassword !== true)
    ) {
      return cached;
    }

    const row = await this.requireReadyRow(ctx, docId);
    // Resolve and authorize this caller before consulting either the warm
    // session cache (`heads`) or the open singleflight (`opens`). Neither
    // shared map says anything about the caller's password.
    const openPassword = password ?? (await this.passwordForOpen(ctx, row, pinnedLayerName(ctx)));

    const authorizedCached = this.heads.get(docId);
    if (authorizedCached) return authorizedCached;
    return this.openCanonicalDocument(row, openPassword);
  }

  /**
   * Ensure the one canonical base session is open. A caller may join an
   * existing open only after its own authorization has completed. If the
   * other opener fails (for example, it supplied a wrong password), this
   * caller retries with its own credential instead of inheriting that
   * unrelated failure.
   */
  private async openCanonicalDocument(
    row: DocumentRow,
    password: string | null,
  ): Promise<DocumentHead> {
    for (;;) {
      const cached = this.heads.get(row.id);
      if (cached) return cached;

      const inflight = this.opens.get(row.id);
      if (inflight) {
        try {
          return await inflight;
        } catch {
          // The failed promise belonged to another caller. Once its
          // compare-and-delete cleanup runs, retry with our credential.
          continue;
        }
      }

      const promise = this.doOpen(row, password);
      this.opens.set(row.id, promise);
      try {
        const head = await promise;
        this.heads.set(row.id, head);
        return head;
      } finally {
        if (this.opens.get(row.id) === promise) this.opens.delete(row.id);
      }
    }
  }

  /**
   * Raw DB-row accessor for the document's PDFium permission bits.
   *
   * For unencrypted documents this is the right value — the bits are
   * a property of the static PDF and don't change per caller.
   *
   * For encrypted documents this is stale: the row was populated by an
   * anonymous probe at ingest, so it reflects either "no permissions"
   * (probe rejected by password) or restrictive user-mode bits, never
   * the actual bits the caller sees with their unlocked session. Route
   * guards should prefer {@link getEffectivePdfBits} which consults the
   * active password session first.
   *
   * Kept exposed as a focused primitive for cases that genuinely want
   * the document-row state regardless of session (e.g. /head's advisory
   * display before any unlock happens).
   */
  async getPdfBits(tenantId: string, docId: string) {
    return this.documents.getPdfBits(docId, tenantId);
  }

  /**
   * Authorization-aware accessor for the bits the caller's current
   * session sees. This is what route guards should use to expand
   * `pdf.permissions` and run capability/collab checks — the
   * difference matters for encrypted documents, where the DB row and
   * the post-unlock session disagree.
   *
   * Precedence (one source of truth per caller, per moment):
   *   1. Unencrypted doc                  → DB row bits
   *   2. Encrypted doc + active session   → session.pdf_permissions_bits
   *   3. Encrypted doc + no viewer session → DB row bits (typically
   *      null/restrictive); the downstream base/layer open door refuses
   *      the request before dispatching PDF work. API-token calls are
   *      stateless and authorize their header password at that same door.
   *
   * `securityFingerprint` is part of the session binding, so a
   * re-uploaded PDF (changes the fingerprint) automatically invalidates
   * the cached session — readers fall back to the new DB row bits and
   * the caller has to /access again to refresh.
   *
   * `/access` itself does not call this — it has `unlocked.probe` in
   * hand from `unlockLayerAccess`, which is the authoritative source
   * for the moment it just unlocked. Use that probe directly.
   */
  async getEffectivePdfBits(
    ctx: OpenContext,
    docId: string,
    // Default to the token's pinned layer: doc-level shared routes
    // must evaluate the claimed layer's post-unlock bits, not 'default''s.
    layerName: string = pinnedLayerName(ctx),
  ): Promise<PdfBits> {
    const row = await this.requireReadyRow(ctx, docId);
    const fromRow = decodePdfBits(row.security.pdfPermissionsBits ?? null);

    // Only encrypted documents have per-caller (post-unlock) bits. This
    // includes permission-only docs (empty user password), where an owner
    // unlock elevates the bits even though no password is needed to open.
    if (!isEncrypted(row) || !this.passwordSessions) {
      return fromRow;
    }
    // A password session is bound to the token's `jti`. Tokens without one
    // (e.g. tenant-wide tokens) can never have a session, so fall back to
    // the row bits instead of throwing from `requireJwtJti`.
    if (!ctx.jwt?.jti) {
      return fromRow;
    }
    // Prefer the active password session's post-unlock bits. openedAs
    // (user vs owner) is already reflected in the bits the worker recorded
    // at unlock time, so no extra branching here.
    const binding = this.passwordSessionBinding(ctx, row, layerName);
    const session = await this.passwordSessions.findActive(binding);
    if (session) {
      return decodePdfBits(session.pdfPermissionsBits);
    }
    return fromRow;
  }

  /**
   * Cheap DB-only head. It intentionally does not materialise the base
   * or open PDFium; ingestion owns the best-effort security probe, and
   * manifest/page endpoints own page discovery.
   */
  async getHead(ctx: OpenContext, docId: string): Promise<DocumentHead> {
    const row = await this.requireReadyRow(ctx, docId);
    const head = buildHead(row, this.cdnAccessRequired);
    void this.warm(ctx, docId).catch(() => undefined);
    return head;
  }

  private async doOpen(row: DocumentRow, password: string | null = null): Promise<DocumentHead> {
    const docId = row.id;
    const baseSha = requireBaseSha(row);

    let handle: LocalFileHandle | null = await this.acquireBaseFile(row, baseSha);
    try {
      const build = (jobId: WorkerJobId) =>
        wirePack({
          kind: 'open.layerFileBase' as const,
          jobId,
          docId,
          baseKey: baseSha,
          basePath: handle!.path,
          layer: { kind: 'fresh' as const },
          password,
          // The cache verified this hash against the bytes on disk; the
          // runtime takes it instead of hashing the file a third time.
          baseSha256: baseSha,
        });
      const result = await this.pool.runOpen(docId, baseSha, build);
      if (this.counters) this.counters.docOpens += 1;
      if (result.tag !== 'open') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected open payload: ${result.tag}`);
      }
      const head = buildHead(row, this.cdnAccessRequired);
      this.replaceBaseHandle(docId, baseSha, handle);
      handle = null;
      return head;
    } finally {
      handle?.release();
    }
  }

  /**
   * Page list manifest for the open document. Triggers an open if
   * not already cached. The manifest is the smallest piece of data
   * the SDK needs to render the page list / progressively request
   * page renders.
   */
  async getManifest(ctx: OpenContext, docId: string): Promise<DocumentManifest> {
    const head = await this.openOnPool(ctx, docId);
    const pages = await this.layerState.ensureBasePages(docId, () =>
      this.loadDurableBasePageStates(ctx, docId),
    );
    const version = await this.layerState.baseVersionFacts(
      docId,
      head.baseSha,
      head.storageSizeBytes,
    );
    return this.layerState.buildBaseManifest(head, pages, version);
  }

  async getLayerHead(ctx: OpenContext, docId: string, layerName: string): Promise<DocumentHead> {
    const head = await this.getHead(ctx, docId);
    const layer = await this.layerState.repos.layers.findByDocAndName(docId, layerName);
    // Plane-scoped warming policy: the base is always warmed (getHead above fires
    // the doc warm); the layer session is warmed iff the layer owns at
    // least one plane — a pristine layer's reads all execute on the base
    // session, so eagerly warming it would resurrect the
    // session-per-visitor explosion this policy avoids.
    if (layer) void this.warmLayerIfOwned(ctx, docId, layerName).catch(() => undefined);
    return layer ? { ...head, docVersion: layer.docVersion } : head;
  }

  /** Fire-and-forget half of the plane-scoped warming policy (see getLayerHead). */
  private async warmLayerIfOwned(
    ctx: OpenContext,
    docId: string,
    layerName: string,
  ): Promise<void> {
    const scopes = await this.layerState.computeLayerScopesFromDb(docId, layerName);
    if (Object.values(scopes).some((scope) => scope === 'layer')) {
      await this.ensureLayerOnPool(ctx, docId, layerName);
    }
  }

  /**
   * Build a layer-scoped manifest from durable state.
   *
   * A layer that has never been created/mutated has no DB rows by design,
   * so it reads as the immutable base view without creating layer state.
   */
  async getLayerManifest(
    ctx: OpenContext,
    docId: string,
    layerName: string,
  ): Promise<DocumentManifest> {
    const row = await this.requireReadyRow(ctx, docId);
    const password = await this.passwordForOpen(ctx, row, layerName);
    const head = await this.openOnPool(ctx, docId, password);
    const layer = await this.layerState.repos.layers.findByDocAndName(docId, layerName);
    const headVersion = await this.layerState.baseVersionFacts(
      docId,
      head.baseSha,
      head.storageSizeBytes,
    );
    if (!layer) {
      const pages = await this.layerState.ensureBasePages(docId, () =>
        this.loadDurableBasePageStates(ctx, docId),
      );
      // No layer row yet -> immutable base view: docVersion from head, the
      // plane pointers the HEAD version publishes (the initial epochs for a
      // never-published document) — and every plane trivially inherited,
      // so every visitor's never-written layer resolves all reads at the
      // shared base URLs.
      return this.layerState.buildLayerManifest(
        docId,
        headVersion,
        layerName,
        {
          docVersion: head.docVersion,
          layoutVersion: headVersion.layoutVersion,
          metadataVersion: headVersion.metadataVersion,
          attachmentsVersion: headVersion.attachmentsVersion,
          annotationsVersion: headVersion.annotationsVersion,
          lastAuditId: 0,
          currentVersion: 0,
          currentArtifactKey: null,
        },
        pages,
        this.layerState.computeLayerScopes(null, [], []),
      );
    }

    const basePages = await this.layerState.ensureBasePages(docId, () =>
      this.loadDurableBasePageStates(ctx, docId),
    );
    const pages = await this.layerState.ensureLayerPagesFromBase({ layerId: layer.id, docId });
    // The layer's own base version (law 2): behind the head once a sibling
    // published, until the layer is rebased.
    const layerBaseSha = layer.baseSha ?? head.baseSha;
    const layerVersion =
      layerBaseSha === head.baseSha
        ? headVersion
        : await this.layerState.baseVersionFacts(docId, layerBaseSha, null);
    // Plane scopes: annotation writes own `annotations` only (renders/
    // text/geometry keep sharing); move/rotate own `layout` only (normalized
    // artifacts survive); flatten/redaction/page-set changes own `content`;
    // a layer behind the head owns everything.
    return this.layerState.buildLayerManifest(
      docId,
      layerVersion,
      layerName,
      layer,
      pages,
      this.layerState.computeLayerScopes(layer, pages, basePages, headVersion),
    );
  }

  /**
   * Plane scopes — see
   * {@link LayerStateService.computeLayerScopesFromDb}. Exposed here so the
   * origin guards on the doc-level shared routes and `/v1/access` (the edge
   * grant) consume the exact condition the manifest `scopes` block
   * advertises.
   */
  getLayerScopes(docId: string, layerName: string): Promise<LayerScopes> {
    return this.layerState.computeLayerScopesFromDb(docId, layerName);
  }

  /**
   * Page-geometry list for a layer. Reads the live worker session via the
   * shared `pages.list` op (the same `PagesReader` the local engine
   * uses), so local and cloud return byte-identical layout. The route
   * gates freshness on the manifest's `layoutVersion`; this method only
   * produces the geometry for the current session.
   */
  async getLayerLayout(
    ctx: OpenContext,
    docId: string,
    /** Omit for the base view (shared reads use no layer session). */
    layerName?: string,
    signal?: AbortSignal,
  ): Promise<PageListSnapshot> {
    if (layerName !== undefined) await this.ensureLayerOnPool(ctx, docId, layerName);
    else await this.openOnPool(ctx, docId);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'pages.list' as const,
        jobId,
        docId,
        ...(layerName !== undefined ? { layerName } : {}),
      });
    const result = await this.readOnPool(ctx, docId, layerName, build, signal);
    if (result.tag !== 'pages.list') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected pages.list payload: ${result.tag}`,
      );
    }
    return result.snapshot;
  }

  async getLayerActions(
    ctx: OpenContext,
    docId: string,
    /** Omit for the base view (shared reads use no layer session). */
    layerName?: string,
    signal?: AbortSignal,
  ): Promise<DocumentActionsSnapshot> {
    if (layerName !== undefined) await this.ensureLayerOnPool(ctx, docId, layerName);
    else await this.openOnPool(ctx, docId);
    const result = await this.readOnPool(
      ctx,
      docId,
      layerName,
      (jobId) =>
        wirePack({
          kind: 'actions.read' as const,
          jobId,
          docId,
          ...(layerName !== undefined ? { layerName } : {}),
        }),
      signal,
    );
    if (result.tag !== 'actions.read') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected actions.read payload: ${result.tag}`,
      );
    }
    return result.snapshot;
  }

  /**
   * Ensure a fresh layer session before dispatching worker ops — the read
   * path door. Freshness is judged per request against the layer row (one
   * PK SELECT — noise next to any PDF op): a session left behind at an
   * older version is a stale materialization from this replica's past and
   * reloads before it may serve. This request-time check is what keeps
   * multi-replica reads truthful without any bus coordination — the
   * client's manifest is DB-fresh, so the worker must be too, or a stale
   * replica would serve wrong bytes under a current, immutable,
   * CDN-cacheable version pin.
   *
   * (The write path calls {@link ensureLayerFreshOnPool} directly with the
   * row it already read — alignment must target the exact row the commit
   * CAS will compare against, never a second read.)
   */
  async ensureLayerOnPool(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    password: string | null = null,
  ): Promise<void> {
    // Park behind any in-flight write first: its uncommitted worker state
    // must never be served as a clean materialization, and the layer row
    // must be read after the write settles or the freshness compare would
    // force a pointless reload on every awaited commit.
    await this.awaitLayerWriteSettled(layerSessionKey(docId, layerName));
    const layer = await this.layerState.repos.layers.findByDocAndName(docId, layerName);
    await this.ensureLayerFreshOnPool(ctx, docId, layerName, layer?.currentVersion ?? 0, password);
  }

  /**
   * Version-fenced sibling of {@link ensureLayerOnPool} — the write-path
   * door. `currentVersion` is the `layers.current_version` the caller just
   * read from durable truth. If the live session's materialized version
   * differs, the session is a stale replica-local cache (another replica
   * advanced the layer) and is reloaded — close + reopen from the current
   * artifact — before the caller may dispatch worker mutations. This
   * alignment is what makes the commit-time version CAS a real fence: after
   * it, the only way the CAS can fail is a remote commit inside the
   * prepare→commit window.
   */
  async ensureLayerFreshOnPool(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    currentVersion: number,
    password: string | null = null,
    opts: { forWrite?: boolean } = {},
  ): Promise<void> {
    const key = layerSessionKey(docId, layerName);
    // Write alignment records the engine generation the aligned session
    // lives under — the datum advanceLayerSession later compares against
    // the then-current generation to refuse blessing a session that was
    // recreated on a new engine after this one died mid-commit.
    const recordAlignment = () => {
      if (opts.forWrite) this.writeAlignGens.set(key, this.pool.generationFor(docId));
    };
    const row = await this.requireReadyRow(ctx, docId);
    // Authorization must happen before the layer-session freshness cache
    // can return. A fresh worker session belongs to the document, not to
    // the caller that happened to open it.
    const openPassword = password ?? (await this.passwordForOpen(ctx, row, layerName));
    // Let any in-flight open/reload settle before judging freshness.
    const existing = this.layerOpens.get(key);
    if (existing) await existing.catch(() => undefined);
    if (this.layerSessionVersions.get(key) === currentVersion) {
      recordAlignment();
      return;
    }
    await this.reloadLayerOnPool(ctx, docId, layerName, openPassword);
    recordAlignment();
  }

  /** Mark a layer session stale: the next fresh-ensure reloads it. */
  invalidateLayerSession(docId: string, layerName: string): void {
    this.layerSessionVersions.delete(layerSessionKey(docId, layerName));
  }

  /**
   * Mark a layer write in flight. The write pipeline calls this around the
   * whole mutation op (worker apply → upload → commit); reads use the
   * marker to park until the dirty window closes. Returns the settle
   * function; idempotent and never throws.
   */
  beginLayerWrite(docId: string, layerName: string): () => void {
    const key = layerSessionKey(docId, layerName);
    let settle!: () => void;
    const marker = new Promise<void>((resolve) => (settle = resolve));
    this.layerWritesInFlight.set(key, marker);
    return () => {
      if (this.layerWritesInFlight.get(key) === marker) {
        this.layerWritesInFlight.delete(key);
      }
      settle();
    };
  }

  /**
   * Park until no layer write is in flight — bounded to two rounds so a
   * continuous write stream cannot starve reads: after the bound, the
   * request-time freshness check plus the routes' pinned-read
   * re-validation still guarantee no uncommitted content is served under
   * a version pin; the barrier exists to make that the rare path, not the
   * only defense.
   */
  private async awaitLayerWriteSettled(key: string): Promise<void> {
    for (let round = 0; round < 2; round++) {
      const marker = this.layerWritesInFlight.get(key);
      if (!marker) return;
      await marker;
    }
  }

  /**
   * Record that the live session now embodies `version` — called by the
   * layer write pipeline after its commit transaction wins the CAS (the
   * worker applied the mutation, so its state is the new version). Guarded
   * on the entry still existing: if the pool evicted the doc mid-commit,
   * the worker session is gone and must not be resurrected as "fresh".
   */
  advanceLayerSession(docId: string, layerName: string, version: number): void {
    const key = layerSessionKey(docId, layerName);
    const alignedGen = this.writeAlignGens.get(key);
    this.writeAlignGens.delete(key);
    // Existing law: if the pool evicted the doc mid-commit, the worker
    // session is gone and must not be resurrected as "fresh".
    if (!this.layerSessionVersions.has(key)) return;
    // Completed law (host mode): the session that applied this write
    // lived under `alignedGen`. If the engine has respawned since, any
    // session that exists now was opened from the pre-commit artifact —
    // a reader recreating the entry must not get it blessed with the
    // committed version. Invalidate; the next touch reloads at the new
    // durable head. (Inline pool: generation is constant 0, this branch
    // is unreachable, pre-host semantics bit-identical.)
    if (alignedGen === undefined || alignedGen !== this.pool.generationFor(docId)) {
      this.layerSessionVersions.delete(key);
      return;
    }
    this.layerSessionVersions.set(key, version);
  }

  /** Close-then-reopen a layer session at the current durable artifact. */
  private reloadLayerOnPool(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    password: string | null,
  ): Promise<void> {
    const key = layerSessionKey(docId, layerName);
    const existing = this.layerOpens.get(key);
    if (existing) return existing;
    const promise = (async () => {
      await this.closeLayerOnPool(docId, layerName);
      await this.openLayerOnPool(ctx, docId, layerName, password);
    })().finally(() => {
      this.layerOpens.delete(key);
    });
    this.layerOpens.set(key, promise);
    return promise;
  }

  /**
   * Drop one layer session: forget its fence entry, tell the worker to
   * close the session (`layer.close` is idempotent and layer-scoped — the
   * base document, sibling layers, and the pool binding stay intact), and
   * release the pinned artifact file handle.
   */
  private async closeLayerOnPool(docId: string, layerName: string): Promise<void> {
    const key = layerSessionKey(docId, layerName);
    this.layerSessionVersions.delete(key);
    try {
      await this.pool.run(docId, (jobId) =>
        wirePack({ kind: 'layer.close' as const, jobId, docId, layerName }),
      );
    } catch (err) {
      // DocNotOpen = the pool evicted the doc (or it was never opened on
      // this replica): there is no worker session to close. Anything else
      // is a real failure.
      if (!(err instanceof EngineError && err.code === EngineErrorCode.DocNotOpen)) {
        throw err;
      }
    }
    this.releaseLayerArtifactHandle(key);
  }

  async readPageViewports(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    signal?: AbortSignal,
  ): Promise<PageMeasurementViewport[]> {
    await this.ensureLayerOnPool(ctx, docId, layerName);
    const result = await this.readOnPool(
      ctx,
      docId,
      layerName,
      (jobId: WorkerJobId) =>
        wirePack({
          kind: 'measure.viewports' as const,
          jobId,
          docId,
          layerName,
          page: toPageRef(pageObjectNumber),
        }),
      signal,
    );
    if (result.tag !== 'measure.viewports')
      throw new EngineError(EngineErrorCode.WireFormat, 'Unexpected viewport response');
    return result.viewports;
  }

  async readLayerMetadata(
    ctx: OpenContext,
    docId: string,
    /** Omit for the base view (shared reads use no layer session). */
    layerName?: string,
    signal?: AbortSignal,
  ): Promise<DocumentMetadata> {
    if (layerName !== undefined) await this.ensureLayerOnPool(ctx, docId, layerName);
    else await this.openOnPool(ctx, docId);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'metadata.read' as const,
        jobId,
        docId,
        ...(layerName !== undefined ? { layerName } : {}),
      });
    const result = await this.readOnPool(ctx, docId, layerName, build, signal);
    if (result.tag !== 'metadata.read') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected metadata payload: ${result.tag}`,
      );
    }
    return result.metadata;
  }

  /**
   * The layer's signature snapshot, read through the session's working copy
   * (decision 18: the server session keeps every committed edit in memory,
   * so its working copy is the layer's durable state). Ensures the session
   * embodies the durable layer version first — a read never validates
   * freshness by itself, and a session left over from before a publish
   * on another replica would otherwise describe the old base.
   */
  async readLayerSignatures(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    signal?: AbortSignal,
  ): Promise<SignatureSnapshot> {
    await this.ensureLayerOnPool(ctx, docId, layerName);
    const result = await this.readOnPool(
      ctx,
      docId,
      layerName,
      (jobId: WorkerJobId) =>
        wirePack({ kind: 'signatures.list' as const, jobId, docId, layerName, workingCopy: true }),
      signal,
    );
    if (result.tag !== 'signatures.list') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${result.tag}`);
    }
    return result.snapshot;
  }

  /** The layer's pending edits judged against its base; same freshness rule as {@link readLayerSignatures}. */
  async analyzeLayerSignatures(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    input: AnalyzeInput,
    signal?: AbortSignal,
  ): Promise<ChangeAnalysis> {
    await this.ensureLayerOnPool(ctx, docId, layerName);
    const result = await this.readOnPool(
      ctx,
      docId,
      layerName,
      (jobId: WorkerJobId) =>
        wirePack({ kind: 'signatures.analyze' as const, jobId, docId, layerName, input }),
      signal,
    );
    if (result.tag !== 'signatures.analyze') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${result.tag}`);
    }
    return result.analysis;
  }

  /**
   * Pre-warm hook for the `/v1/warm` route. Forces the materialise +
   * worker open before the first user request lands, so the user's
   * first call is the warm path (~microseconds).
   */
  async warm(ctx: OpenContext, docId: string): Promise<DocumentHead> {
    return this.openOnPool(ctx, docId);
  }

  async unlockLayerAccess(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    input: UnlockLayerAccessInput,
  ): Promise<UnlockLayerAccessResult> {
    const row = await this.requireReadyRow(ctx, docId);
    const password = input.password ?? null;
    const mode = input.mode ?? 'any';
    const now = Date.now();

    // Unencrypted documents have no password concept; their bits are a
    // static property of the PDF and never vary per caller.
    if (!isEncrypted(row)) {
      return this.unlockedWithoutPassword(row);
    }

    if (!password) {
      // Only an existing grant can be renewed without a password. Compute
      // the binding lazily so anonymous access to a permission-only doc
      // (no `jti` claim) is not forced through `requireJwtJti`.
      if (input.passwordGrant) {
        const binding = this.passwordSessionBinding(ctx, row, layerName);
        const renewed = await this.tryRenewFromPasswordGrant(
          ctx,
          binding,
          input.passwordGrant,
          now,
        );
        if (renewed) return renewed;
      }
      // A user password is mandatory just to open the document → prompt.
      if (requiresPasswordSession(row)) {
        throw new EngineError(EngineErrorCode.DocPasswordRequired, 'document password required');
      }
      // Permission-only encryption (empty user password): no password and
      // no grant means "baseline". Revoke any active (owner) session so the
      // anonymous response we return matches what reads will now enforce —
      // otherwise the session would keep granting elevated bits via
      // getEffectivePdfBits while this response claims a downgrade.
      if (this.passwordSessions && ctx.jwt?.jti) {
        await this.passwordSessions.revoke(this.passwordSessionBinding(ctx, row, layerName));
      }
      return this.unlockedWithoutPassword(row);
    }

    // A password was supplied: verify it (this is also how an owner
    // password upgrades a permission-only doc). Persisting the resulting
    // session requires `unlock_key` + `jti`; absent claims surface as a
    // clear error rather than a silent no-op.
    const binding = this.passwordSessionBinding(ctx, row, layerName);
    const cached = await this.tryCachedPasswordVerification(ctx, row, binding, password, mode, now);
    if (cached) return cached;

    // Cache miss. If both the user and owner passwords are already known,
    // a non-matching password is provably wrong — reject without the worker.
    await this.rejectIfPasswordProvablyWrong(ctx, row, now);

    return this.openAndVerifyPassword(ctx, row, layerName, binding, password, mode, now);
  }

  private unlockedWithoutPassword(row: DocumentRow): UnlockLayerAccessResult {
    const probe = securityInfoFromDocumentRow(row);
    return this.accessResultFromProbe(probe, null, null);
  }

  private async tryRenewFromPasswordGrant(
    ctx: OpenContext,
    binding: PasswordSessionBinding,
    passwordGrant: string | null | undefined,
    now: number,
  ): Promise<UnlockLayerAccessResult | null> {
    if (!passwordGrant || !this.passwordSessions) return null;
    const grant = verifyPasswordGrant({
      grant: passwordGrant,
      binding,
      now,
      serverSecret: this.passwordGrantServerSecret(),
    });
    if (!grant) return null;

    const renewed = await this.passwordSessions.renew(
      binding,
      this.boundSessionExpiry(ctx, now, this.passwordSessionTtlMs),
      this.boundSessionExpiry(ctx, now, this.passwordSessionRenewalTtlMs),
      now,
    );
    if (!renewed) return null;

    return this.accessResultFromProbe(
      securityInfoFromPasswordSession(renewed),
      this.issuePasswordGrant(binding, ctx, now),
      renewed.activeExpiresAt,
    );
  }

  private async tryCachedPasswordVerification(
    ctx: OpenContext,
    row: DocumentRow,
    binding: PasswordSessionBinding,
    password: string,
    mode: 'any' | 'owner',
    now: number,
  ): Promise<UnlockLayerAccessResult | null> {
    const cached = await this.findCachedPasswordVerification(ctx, row, password, mode);
    if (!cached) return null;

    const probe = securityInfoFromCachedVerification(cached);
    await this.persistPasswordSession(ctx, binding, password, factsFromCachedVerification(cached));
    return this.accessResultFromProbe(
      probe,
      this.issuePasswordGrant(binding, ctx, now),
      this.boundSessionExpiry(ctx, now, this.passwordSessionTtlMs),
    );
  }

  /**
   * Authentication-neutral lookup of a verified password proof. The proof
   * is bound to tenant + document + base SHA + security fingerprint +
   * password, but deliberately not to a JWT. Viewer callers layer their
   * JWT-bound password session on top; API-token callers use the proof
   * directly for this request.
   */
  private async findCachedPasswordVerification(
    ctx: OpenContext,
    row: DocumentRow,
    password: string,
    mode: 'any' | 'owner',
  ): Promise<PasswordVerificationRow | null> {
    if (!this.passwordVerifications) return null;
    const cached = await this.passwordVerifications.findValid({
      tenantId: ctx.tenantId,
      docId: row.id,
      baseSha: requireBaseSha(row),
      securityFingerprint: securityFingerprint(row),
      password,
    });
    if (cached) this.assertPasswordMode(mode, cached.openedAs);
    return cached;
  }

  /**
   * Reject a supplied password without consulting the worker when it is
   * provably wrong. A standard PDF security handler has at most one user
   * and one owner password, and `pdf_password_verifications` only stores
   * verified-good facts. So once both passwords are known, a password that
   * missed the per-password cache cannot be valid.
   *
   *   - owner known: a cached verification with `openedAs === 'owner'`.
   *   - user known: empty user password (`encryptionRequiresPassword === false`)
   *     or a cached verification with `openedAs === 'user'`.
   *
   * No-ops (falls through to the worker) when verification storage is
   * absent or knowledge is incomplete.
   */
  private async rejectIfPasswordProvablyWrong(
    ctx: OpenContext,
    row: DocumentRow,
    now: number,
  ): Promise<void> {
    if (!this.passwordVerifications) return;
    const known = await this.passwordVerifications.knownOpenedAs(
      {
        tenantId: ctx.tenantId,
        docId: row.id,
        baseSha: requireBaseSha(row),
        securityFingerprint: securityFingerprint(row),
      },
      now,
    );
    const ownerKnown = known.has('owner');
    const userKnown = row.security.encryptionRequiresPassword === false || known.has('user');
    if (ownerKnown && userKnown) {
      throw new EngineError(EngineErrorCode.DocPasswordIncorrect, 'incorrect document password');
    }
  }

  private async openAndVerifyPassword(
    ctx: OpenContext,
    row: DocumentRow,
    layerName: string,
    binding: PasswordSessionBinding,
    password: string,
    mode: 'any' | 'owner',
    now: number,
  ): Promise<UnlockLayerAccessResult> {
    await this.ensureLayerOnPool(ctx, row.id, layerName, password);
    const { probe, facts } = await this.checkPasswordOnOpenDocument(
      ctx,
      row,
      password,
      mode,
      layerName,
    );
    await this.persistPasswordSession(ctx, binding, password, facts);

    return this.accessResultFromProbe(
      probe,
      this.issuePasswordGrant(binding, ctx, now),
      this.boundSessionExpiry(ctx, now, this.passwordSessionTtlMs),
    );
  }

  /**
   * Validate a candidate against an already-open PDFium session without
   * mutating that session's active password or permissions. The runtime
   * command uses `CheckPasswordNoMutate`; this is the cache-miss path for
   * both viewer unlock and stateless API-token authorization.
   */
  private async checkPasswordOnOpenDocument(
    ctx: OpenContext,
    row: DocumentRow,
    password: string,
    mode: 'any' | 'owner',
    layerName?: string,
  ): Promise<{ probe: DocumentSecurityProbeInfo; facts: PasswordSessionFacts }> {
    const result = await runReadWithReopen(
      // Re-establish the canonical session with the supplied password —
      // the explicit-password bootstrap path — then re-check.
      () => this.openOnPool(ctx, row.id, password),
      () =>
        this.pool.run(row.id, (jobId) =>
          wirePack({
            kind: 'document.checkPasswordPermissions' as const,
            jobId,
            docId: row.id,
            ...(layerName !== undefined ? { layerName } : {}),
            password,
            mode,
          }),
        ),
    );
    if (result.tag !== 'document.checkPasswordPermissions') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected security payload: ${result.tag}`,
      );
    }
    this.assertPasswordMode(mode, result.security.pdfOpenedAs ?? 'none');

    const facts = factsFromProbe(result.security);
    if (!facts) {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        'password verification returned no PDF permission facts',
      );
    }
    if (this.passwordVerifications) {
      await this.passwordVerifications.upsert(
        {
          tenantId: ctx.tenantId,
          docId: row.id,
          baseSha: requireBaseSha(row),
          securityFingerprint: securityFingerprint(row),
          password,
        },
        facts,
      );
    }
    return { probe: result.security, facts };
  }

  private assertPasswordMode(mode: 'any' | 'owner', openedAs: 'none' | 'user' | 'owner'): void {
    if (mode === 'owner' && openedAs !== 'owner') {
      throw new EngineError(EngineErrorCode.DocPasswordIncorrect, 'owner password required');
    }
  }

  private accessResultFromProbe(
    probe: DocumentSecurityProbeInfo,
    passwordGrant: string | null,
    expiresAt: number | null,
  ): UnlockLayerAccessResult {
    return {
      probe,
      security: securityStateFromProbe(probe, { accessEndpoint: '/v1/access' }),
      passwordGrant,
      expiresAt,
    };
  }

  async assertPasswordSession(ctx: OpenContext, docId: string, layerName: string): Promise<void> {
    const row = await this.requireReadyRow(ctx, docId);
    if (!requiresPasswordSession(row)) return;
    await this.passwordForOpen(ctx, row, layerName);
  }

  private async passwordForOpen(
    ctx: OpenContext,
    row: DocumentRow,
    layerName: string,
  ): Promise<string | null> {
    if (!requiresPasswordSession(row)) return null;

    // API-token requests are stateless. A matching HMAC proof authorizes
    // the request immediately; on a miss, validate against the one live
    // canonical PDFium session (opening that same session if the document
    // is cold), then populate the proof cache. No JWT session is created.
    if (ctx.sub === 'api-token') {
      const password = ctx.jwt?.docPassword;
      if (!password) {
        throw new EngineError(
          EngineErrorCode.DocPasswordRequired,
          'document is password-protected: supply X-Document-Password (base64) with the api token',
        );
      }
      const cached = await this.findCachedPasswordVerification(ctx, row, password, 'any');
      if (cached) return password;

      await this.openCanonicalDocument(row, password);
      await this.checkPasswordOnOpenDocument(ctx, row, password, 'any');
      return password;
    }

    // Viewer requests keep the JWT-bound, KMS-encrypted password-session
    // flow established by `/v1/access`.
    this.requirePasswordSessionInfrastructure();
    const binding = this.passwordSessionBinding(ctx, row, layerName);
    const password = await this.passwordSessions!.decryptActivePassword(
      binding,
      this.requireUnlockKey(ctx),
    );
    if (!password) {
      throw new EngineError(EngineErrorCode.DocPasswordRequired, 'document password required');
    }
    return password;
  }

  private async persistPasswordSession(
    ctx: OpenContext,
    binding: PasswordSessionBinding,
    password: string,
    facts: PasswordSessionFacts,
  ): Promise<void> {
    this.requirePasswordSessionInfrastructure();
    const now = Date.now();
    await this.passwordSessions!.upsertFromPassword({
      binding,
      password,
      unlockKey: this.requireUnlockKey(ctx),
      facts,
      activeExpiresAt: this.boundSessionExpiry(ctx, now, this.passwordSessionTtlMs),
      renewableUntil: this.boundSessionExpiry(ctx, now, this.passwordSessionRenewalTtlMs),
    });
  }

  private passwordSessionBinding(
    ctx: OpenContext,
    row: DocumentRow,
    layerName: string,
  ): PasswordSessionBinding {
    return {
      tenantId: ctx.tenantId,
      docId: row.id,
      layerName,
      sub: ctx.sub,
      jwtJti: this.requireJwtJti(ctx),
      baseSha: requireBaseSha(row),
      securityFingerprint: securityFingerprint(row),
    };
  }

  private issuePasswordGrant(
    binding: PasswordSessionBinding,
    ctx: OpenContext,
    now: number,
  ): string {
    return signPasswordGrant({
      binding,
      expiresAt: this.boundSessionExpiry(ctx, now, this.passwordSessionTtlMs),
      renewableUntil: this.boundSessionExpiry(ctx, now, this.passwordSessionRenewalTtlMs),
      serverSecret: this.passwordGrantServerSecret(),
    });
  }

  private boundSessionExpiry(ctx: OpenContext, now: number, ttlMs: number): number {
    const jwtExp = ctx.jwt?.exp ? ctx.jwt.exp * 1000 : null;
    const ttlExp = now + ttlMs;
    return jwtExp ? Math.min(jwtExp, ttlExp) : ttlExp;
  }

  private requirePasswordSessionInfrastructure(): void {
    if (!this.passwordSessions || !this.passwordSessionServerSecret) {
      throw new EngineError(
        EngineErrorCode.DocPasswordRequired,
        'encrypted PDF access requires password session storage',
      );
    }
  }

  private passwordGrantServerSecret(): { id: string; secret: string | Buffer } {
    if (!this.passwordSessionServerSecret) {
      throw new EngineError(
        EngineErrorCode.DocPasswordRequired,
        'encrypted PDF access requires password session storage',
      );
    }
    return this.passwordSessionServerSecret;
  }

  private requireJwtJti(ctx: OpenContext): string {
    const jti = ctx.jwt?.jti;
    if (!jti) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        'encrypted PDF access requires a doc token with jti',
        { details: { required: 'jti' } },
      );
    }
    return jti;
  }

  private requireUnlockKey(ctx: OpenContext): string {
    const unlockKey = ctx.jwt?.unlockKey;
    if (!unlockKey) {
      throw new EngineError(
        EngineErrorCode.Forbidden,
        'encrypted PDF access requires a token embedpdf.unlock_key claim',
        { details: { required: 'embedpdf.unlock_key' } },
      );
    }
    return unlockKey;
  }

  private async requireReadyRow(ctx: OpenContext, docId: string): Promise<DocumentRow> {
    const row = await this.documents.requireOwned(docId, ctx.tenantId);
    if (row.state === 'pending') {
      throw new EngineError(
        EngineErrorCode.DocOpenFailed,
        `document is still pending upload: ${docId}`,
      );
    }
    if (row.state === 'failed') {
      throw new EngineError(
        EngineErrorCode.DocOpenFailed,
        `document failed at commit: ${docId} (${row.failureReason ?? 'unknown'})`,
      );
    }
    if (row.state === 'deleting') {
      throw new EngineError(EngineErrorCode.NotFound, `document is being deleted: ${docId}`);
    }
    if (row.state !== 'ready') {
      throw new EngineError(EngineErrorCode.DocOpenFailed, `document not ready: ${row.state}`);
    }
    if (!row.baseSha) {
      throw new EngineError(
        EngineErrorCode.DocOpenFailed,
        `document is ready but has no base_sha: ${docId}`,
      );
    }
    return row;
  }

  /**
   * Export the listed pages, in caller order, as a standalone PDF. A read
   * over the current layer state (the worker's `pages.extract` is a scratch
   * copy — the source document is untouched), so there is no write queue,
   * no artifact, and no audit row. Extracted subsets are bounded by the
   * page selection, so the bytes cross the worker boundary directly rather
   * than through the file-backed download path.
   */
  async extractLayerPages(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    pageObjectNumbers: number[],
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    await this.ensureLayerOnPool(ctx, docId, layerName);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'pages.extract' as const,
        jobId,
        docId,
        layerName,
        pages: pageObjectNumbers.map(toPageRef),
      });
    const result = await this.pool.run(docId, build, signal);
    if (result.tag !== 'pages.extract') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected pages.extract payload: ${result.tag}`,
      );
    }
    return new Uint8Array(result.bytes);
  }

  /**
   * The chosen annotations' normal appearances as one single-page PDF —
   * `pages.extract`'s sibling for the annotation plane: a read over the
   * current layer state (the worker flattens into a scratch document; the
   * source is untouched), so no write queue, no artifact, no audit row.
   */
  async exportAnnotationAppearance(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    refs: AnnotationRef[],
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    await this.ensureLayerOnPool(ctx, docId, layerName);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.exportAppearance' as const,
        jobId,
        docId,
        layerName,
        page: toPageRef(pageObjectNumber),
        refs,
      });
    const result = await this.pool.run(docId, build, signal);
    if (result.tag !== 'annotations.exportAppearance') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected annotations.exportAppearance payload: ${result.tag}`,
      );
    }
    return new Uint8Array(result.bytes);
  }

  /**
   * An annotation's `appearance` resource: its drawing as a one-page PDF,
   * before the fit, rotation and opacity its data describes. A read like
   * {@link exportAnnotationAppearance}.
   */
  async readAnnotationAppearance(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    ref: AnnotationRef,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    await this.ensureLayerOnPool(ctx, docId, layerName);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'annotations.readAppearance' as const,
        jobId,
        docId,
        layerName,
        page: toPageRef(pageObjectNumber),
        ref,
      });
    const result = await this.pool.run(docId, build, signal);
    if (result.tag !== 'annotations.readAppearance') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected annotations.readAppearance payload: ${result.tag}`,
      );
    }
    return new Uint8Array(result.bytes);
  }

  async saveLayerDownloadToTemp(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    mode: PdfSaveMode,
    signal?: AbortSignal,
  ): Promise<SavedPdfFile> {
    await this.ensureLayerOnPool(ctx, docId, layerName);
    const dir = await mkdtemp(join(tmpdir(), 'embedpdf-download-'));
    const path = join(dir, `${safeFilePart(docId)}-${safeFilePart(layerName)}.pdf`);

    try {
      // Cloud downloads use file-backed FPDF_FILEWRITE so large PDFs never cross
      // the worker boundary as ArrayBuffers. Fastify streams this completed temp
      // file and the returned cleanup callback removes the whole temp directory.
      const build = (jobId: WorkerJobId) =>
        wirePack({
          kind: 'document.saveFile' as const,
          jobId,
          docId,
          layerName,
          mode,
          path,
        });
      const result = await this.readOnPool(ctx, docId, layerName, build, signal);
      if (result.tag !== 'document.saveFile') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected save payload: ${result.tag}`);
      }
      if (result.path !== path) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `worker saved unexpected path: ${result.path}`,
        );
      }

      const info = await stat(path);
      if (!info.isFile() || info.size <= 0) {
        throw new EngineError(EngineErrorCode.DocOpenFailed, `saved PDF is empty: ${docId}`);
      }

      let cleaned = false;
      return {
        path,
        size: info.size,
        async cleanup() {
          if (cleaned) return;
          cleaned = true;
          await rm(dir, { recursive: true, force: true });
        },
      };
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  /**
   * The engine host died: every worker session, materialization, and
   * pinned handle it embodied is gone. Drop the engine-plane caches; the
   * next request lazily rebuilds from durable truth (DB + object store),
   * which the write-generation fence makes correct by construction.
   *
   * Deliberately untouched:
   *  - `opens` / `layerOpens`: their in-flight promises are rejecting
   *    right now and their own settle paths remove their own entries —
   *    clearing here would aba-delete a next flight that reused the key.
   *  - `layerWritesInFlight`: the durable-commit window is API-side work
   *    that survives host death; readers must keep parking behind it
   *    until the owning pipeline settles it (it always settles).
   *  - `writeAlignGens`: the stale generation is the datum that lets
   *    `advanceLayerSession` refuse to bless a recreated session.
   */
  onHostRestart(scope?: { docIds: ReadonlySet<string> }): void {
    if (scope === undefined) {
      // Full clear — the K=1 path and the always-safe fallback.
      this.heads.clear();
      this.layerSessionVersions.clear();
      this.releaseAllBaseHandles();
      return;
    }
    // Scoped by shard: one shard died — forget exactly its residents, and
    // touch exactly what the full clear touches, nothing more. `opens`/
    // `layerOpens` settle via compare-and-delete (clearing them re-opens
    // the aba window); `layerWritesInFlight` is API-side write state;
    // `writeAlignGens` stays — the fence fails closed on a missing entry,
    // so leaving it is discipline, not necessity. Deliberately not
    // `forgetLayerSessions()`: that is evict-path behavior and deletes
    // `layerOpens`.
    for (const docId of scope.docIds) {
      this.heads.delete(docId);
      this.releaseBaseHandles(docId);
      const prefix = `${docId}::`;
      for (const key of Array.from(this.layerSessionVersions.keys())) {
        if (key.startsWith(prefix)) this.layerSessionVersions.delete(key);
      }
      for (const key of Array.from(this.layerArtifactHandles.keys())) {
        if (key.startsWith(prefix)) this.releaseLayerArtifactHandle(key);
      }
    }
  }

  /**
   * Pool-eviction callback. Wired into `EnginePool.onEvict`;
   * when the pool drops a doc from a slot, the cached head is no
   * longer authoritative (the next request must trigger a re-open).
   */
  onPoolEvict(evt: { docId: string }): void {
    this.heads.delete(evt.docId);
    this.forgetLayerSessions(evt.docId);
    this.releaseBaseHandles(evt.docId);
  }

  /**
   * Decompression-bomb guard for attachment extraction: the worker's
   * flate sink stops decoding past this many decoded bytes (on the
   * thread-confined runtime an unbounded decode would take every doc
   * pinned to that worker down with it).
   */
  private static readonly MAX_DECODED_ATTACHMENT_BYTES = 1 << 30; // 1 GiB

  /** Snapshot of the layer's `/EmbeddedFiles` name tree, in tree order. */
  async listAttachments(
    ctx: OpenContext,
    docId: string,
    /** Omit for the base view (shared reads use no layer session). */
    layerName?: string,
    signal?: AbortSignal,
  ): Promise<EmbeddedFileItem[]> {
    if (layerName !== undefined) await this.ensureLayerOnPool(ctx, docId, layerName);
    else await this.openOnPool(ctx, docId);
    const build = (jobId: WorkerJobId) =>
      wirePack({
        kind: 'attachments.list' as const,
        jobId,
        docId,
        ...(layerName !== undefined ? { layerName } : {}),
      });
    const payload = await this.readOnPool(ctx, docId, layerName, build, signal);
    if (payload.tag !== 'attachments.list') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected attachments.list payload: ${payload.tag}`,
      );
    }
    return payload.items;
  }

  /** Decode one document-level embedded file (by key) to a temp path.
   *  Omit `layerName` for the base view's shared reads. */
  async readAttachmentFileToTemp(
    ctx: OpenContext,
    docId: string,
    layerName: string | undefined,
    ref: EmbeddedFileRef,
    signal?: AbortSignal,
  ): Promise<SavedAttachmentFile> {
    return this.readFileToTemp(ctx, docId, layerName, signal, (jobId, path) =>
      wirePack({
        kind: 'attachments.readFile' as const,
        jobId,
        docId,
        ...(layerName !== undefined ? { layerName } : {}),
        ref,
        path,
        maxDecodedBytes: DocumentService.MAX_DECODED_ATTACHMENT_BYTES,
      }),
    );
  }

  /** Decode a FileAttachment annotation's embedded file to a temp path.
   *  Omit `layerName` for the base view's shared reads. */
  async readAnnotationFileToTemp(
    ctx: OpenContext,
    docId: string,
    layerName: string | undefined,
    pageObjectNumber: number,
    ref: AnnotationRef,
    signal?: AbortSignal,
  ): Promise<SavedAttachmentFile> {
    return this.readFileToTemp(ctx, docId, layerName, signal, (jobId, path) =>
      wirePack({
        kind: 'annotations.readFile' as const,
        jobId,
        docId,
        ...(layerName !== undefined ? { layerName } : {}),
        page: toPageRef(pageObjectNumber),
        ref,
        path,
        maxDecodedBytes: DocumentService.MAX_DECODED_ATTACHMENT_BYTES,
      }),
    );
  }

  private async readFileToTemp(
    ctx: OpenContext,
    docId: string,
    layerName: string | undefined,
    signal: AbortSignal | undefined,
    buildFor: (jobId: WorkerJobId, path: string) => WirePack<WorkerRequest>,
  ): Promise<SavedAttachmentFile> {
    if (layerName !== undefined) await this.ensureLayerOnPool(ctx, docId, layerName);
    else await this.openOnPool(ctx, docId);
    const dir = await mkdtemp(join(tmpdir(), 'embedpdf-attachment-'));
    const path = join(dir, 'attachment.bin');
    try {
      // Attachment bytes use the file-backed extraction mode so the decoded
      // payload never crosses the worker boundary as an ArrayBuffer; Fastify
      // streams this completed temp file with backpressure.
      const payload = await this.readOnPool(
        ctx,
        docId,
        layerName,
        (jobId) => buildFor(jobId, path),
        signal,
      );
      if (payload.tag !== 'attachments.readFile' && payload.tag !== 'annotations.readFile') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `unexpected attachment read payload: ${payload.tag}`,
        );
      }
      const content = payload.content;
      if (content.path !== path) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `worker saved unexpected path: ${content.path}`,
        );
      }

      let cleaned = false;
      return {
        path,
        size: content.size,
        name: content.name,
        ...(content.mimeType !== undefined ? { mimeType: content.mimeType } : {}),
        async cleanup() {
          if (cleaned) return;
          cleaned = true;
          await rm(dir, { recursive: true, force: true });
        },
      };
    } catch (err) {
      await rm(dir, { recursive: true, force: true });
      throw err;
    }
  }

  /**
   * Explicit close: tear down the worker-side handle and drop the
   * head cache. Routes do not call this; they leave close to the
   * pool's eviction policy.
   */
  async close(docId: string): Promise<void> {
    this.heads.delete(docId);
    try {
      await this.pool.close(docId);
    } catch {
      // close is best-effort; pool may not know about this docId
      // anymore (already evicted), in which case it returns null and
      // we treat that as success.
    } finally {
      this.forgetLayerSessions(docId);
      this.releaseBaseHandles(docId);
    }
  }

  releaseAllBaseHandles(): void {
    for (const key of Array.from(this.baseHandles.keys())) {
      const handle = this.baseHandles.get(key)!;
      this.baseHandles.delete(key);
      handle.release();
    }
    for (const key of Array.from(this.layerArtifactHandles.keys())) {
      this.releaseLayerArtifactHandle(key);
    }
  }

  /** Diagnostic snapshot for tests + ops dashboards. */
  stats(): {
    openHeads: number;
    inflightOpens: number;
    pinnedBaseFiles: number;
    pinnedLayerArtifacts: number;
  } {
    return {
      openHeads: this.heads.size,
      inflightOpens: this.opens.size,
      pinnedBaseFiles: this.baseHandles.size,
      pinnedLayerArtifacts: this.layerArtifactHandles.size,
    };
  }

  private async loadDurableBasePageStates(ctx: OpenContext, docId: string): Promise<PageState[]> {
    const annotationsBuild = (jobId: WorkerJobId) =>
      wirePack({ kind: 'annotations.listRawAll' as const, jobId, docId });
    const annotationsResult = await this.readOnPool(ctx, docId, undefined, annotationsBuild);
    if (annotationsResult.tag !== 'annotations.listRawAll') {
      throw new EngineError(
        EngineErrorCode.WireFormat,
        `unexpected manifest annotation payload: ${annotationsResult.tag}`,
      );
    }
    return annotationsResult.snapshot.pages.map((page) => page.pageState);
  }

  private async openLayerOnPool(
    ctx: OpenContext,
    docId: string,
    layerName: string,
    password: string | null = null,
  ): Promise<void> {
    const row = await this.requireReadyRow(ctx, docId);
    const openPassword = password ?? (await this.passwordForOpen(ctx, row, layerName));
    const head = await this.openOnPool(ctx, docId, openPassword);

    const sessionKey = layerSessionKey(docId, layerName);
    const layer = await this.layerState.repos.layers.findByDocAndName(docId, layerName);
    // Law 2: a layer session materializes over the layer's base version,
    // which sits behind the head once a sibling published. Its file is
    // held beside the head's, keyed by sha, until the document closes or
    // a publish forgets every session over the old base.
    const layerBaseSha = layer?.baseSha ?? head.baseSha;
    const handle = await this.baseHandleFor(row, layerBaseSha);
    let layerHandle: LocalFileHandle | null = null;
    const layerOpen = layer
      ? await this.readLayerOpenSource(layer)
      : { source: { kind: 'fresh' as const }, handle: null };
    layerHandle = layerOpen.handle;
    const layerSource = layerOpen.source;
    const build = (jobId: WorkerJobId) => {
      const request = {
        kind: 'open.layerFileBase' as const,
        jobId,
        docId,
        layerName,
        baseKey: layerBaseSha,
        basePath: handle.path,
        layer: layerSource,
        password: openPassword,
        baseSha256: layerBaseSha,
      };
      return wirePack(request);
    };
    try {
      const result = await this.pool.run(docId, build);
      if (this.counters) this.counters.docOpens += 1;
      if (result.tag !== 'open') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          `unexpected layer open payload: ${result.tag}`,
        );
      }
      this.replaceLayerArtifactHandle(sessionKey, layerHandle);
      layerHandle = null;
      // The fence entry: this session is a materialization of exactly the
      // layer version whose artifact was just opened (0 = fresh, no row).
      this.layerSessionVersions.set(sessionKey, layer?.currentVersion ?? 0);
    } finally {
      layerHandle?.release();
    }
  }

  private async readLayerOpenSource(layer: {
    currentVersion: number;
    currentArtifactKey: string | null;
    currentArtifactSha: string | null;
    currentArtifactSize: number | null;
  }): Promise<{
    source: { kind: 'fresh' } | { kind: 'artifact-file'; path: string };
    handle: LocalFileHandle | null;
  }> {
    // No artifact key means a fresh layer over its base at any version: a
    // publish consumes the signing layer's edits into the new base version
    // and clears the artifact while `current_version` keeps counting (law 3).
    if (!layer.currentArtifactKey) {
      return { source: { kind: 'fresh' }, handle: null };
    }
    if (!layer.currentArtifactSha) {
      throw new EngineError(
        EngineErrorCode.DocOpenFailed,
        `layer version ${layer.currentVersion} is missing its artifact sha`,
      );
    }

    const handle = await this.cache.acquire({
      sha: layer.currentArtifactSha,
      key: layer.currentArtifactKey,
    });
    if (layer.currentArtifactSize !== null && handle.size !== layer.currentArtifactSize) {
      handle.release();
      throw new EngineError(
        EngineErrorCode.MalformedPdf,
        `layer artifact size mismatch for ${layer.currentArtifactKey}`,
      );
    }

    return { source: { kind: 'artifact-file', path: handle.path }, handle };
  }

  private forgetLayerSessions(docId: string): void {
    for (const key of Array.from(this.layerSessionVersions.keys())) {
      if (key.startsWith(`${docId}::`)) this.layerSessionVersions.delete(key);
    }
    for (const key of Array.from(this.layerArtifactHandles.keys())) {
      if (key.startsWith(`${docId}::`)) this.releaseLayerArtifactHandle(key);
    }
    for (const key of Array.from(this.layerOpens.keys())) {
      if (key.startsWith(`${docId}::`)) this.layerOpens.delete(key);
    }
  }

  private replaceBaseHandle(docId: string, sha: string, handle: LocalFileHandle): void {
    this.releaseBaseHandles(docId);
    this.baseHandles.set(baseHandleKey(docId, sha), handle);
  }

  /** Release every base version held for the document: the head's and any layer's behind it. */
  private releaseBaseHandles(docId: string): void {
    for (const key of Array.from(this.baseHandles.keys())) {
      if (!key.startsWith(`${docId}@`)) continue;
      const handle = this.baseHandles.get(key)!;
      this.baseHandles.delete(key);
      handle.release();
    }
  }

  /**
   * The held file of one base version of an open document, acquired on
   * first use. Two layer opens racing for the same behind-head version
   * both acquire (the cache refcounts); the loser releases its copy.
   */
  private async baseHandleFor(row: DocumentRow, sha: string): Promise<LocalFileHandle> {
    const key = baseHandleKey(row.id, sha);
    const held = this.baseHandles.get(key);
    if (held) return held;
    const acquired = await this.acquireBaseFile(row, sha);
    const raced = this.baseHandles.get(key);
    if (raced) {
      acquired.release();
      return raced;
    }
    this.baseHandles.set(key, acquired);
    return acquired;
  }

  /**
   * The local file of one base version, from the sha-keyed cache. The
   * catalog row names the object key; a version without a row (or with
   * `storageKey` null) is the legacy per-document base object.
   */
  private async acquireBaseFile(row: DocumentRow, sha: string): Promise<LocalFileHandle> {
    const version = await this.baseVersions.find(row.id, sha);
    const key = version?.storageKey ?? StorageKeys.basePdf(row.tenantId, row.id);
    return this.cache.acquire({ sha, key });
  }

  /** The document's version catalog, oldest first, and its head. */
  async listVersions(
    ctx: OpenContext,
    docId: string,
  ): Promise<{ head: string; versions: BaseVersionRow[] }> {
    const row = await this.requireReadyRow(ctx, docId);
    const head = requireBaseSha(row);
    const versions = await this.baseVersions.listForDocument(docId);
    if (versions.length === 0) {
      // Committed before the catalog existed and never signed: version 1 is the head itself.
      return { head, versions: [legacyVersionRow(row, head)] };
    }
    return { head, versions };
  }

  /** One catalogued version of the document; `NotFound` for a sha that is not one of its versions. */
  async requireVersion(ctx: OpenContext, docId: string, sha: string): Promise<BaseVersionRow> {
    const row = await this.requireReadyRow(ctx, docId);
    const version = await this.baseVersions.find(docId, sha);
    if (version) return version;
    if (row.baseSha === sha) return legacyVersionRow(row, sha);
    throw new EngineError(EngineErrorCode.NotFound, `${sha} is not a version of ${docId}`);
  }

  /**
   * One engine read over a base version: the version's file opened into a
   * private transient session (a version is not a layer, and never the
   * live document), the read dispatched to it, the session closed. The
   * session id is unique per call so concurrent reads of one version
   * never share or close each other's session.
   */
  async readVersionOnPool(
    ctx: OpenContext,
    docId: string,
    sha: string,
    build: (sessionId: string, jobId: WorkerJobId) => WirePack<WorkerRequest>,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    const row = await this.requireReadyRow(ctx, docId);
    const version = await this.requireVersion(ctx, docId, sha);
    const password = await this.passwordForOpen(ctx, row, pinnedLayerName(ctx));
    const handle = await this.acquireBaseFile(row, version.sha256);
    const sessionId = `${docId}#${version.sha256}#${randomUUID()}`;
    try {
      const opened = await this.pool.runOpen(
        sessionId,
        version.sha256,
        (jobId: WorkerJobId) =>
          wirePack({
            kind: 'open.layerFileBase' as const,
            jobId,
            docId: sessionId,
            baseKey: version.sha256,
            basePath: handle.path,
            layer: { kind: 'fresh' as const },
            password,
            baseSha256: version.sha256,
          }),
        signal,
      );
      if (opened.tag !== 'open') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected open payload: ${opened.tag}`);
      }
      return await this.pool.run(
        sessionId,
        (jobId: WorkerJobId) => build(sessionId, jobId),
        signal,
      );
    } finally {
      await this.pool.close(sessionId).catch(() => undefined);
      handle.release();
    }
  }

  /** The local file of one base version of a document the caller may read (signing rebuilds a candidate from it). */
  async acquireBaseFileFor(ctx: OpenContext, docId: string, sha: string): Promise<LocalFileHandle> {
    const row = await this.requireReadyRow(ctx, docId);
    return this.acquireBaseFile(row, sha);
  }

  /** The password the caller's session opens the document with (`null` when it needs none). */
  async passwordFor(ctx: OpenContext, docId: string, layerName: string): Promise<string | null> {
    const row = await this.requireReadyRow(ctx, docId);
    return this.passwordForOpen(ctx, row, layerName);
  }

  /**
   * The binding and JWT unlock key needed to rebind the caller's session
   * inside the publishing transaction. This context contains no PDF
   * password: the repository decrypts and re-encrypts it under the new
   * version's binding. `null` when the document needs no password session
   * (unencrypted, or an api token that supplies the password per request).
   */
  async sessionRebindContext(
    ctx: OpenContext,
    docId: string,
    layerName: string,
  ): Promise<{ binding: PasswordSessionBinding; unlockKey: string } | null> {
    const row = await this.requireReadyRow(ctx, docId);
    if (!requiresPasswordSession(row) || ctx.sub === 'api-token' || !this.passwordSessions)
      return null;
    return {
      binding: this.passwordSessionBinding(ctx, row, layerName),
      unlockKey: this.requireUnlockKey(ctx),
    };
  }

  /**
   * After a version was published (a signature completed): every session
   * over the old base is garbage — the head, the layer sessions, the
   * held files. The next open routes by the new sha. Other replicas hear
   * it through the realtime bus; correctness never depends on that (a
   * stale head only makes a later prepare record a stale fence, which
   * the completion rejects).
   */
  async onBaseVersionPublished(docId: string): Promise<void> {
    this.heads.delete(docId);
    this.forgetLayerSessions(docId);
    try {
      await this.pool.close(docId);
    } catch {
      // Best effort: an evicted document is already gone from the pool.
    } finally {
      this.releaseBaseHandles(docId);
    }
  }

  private replaceLayerArtifactHandle(key: string, handle: LocalFileHandle | null): void {
    this.releaseLayerArtifactHandle(key);
    if (handle) this.layerArtifactHandles.set(key, handle);
  }

  private releaseLayerArtifactHandle(key: string): void {
    const handle = this.layerArtifactHandles.get(key);
    if (!handle) return;
    this.layerArtifactHandles.delete(key);
    handle.release();
  }
}

function layerSessionKey(docId: string, layerName: string): string {
  return `${docId}::${layerName}`;
}

function buildHead(row: DocumentRow, cdnAccessRequired: boolean): DocumentHead {
  const baseSha = requireBaseSha(row);
  const permissions = {
    known: row.security.pdfPermissionsBits !== null,
    bits: row.security.pdfPermissionsBits,
    allAllowed: row.security.pdfPermissionsAllAllowed,
    openedAs: row.security.pdfOpenedAs,
    securityHandlerRevision: row.security.securityHandlerRevision,
    canUpgradeToOwner:
      row.security.encryptionState === 'encrypted' && row.security.pdfOpenedAs !== 'owner',
  };
  const reasons: DocumentHead['access']['reasons'] = [];
  if (row.security.encryptionRequiresPassword === true && !permissions.known) {
    reasons.push('password');
  }
  if (row.security.encryptionState === 'unknown') reasons.push('permissions-unknown');
  // CDN-configured deployments need /v1/access for signed URLs even
  // when the document isn't encrypted. The SDK reads `reasons` to
  // decide whether to auto-call /access at open() time.
  if (cdnAccessRequired) reasons.push('cdn');

  return {
    id: row.id,
    baseSha,
    storageSizeBytes: row.storageSizeBytes ?? 0,
    docVersion: row.docVersion,
    state: row.state,
    encryption: {
      state: row.security.encryptionState,
      requiresPassword: row.security.encryptionRequiresPassword,
    },
    permissions,
    access: {
      required: reasons.length > 0,
      reasons,
      ...(reasons.length > 0 ? { endpoint: wirePaths.access(row.id, DEFAULT_LAYER_NAME) } : {}),
    },
  };
}

/** The catalog row a pre-catalog document's head stands for: version 1 at the legacy key. */
function legacyVersionRow(row: DocumentRow, sha: string): BaseVersionRow {
  return {
    tenantId: row.tenantId,
    docId: row.id,
    sha256: sha,
    byteLength: row.storageSizeBytes ?? 0,
    number: 1,
    parentSha256: null,
    producerKind: 'upload',
    producerRef: null,
    storageKey: null,
    layoutVersion: 1,
    metadataVersion: 1,
    attachmentsVersion: 1,
    annotationsVersion: 1,
    createdAt: row.createdAt,
  };
}

function baseHandleKey(docId: string, sha: string): string {
  return `${docId}@${sha}`;
}

function requireBaseSha(row: DocumentRow): string {
  if (!row.baseSha) {
    throw new EngineError(
      EngineErrorCode.DocOpenFailed,
      `document is ready but has no base_sha: ${row.id}`,
    );
  }
  return row.baseSha;
}

function securityFingerprint(row: DocumentRow): string {
  return [
    row.security.encryptionState,
    row.security.encryptionRequiresPassword === null
      ? 'unknown'
      : row.security.encryptionRequiresPassword
        ? 'password'
        : 'open',
    row.security.securityHandlerRevision ?? 'none',
  ].join(':');
}

function securityInfoFromCachedVerification(row: {
  openedAs: 'none' | 'user' | 'owner';
  pdfPermissionsBits: number;
  pdfPermissionsAllAllowed: boolean;
  securityHandlerRevision: number | null;
}): DocumentSecurityProbeInfo {
  return {
    encryptionState: row.openedAs === 'none' ? 'none' : 'encrypted',
    encryptionRequiresPassword: false,
    securityHandlerRevision: row.securityHandlerRevision,
    pdfPermissionsBits: row.pdfPermissionsBits,
    pdfPermissionsAllAllowed: row.pdfPermissionsAllAllowed,
    pdfOpenedAs: row.openedAs,
    securityProbedAt: Date.now(),
  };
}

function factsFromCachedVerification(row: PasswordVerificationRow): PasswordSessionFacts {
  return {
    openedAs: row.openedAs,
    pdfPermissionsBits: row.pdfPermissionsBits,
    pdfPermissionsAllAllowed: row.pdfPermissionsAllAllowed,
    securityHandlerRevision: row.securityHandlerRevision,
  };
}

function factsFromProbe(probe: DocumentSecurityProbeInfo): PasswordSessionFacts | null {
  if (probe.pdfPermissionsBits === null) return null;
  return {
    openedAs: probe.pdfOpenedAs ?? 'none',
    pdfPermissionsBits: probe.pdfPermissionsBits,
    pdfPermissionsAllAllowed: probe.pdfPermissionsAllAllowed ?? false,
    securityHandlerRevision: probe.securityHandlerRevision,
  };
}

function securityInfoFromPasswordSession(row: PasswordSessionFacts): DocumentSecurityProbeInfo {
  return {
    encryptionState: row.openedAs === 'none' ? 'none' : 'encrypted',
    encryptionRequiresPassword: false,
    securityHandlerRevision: row.securityHandlerRevision,
    pdfPermissionsBits: row.pdfPermissionsBits,
    pdfPermissionsAllAllowed: row.pdfPermissionsAllAllowed,
    pdfOpenedAs: row.openedAs,
    securityProbedAt: Date.now(),
  };
}

function securityInfoFromDocumentRow(row: DocumentRow): DocumentSecurityProbeInfo {
  return {
    encryptionState: row.security.encryptionState,
    encryptionRequiresPassword: row.security.encryptionRequiresPassword,
    securityHandlerRevision: row.security.securityHandlerRevision,
    pdfPermissionsBits: row.security.pdfPermissionsBits,
    pdfPermissionsAllAllowed: row.security.pdfPermissionsAllAllowed,
    pdfOpenedAs: row.security.pdfOpenedAs,
    securityProbedAt: row.security.securityProbedAt ?? Date.now(),
  };
}

function requiresPasswordSession(row: DocumentRow): boolean {
  return (
    row.security.encryptionState === 'encrypted' && row.security.encryptionRequiresPassword === true
  );
}

/**
 * Whether the document is encrypted at all. Distinct from
 * {@link requiresPasswordSession}: a permission-only encrypted PDF (owner
 * password set, empty user password) is `isEncrypted` but does not require
 * a password to open. Such docs are still "session-capable" — their
 * effective bits can change after an owner-password unlock — so the unlock
 * and effective-bits paths gate on this rather than on the open-time
 * password requirement.
 */
function isEncrypted(row: DocumentRow): boolean {
  return row.security.encryptionState === 'encrypted';
}

function safeFilePart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return cleaned.length > 0 ? cleaned : 'document';
}
