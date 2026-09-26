import {
  AbortError,
  AbortablePromise,
  DEFAULT_PDF_SAVE_MODE,
  EngineError,
  EngineErrorCode,
  subscribeToType,
  type DocumentAnnotationsService,
  type DocumentActionsService,
  type DocumentAttachmentsService,
  type DocumentSignaturesService,
  type DocumentEvent,
  type DocumentEventStream,
  type DocumentFormsService,
  type DocumentHandle,
  type DocumentPagesService,
  type DocumentRedactionService,
  CONTINUOUS_RENDER_POLICY,
  type DocumentRenderService,
  type DocumentSecurityService,
  type MutationMeta,
  type PageHandle,
  type PageRef,
  type PdfSaveMode,
} from '@embedpdf/engine-core/runtime';
import {
  DEFAULT_LAYER_NAME,
  DocumentHeadSchema,
  DocumentManifestSchema,
  wirePaths,
  type DocumentHead,
  type DocumentManifest,
  type LayerScopePlane,
} from '@embedpdf/engine-core/wire';
import { EventHub, SessionEventPublisher } from '@embedpdf/engine-services';

import { CloudDocumentActionsService } from './CloudDocumentActionsService';
import { CloudDocumentAnnotationsService } from './CloudDocumentAnnotationsService';
import { CloudDocumentAttachmentsService } from './CloudDocumentAttachmentsService';
import { CloudDocumentFormsService } from './CloudDocumentFormsService';
import { CloudDocumentPagesService } from './CloudDocumentPagesService';
import { CloudDocumentRedactionService } from './CloudDocumentRedactionService';
import { CloudDocumentSearchService } from './CloudDocumentSearchService';
import { CloudDocumentSecurityService } from './CloudDocumentSecurityService';
import { CloudDocumentSignaturesService } from './CloudDocumentSignaturesService';
import { CloudMetadataService } from './CloudMetadataService';
import { CloudPageHandle } from './CloudPageHandle';
import { auditRowToEvents } from '../realtime/auditRowToEvents';
import { SseClient } from '../realtime/SseClient';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Read accessor handed to every `CloudPage…Service`. The closure
 * captures `this` so the services don't carry a direct reference
 * back to the document handle (smaller circular-ref surface, easier
 * to mock in unit tests).
 */
export interface ManifestAccessor {
  /** Cached manifest (cold-fetched once, kept across requests). */
  get(signal: AbortSignal): Promise<DocumentManifest>;
  /** Force re-fetch of `/head` + `/manifest@docVersion=N`; replaces the cache. */
  refresh(signal: AbortSignal): Promise<DocumentManifest>;
  /**
   * Absorb mutation-returned state/cache deltas when safe. `owns` names the
   * planes this mutation kind takes ownership of (the monotone-flip
   * rule): annotation/form writes own `annotations`; flatten and
   * redaction-apply own `content + annotations`. The flip runs even when
   * the version-gated delta merge is skipped — scopes only ever move
   * base → layer, so any observed mutation proves the plane diverged.
   */
  apply(meta: MutationMeta, owns: readonly LayerScopePlane[]): void;
  /** A page delete: the advance, plus dropping the deleted pages' manifest
   *  rows so per-page leaf URLs stop resolving locally. */
  applyPageDelete(meta: MutationMeta, deletedPages: readonly PageRef[]): void;
  /** Page insert: the cached manifest has no rows for the fresh page object numbers (the
   *  result carries only their object numbers), so the absorb drops the
   *  cache for a lazy refetch instead of patching. */
  applyPageInsert(meta: MutationMeta): void;
}

export class CloudDocumentHandle implements DocumentHandle {
  readonly id: string;
  readonly capabilities = {
    weakAnnotationEditSessions: 'required',
  } as const;
  readonly metadata: CloudMetadataService;
  readonly annotations: DocumentAnnotationsService;
  readonly actions: DocumentActionsService;
  readonly attachments: DocumentAttachmentsService;
  readonly signatures: DocumentSignaturesService;
  readonly forms: DocumentFormsService;
  readonly search: CloudDocumentSearchService;
  readonly pages: DocumentPagesService;
  readonly redaction: DocumentRedactionService;
  readonly security: DocumentSecurityService;
  readonly render: DocumentRenderService;
  readonly events: DocumentEventStream;
  private readonly publisher: SessionEventPublisher;
  private readonly hub: EventHub;
  private readonly sessionId: string;
  private sseClient: SseClient | null = null;
  private sseSubscribers = 0;
  private closed = false;

  /**
   * Cached current manifest. Populated on first read by `getManifest`
   * (or any `page().*` call that needs to know a version). Replaced
   * wholesale on `refreshManifest`. Cleared on `close`.
   *
   * Memory model: one DocumentManifest per open handle. Per-page
   * version reads are O(pages.length) `.find(...)` lookups; if a
   * profiling pass ever shows that as hot, swap for a Map keyed by
   * `pageObjectNumber`. Today's documents are page-sparse so the
   * scan is cheaper than the hash overhead.
   */
  private manifestCache: DocumentManifest | null = null;
  private inflightManifest: Promise<DocumentManifest> | null = null;
  private manifestFloorVersion = 0;
  private pendingInitialHead: DocumentHead | null;

  private readonly manifestAccessor: ManifestAccessor;

  constructor(
    private readonly http: HttpClient,
    id: string,
    private readonly layerName: string = DEFAULT_LAYER_NAME,
    initialHead?: DocumentHead,
    /**
     * The doc-scoped JWT the engine was opened with, decoded
     * unverified to populate the security service's local-fallback
     * `effectiveScope` / `identity` accessors. Optional for backward
     * compatibility; without it the local-fallback path returns an
     * empty scope and null identity until /access is called.
     */
    initialToken: string | null = null,
    sessionId: string = `cloud:anon:${id}`,
    /** Called once, when the handle closes (the engine forgets it). */
    private readonly onClose: () => void = () => {},
  ) {
    this.id = id;
    this.pendingInitialHead = initialHead ?? null;
    const security = new CloudDocumentSecurityService(
      http,
      id,
      layerName,
      initialHead ?? fallbackUnknownHead(id),
      { isClosed: () => this.closed },
      initialToken,
    );
    this.security = security;
    // The deployment's render lattice rides /v1/access (mutable policy
    // never lives in immutable manifests). Reuse the cached access block
    // when present; otherwise establish access on demand — the same call
    // the CDN path uses, so this can never add a second handshake shape.
    // A pre-lattice server (no renderPolicy field) enforces nothing:
    // `continuous` is the honest answer.
    this.render = {
      getPolicy: () =>
        AbortablePromise.run(async () => {
          const cached =
            security.currentAccess ?? (await security.establishAccess()).access ?? null;
          const advertised = cached?.renderPolicy;
          if (!advertised) return CONTINUOUS_RENDER_POLICY;
          return {
            kind: 'lattice',
            fullPage: { widths: advertised.fullPage.widths },
            ...(advertised.tiles ? { tiles: advertised.tiles } : {}),
            ...(advertised.appearances ? { appearances: advertised.appearances } : {}),
            ...(advertised.maxRenderPixels !== undefined
              ? { maxRenderPixels: advertised.maxRenderPixels }
              : {}),
            formats: advertised.formats,
            background: advertised.background,
            enforced: advertised.enforced,
          };
        }),
    };
    const hub = new EventHub();
    this.hub = hub;
    this.sessionId = sessionId;
    // Your own mutations publish here at POST-confirmation time (kind:
    // 'local'); the remote channel (SSE) publishes everyone else's into the
    // same hub. Exactly one event per mutation, either way. The SSE stream
    // is lazy: it opens on the first subscriber and closes on the last —
    // non-collaborative usage never holds a connection (browsers cap ~6
    // per origin on HTTP/1.1).
    const subscribe: DocumentEventStream['subscribe'] = (listener) => {
      const unsubscribe = hub.subscribe(listener);
      this.retainRemoteStream();
      let released = false;
      return () => {
        unsubscribe();
        if (!released) {
          released = true;
          this.releaseRemoteStream();
        }
      };
    };
    this.events = {
      subscribe,
      on: (type, listener) => subscribeToType(subscribe, type, listener),
      lastServerId: () => hub.lastServerId(),
    };
    this.publisher = new SessionEventPublisher(hub, sessionId);
    this.manifestAccessor = {
      get: (signal) => this.getManifest(signal),
      refresh: (signal) => this.refreshManifest(signal),
      apply: (meta, owns) => this.absorbMutation(meta, owns),
      applyPageDelete: (meta, deletedPages) => this.absorbPageDelete(meta, deletedPages),
      applyPageInsert: (meta) => this.absorbPageInsert(meta),
    };
    this.metadata = new CloudMetadataService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
    this.annotations = new CloudDocumentAnnotationsService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
    this.actions = new CloudDocumentActionsService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
    );
    this.attachments = new CloudDocumentAttachmentsService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
    this.signatures = new CloudDocumentSignaturesService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
    this.forms = new CloudDocumentFormsService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
    this.search = new CloudDocumentSearchService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
    );
    this.pages = new CloudDocumentPagesService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
    this.redaction = new CloudDocumentRedactionService(
      http,
      id,
      layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
  }

  page(ref: PageRef): PageHandle {
    return new CloudPageHandle(
      ref,
      this.http,
      this.id,
      this.layerName,
      () => this.closed,
      this.manifestAccessor,
      this.publisher,
    );
  }

  download(opts: { mode?: PdfSaveMode } = {}): AbortablePromise<Uint8Array> {
    if (this.closed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.id} is closed`),
      );
    }
    const mode = opts.mode ?? DEFAULT_PDF_SAVE_MODE;
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const buildPath = async () => {
        const manifest = await this.getManifest(signal);
        return wirePaths.layerDownloadVersioned(this.id, this.layerName, {
          docVersion: manifest.docVersion,
          mode,
        });
      };
      try {
        return await this.http.getBytes(await buildPath(), signal);
      } catch (err) {
        if (!EngineError.is(err, EngineErrorCode.NotFound)) throw err;
        await this.refreshManifest(signal);
        return this.http.getBytes(await buildPath(), signal);
      }
    });
  }

  /**
   * Return the cached manifest, fetching cold-cache once if needed.
   * Concurrent callers share a single inflight request (singleflight)
   * so an N-page handle that opens N services in parallel still
   * triggers exactly one `/head` + `/manifest@docVersion=N` round-trip.
   */
  async getManifest(signal: AbortSignal): Promise<DocumentManifest> {
    if (this.manifestCache) return this.manifestCache;
    if (!this.inflightManifest) {
      this.startManifestFetch({ allowInitialHead: true });
    }
    const promise = this.inflightManifest;
    if (!promise) {
      throw new EngineError(
        EngineErrorCode.Unknown,
        `manifest fetch was not started for document ${this.id}`,
      );
    }
    return awaitSignal(promise, signal);
  }

  /**
   * Force re-fetch. Used by the transparent-retry path when a leaf
   * URL returns 404 (stale version). Replaces `manifestCache`
   * wholesale so the next `getManifest()` is a Map lookup.
   */
  async refreshManifest(signal: AbortSignal): Promise<DocumentManifest> {
    const promise = this.startManifestFetch({ allowInitialHead: false });
    return awaitSignal(promise, signal);
  }

  /**
   * Monotone plane-scope flip: mark the planes a mutation owns as layer-scoped in
   * the cached manifest. Scopes only ever move base → layer (no revert op
   * exists), so flipping is safe under any event ordering — a duplicate or
   * out-of-order event still proves the plane diverged at some point — and
   * the manifest fetch stays the authoritative source (the 404 → refresh
   * rail heals any miss, e.g. a future mutation kind this client doesn't
   * know about).
   */
  private flipScopes(owns: readonly LayerScopePlane[]): void {
    const cache = this.manifestCache;
    const scopes = cache?.scopes;
    if (!cache || !scopes) return;
    if (owns.every((plane) => scopes[plane] === 'layer')) return;
    const next = { ...scopes };
    for (const plane of owns) next[plane] = 'layer';
    this.manifestCache = { ...cache, scopes: next };
  }

  absorbMutation(meta: MutationMeta, owns: readonly LayerScopePlane[]): void {
    this.flipScopes(owns);
    const delta = meta.cacheDelta;
    if (delta) {
      this.manifestFloorVersion = Math.max(this.manifestFloorVersion, delta.docVersion);
    }
    this.inflightManifest = null;

    if (!this.manifestCache) return;
    if (delta) {
      if (delta.docVersion <= this.manifestCache.docVersion) return;
      if (delta.previousDocVersion !== this.manifestCache.docVersion) {
        this.manifestCache = null;
        return;
      }
    }

    const byPageObjectNumber = new Map(
      this.manifestCache.pages.map((page) => [page.state.page.pageObjectNumber, page]),
    );
    for (const pageState of meta.affectedPages) {
      const existing = byPageObjectNumber.get(pageState.page.pageObjectNumber);
      if (existing) {
        byPageObjectNumber.set(pageState.page.pageObjectNumber, {
          ...existing,
          state: pageState,
        });
      }
    }
    if (delta) {
      for (const page of delta.pages) {
        const existing = byPageObjectNumber.get(page.page.pageObjectNumber);
        if (existing) {
          byPageObjectNumber.set(page.page.pageObjectNumber, {
            ...existing,
            cache: page.cache,
          });
        }
      }
    }
    this.manifestCache = {
      ...this.manifestCache,
      docVersion: delta?.docVersion ?? this.manifestCache.docVersion,
      // Bulk annotations pin: absorbed when the mutation bumped it, so the
      // next `annotations.list()` addresses the fresh bulk leaf without a
      // 404-refresh round trip.
      ...(delta?.annotationsVersion !== undefined
        ? { annotationsVersion: delta.annotationsVersion }
        : {}),
      // The plane pins a page-structure, metadata or attachment write bumps:
      // absorbed so the next read addresses the fresh leaf.
      ...(delta?.layoutVersion !== undefined ? { layoutVersion: delta.layoutVersion } : {}),
      ...(delta?.metadataVersion !== undefined ? { metadataVersion: delta.metadataVersion } : {}),
      ...(delta?.attachmentsVersion !== undefined
        ? { attachmentsVersion: delta.attachmentsVersion }
        : {}),
      // The signing fences: every ordinary commit writes an artifact
      // (`working`), and the layer's write serial when the delta names it.
      ...(delta?.layerVersion !== undefined ? { layerVersion: delta.layerVersion } : {}),
      ...(delta?.working !== undefined ? { working: delta.working } : {}),
      // The manifest is a per-page registry keyed by pageObjectNumber, not a
      // display-order list — geometry/order now lives in `pages.list()`
      // (/layout). Keep a deterministic order by page object number so cache merges are
      // stable; display order is the SDK's concern via PageLayout.index.
      pages: Array.from(byPageObjectNumber.values()).sort(
        (a, b) => a.state.page.pageObjectNumber - b.state.page.pageObjectNumber,
      ),
    };
  }

  /**
   * Patch the cached manifest after a page delete: the shared advance plus
   * dropping the deleted pages' manifest rows, so no leaf URL for a retired
   * page object number can be built from the cache (a stale request would
   * 404 anyway — this keeps the failure local and instant). Delete changes
   * the page set: a view that removed content must never resolve base
   * artifacts again, so content and annotations flip with layout.
   */
  private absorbPageDelete(meta: MutationMeta, deletedPages: readonly PageRef[]): void {
    this.absorbMutation(meta, ['layout', 'content', 'annotations']);
    if (!this.manifestCache) return;
    const deleted = new Set(deletedPages.map((page) => page.pageObjectNumber));
    this.manifestCache = {
      ...this.manifestCache,
      pages: this.manifestCache.pages.filter(
        (page) => !deleted.has(page.state.page.pageObjectNumber),
      ),
    };
  }

  /**
   * Patch bookkeeping after a page insert — the mirror of
   * {@link absorbPageDelete}, with one asymmetry: delete can patch the
   * cached manifest losslessly (it only removes rows), but an insert needs
   * manifest rows for the fresh page object numbers and the result doesn't carry them. So
   * this absorb flips the planes (insert changes the page set, so like
   * delete it owns content + annotations alongside layout), raises the
   * version floor, and drops the cache — the next read refetches a manifest
   * that includes the new pages' rows. The UI never waits on that refetch:
   * the mutation result / event already carries the full new layout.
   */
  private absorbPageInsert(meta: MutationMeta): void {
    this.flipScopes(['layout', 'content', 'annotations']);
    if (meta.cacheDelta) {
      this.manifestFloorVersion = Math.max(this.manifestFloorVersion, meta.cacheDelta.docVersion);
    }
    this.inflightManifest = null;
    this.manifestCache = null;
  }

  private startManifestFetch(opts: { allowInitialHead: boolean }): Promise<DocumentManifest> {
    const ctrl = new AbortController();
    const promise = this.fetchManifest(ctrl.signal, opts);
    this.inflightManifest = promise;
    promise
      .then((manifest) => {
        if (
          manifest.docVersion >= this.manifestFloorVersion &&
          (!this.manifestCache || manifest.docVersion >= this.manifestCache.docVersion)
        ) {
          this.manifestCache = manifest;
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (this.inflightManifest === promise) {
          this.inflightManifest = null;
        }
      });
    return promise;
  }

  private async fetchManifest(
    signal: AbortSignal,
    opts: { allowInitialHead: boolean },
  ): Promise<DocumentManifest> {
    if (this.closed) {
      throw new EngineError(EngineErrorCode.DocNotOpen, `document ${this.id} is closed`);
    }
    const head = opts.allowInitialHead ? this.consumeInitialHead() : null;
    if (head) {
      try {
        return await this.fetchManifestForHead(head, signal);
      } catch (err) {
        if (!EngineError.is(err, EngineErrorCode.NotFound)) throw err;
        // A mutation may have landed between open() and the first
        // manifest read. The seed is one-shot, so fall through to the
        // normal /head path and learn the current docVersion.
      }
    }

    // Refreshes and stale-seed recovery always re-fetch `/head` first
    // so we learn the current `docVersion`; chasing the manifest with
    // a stale `:D` would 404 by definition.
    const freshHead = await this.http.getJson(
      wirePaths.layerHead(this.id, this.layerName),
      (raw) => DocumentHeadSchema.parse(raw),
      signal,
    );
    return this.fetchManifestForHead(freshHead, signal);
  }

  private consumeInitialHead(): DocumentHead | null {
    const head = this.pendingInitialHead;
    this.pendingInitialHead = null;
    return head;
  }

  private fetchManifestForHead(head: DocumentHead, signal: AbortSignal): Promise<DocumentManifest> {
    return this.http.getJson(
      wirePaths.layerManifest(this.id, this.layerName, head.docVersion),
      (raw) => DocumentManifestSchema.parse(raw),
      signal,
    );
  }

  close(): AbortablePromise<void> {
    if (this.closed) {
      return AbortablePromise.resolveValue<void>(undefined);
    }
    this.closed = true;
    this.sseClient?.close();
    this.sseClient = null;
    this.manifestCache = null;
    this.inflightManifest = null;
    this.onClose();
    return AbortablePromise.resolveValue<void>(undefined);
  }

  private retainRemoteStream(): void {
    this.sseSubscribers += 1;
    if (this.sseSubscribers > 1 || this.closed || this.sseClient) return;
    this.sseClient = new SseClient({
      http: this.http,
      path: wirePaths.layerEvents(this.id, this.layerName),
      // Gapless handshake: resume from the newest cursor we know — events
      // already seen, else the cached manifest's transactional auditHead.
      // Null (cold start, no manifest yet) subscribes "from now", which is
      // exact too: the first manifest fetched afterwards is newer anyway.
      initialCursor: this.hub.lastServerId() ?? this.manifestCache?.auditHead ?? null,
      onRow: (row) => {
        // Advance the cached manifest's audit cursor — own echoes and
        // unknown kinds included — so a later `annotations.list()` never stamps a
        // cursor older than the pins the absorbed cache hands it.
        if (this.manifestCache && row.id > this.manifestCache.auditHead) {
          this.manifestCache = { ...this.manifestCache, auditHead: row.id };
        }
        // None for an own echo or an unknown kind; one per fact otherwise.
        for (const event of auditRowToEvents(row, this.sessionId)) {
          // Absorb before publish: a listener reading the manifest in its
          // callback must see post-mutation state (same order as local).
          this.absorbRemoteEvent(event);
          this.hub.publish(event);
        }
      },
      onFullRefresh: () => {
        // Too far behind to replay: drop the cache; the next read refetches.
        this.manifestCache = null;
        this.inflightManifest = null;
        // Tell subscribers their event-derived state may be stale — the
        // gap's mutations will never arrive as events.
        this.hub.publish({ type: 'stream.desynced', reason: 'backlog-overflow', ts: Date.now() });
      },
      onAuthLost: () => {
        // The stream is gone for good under this credential. Local events
        // keep flowing; remote delivery resumes if the doc is re-opened
        // with a fresh token.
        this.sseClient = null;
      },
    });
    this.sseClient.open();
  }

  private releaseRemoteStream(): void {
    this.sseSubscribers = Math.max(0, this.sseSubscribers - 1);
    if (this.sseSubscribers === 0 && this.sseClient) {
      this.sseClient.close();
      this.sseClient = null;
    }
  }

  /** Patch the cached manifest from a remote event's coherence pins — the
   *  same absorb rails local mutations use, so reads stay warm no matter
   *  whose hand caused the change. */
  private absorbRemoteEvent(event: DocumentEvent): void {
    switch (event.type) {
      case 'pages.scaleSet':
        this.absorbMutation(event.meta, []);
        return;
      case 'annotations.created':
      case 'annotations.updated':
      case 'annotations.deleted':
      case 'annotations.moved':
        this.absorbMutation(event.meta, ['annotations']);
        return;
      case 'pages.moved':
      case 'pages.rotated':
      case 'pages.named':
        this.absorbMutation(event.meta, ['layout']);
        return;
      case 'pages.deleted':
        this.absorbPageDelete(event.meta, event.pages);
        return;
      case 'pages.inserted':
        this.absorbPageInsert(event.meta);
        return;
      case 'metadata.updated':
        this.absorbMutation(event.meta, ['metadata']);
        return;
      case 'attachments.created':
      case 'attachments.deleted':
        this.absorbMutation(event.meta, ['attachments']);
        return;
      case 'forms.valueSet':
      case 'forms.imported':
      case 'forms.repaired':
      case 'forms.created':
      case 'forms.updated':
      case 'forms.deleted':
      case 'forms.widgetAdded':
      case 'forms.widgetRemoved':
        // Form mutations ship the same MutationMeta rails as annotations:
        // affected pages are the ones whose widget appearances changed.
        // Widgets are annotations, so they own the same plane.
        this.absorbMutation(event.meta, ['annotations']);
        return;
      case 'forms.effectsApplied':
        this.absorbMutation(event.meta, ['annotations']);
        return;
      case 'pages.flattened':
      case 'annotations.flattened':
        // Flatten bakes annotations into page content: both planes flip.
        this.absorbMutation(event.meta, ['content', 'annotations']);
        return;
      case 'redaction.applied':
        // Redaction-apply rewrites content and consumes the marks: both
        // planes flip — and this is the security-relevant divergence, so a
        // remote apply must stop this client's base reads immediately.
        this.absorbMutation(event.meta, ['content', 'annotations']);
        return;
    }
  }
}

function fallbackUnknownHead(id: string): DocumentHead {
  return {
    id,
    baseSha: '',
    storageSizeBytes: 0,
    docVersion: 1,
    state: 'ready',
    encryption: { state: 'unknown', requiresPassword: null },
    permissions: {
      known: false,
      bits: null,
      allAllowed: null,
      openedAs: null,
      securityHandlerRevision: null,
      canUpgradeToOwner: false,
    },
    access: {
      required: true,
      reasons: ['permissions-unknown'],
      endpoint: wirePaths.access(id, DEFAULT_LAYER_NAME),
    },
  };
}

function awaitSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new AbortError(signal.reason));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new AbortError(signal.reason));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (reason) => {
        signal.removeEventListener('abort', onAbort);
        reject(reason);
      },
    );
  });
}
