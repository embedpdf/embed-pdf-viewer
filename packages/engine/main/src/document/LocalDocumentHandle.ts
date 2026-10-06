import {
  type BaseVersionInfo,
  AbortablePromise,
  DEFAULT_PDF_SAVE_MODE,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentAnnotationsService,
  type DocumentActionsService,
  type DocumentEventStream,
  LOCAL_ENGINE_BRAND,
  type LocalDocumentHandle as LocalDocumentHandleContract,
  type DocumentPagesService,
  type DocumentRedactionService,
  CONTINUOUS_RENDER_POLICY,
  type DocumentRenderService,
  type DocumentSecurityProbeInfo,
  type EngineRenderPolicy,
  type MetadataService,
  type DownloadOptions,
  type PdfSaveMode,
  type PageRef,
  type CallFacts,
  type WorkingSetPage,
} from '@embedpdf/engine-core/runtime';
import { EventHub, SessionEventPublisher } from '@embedpdf/engine-services';

import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import type { ScopeGuard } from '../scope';
import { LocalDocumentActionsService } from './LocalDocumentActionsService';
import { LocalDocumentAnnotationsService } from './LocalDocumentAnnotationsService';
import { LocalDocumentAttachmentsService } from './LocalDocumentAttachmentsService';
import { LocalDocumentFontSettings } from './LocalDocumentFontSettings';
import { LocalDocumentFormsService } from './LocalDocumentFormsService';
import { LocalDocumentPagesService } from './LocalDocumentPagesService';
import { LocalDocumentRedactionService } from './LocalDocumentRedactionService';
import { LocalDocumentSearchService } from './LocalDocumentSearchService';
import { LocalDocumentSecurityService } from './LocalDocumentSecurityService';
import { LocalDocumentSignaturesService } from './LocalDocumentSignaturesService';
import { LocalMetadataService } from './LocalMetadataService';
import { LocalPageHandle } from './LocalPageHandle';
import { LocalPieceInfoService } from './LocalPieceInfoService';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue, WorkerQueue } from '../worker/WorkerQueue';

/**
 * What every handle of one open document shares. `with()` makes handles that
 * differ only in the facts their calls carry, over this one state.
 */
interface OpenDocument {
  readonly id: string;
  readonly queue: WorkerQueue;
  readonly imageEncoder: LocalImageEncoder;
  readonly guard: ScopeGuard;
  readonly renderPolicy: EngineRenderPolicy;
  readonly publisher: SessionEventPublisher;
  readonly events: DocumentEventStream;
  readonly security: LocalDocumentSecurityService;
  readonly render: DocumentRenderService;
  readonly isClosed: () => boolean;
  close(): void;
  /** The handles `with()` made, by their facts, so asking twice gives the same one. */
  readonly withFacts: Map<string, LocalDocumentHandle>;
}

export class LocalDocumentHandle implements LocalDocumentHandleContract {
  readonly [LOCAL_ENGINE_BRAND] = true;
  readonly capabilities = {
    weakAnnotationEditSessions: 'not-needed',
  } as const;
  readonly metadata: MetadataService;
  readonly pieceInfo: LocalPieceInfoService;
  readonly annotations: DocumentAnnotationsService;
  readonly attachments: LocalDocumentAttachmentsService;
  readonly actions: DocumentActionsService;
  readonly forms: LocalDocumentFormsService;
  readonly fonts: LocalDocumentFontSettings;
  readonly search: LocalDocumentSearchService;
  readonly pages: DocumentPagesService;
  readonly redaction: DocumentRedactionService;
  readonly security: LocalDocumentSecurityService;
  readonly signatures: LocalDocumentSignaturesService;
  /**
   * The engine's configured render policy, advertised through the same
   * `policy()` every engine exposes (engine parity: plugin code never
   * branches on engine kind). Local defaults to `continuous` — rendering
   * is in-process and exact — but an embedder can configure a lattice at
   * `localEngine({ renderPolicy })`, the same way permissions are
   * overridden, and the local engine then budgets/enforces exactly like
   * the cloud deployment would (see renderPolicyGuard.ts).
   */
  readonly render: DocumentRenderService;
  readonly events: DocumentEventStream;
  readonly id: string;
  /** The queue with this handle's facts: every call made through it carries them. */
  private readonly queue: JobQueue;

  /** A newly opened document's handle, its calls carrying no facts. */
  static open(
    id: string,
    queue: WorkerQueue,
    imageEncoder: LocalImageEncoder,
    initialSecurity: DocumentSecurityProbeInfo,
    guard: ScopeGuard,
    sessionId: string,
    renderPolicy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY,
  ): LocalDocumentHandle {
    let closed = false;
    const isClosed = () => closed;
    const hub = new EventHub();
    const doc: OpenDocument = {
      id,
      queue,
      imageEncoder,
      guard,
      renderPolicy,
      // A single instance, so every event is `kind: 'local'` — the same
      // interface as cloud with the collaborative fields at rest.
      publisher: new SessionEventPublisher(hub, sessionId),
      events: hub,
      security: new LocalDocumentSecurityService(initialSecurity, id, queue, { isClosed }, guard),
      render: { getPolicy: () => AbortablePromise.resolveValue(renderPolicy) },
      isClosed,
      close: () => {
        closed = true;
      },
      withFacts: new Map(),
    };
    return new LocalDocumentHandle(doc, {});
  }

  private constructor(
    private readonly doc: OpenDocument,
    private readonly facts: CallFacts,
  ) {
    const { id, guard, publisher } = doc;
    const queue = doc.queue.withFacts(facts);
    const view = { isClosed: doc.isClosed };
    this.id = id;
    this.queue = queue;
    this.render = doc.render;
    this.events = doc.events;
    this.security = doc.security;
    this.metadata = new LocalMetadataService(id, queue, view, guard, publisher);
    // Catalog-level /PieceInfo (no pon); page-level lives on each page handle.
    this.pieceInfo = new LocalPieceInfoService(id, queue, view, guard);
    this.annotations = new LocalDocumentAnnotationsService(id, queue, view, guard, publisher);
    this.attachments = new LocalDocumentAttachmentsService(id, queue, view, guard, publisher);
    this.actions = new LocalDocumentActionsService(id, queue, view, guard);
    this.forms = new LocalDocumentFormsService(id, queue, view, guard, publisher);
    this.fonts = new LocalDocumentFontSettings(id, queue, view, guard);
    this.search = new LocalDocumentSearchService(id, queue, view, guard);
    this.pages = new LocalDocumentPagesService(id, queue, view, guard, publisher);
    this.redaction = new LocalDocumentRedactionService(id, queue, view, guard, publisher);
    this.signatures = new LocalDocumentSignaturesService(id, queue, view, guard, publisher);
  }

  private get closed(): boolean {
    return this.doc.isClosed();
  }

  private get guard(): ScopeGuard {
    return this.doc.guard;
  }

  /**
   * The same document, every call made through it carrying `facts` on top of
   * this handle's own (see `DocumentHandle.with`).
   */
  with(facts: CallFacts): LocalDocumentHandle {
    const merged: CallFacts = { ...this.facts, ...facts };
    const key = `${merged.priority ?? 'auto'}\u0000${merged.view ?? ''}`;
    let handle = this.doc.withFacts.get(key);
    if (!handle) {
      handle = new LocalDocumentHandle(this.doc, merged);
      this.doc.withFacts.set(key, handle);
    }
    return handle;
  }

  /** What `view` shows of the document (see `DocumentHandle.setWorkingSet`). */
  setWorkingSet(view: string, pages: readonly WorkingSetPage[]): void {
    if (this.closed) return;
    this.doc.queue.setWorkingSet(this.id, view, pages);
  }

  /**
   * The saved version this session is on: SHA-256 and length of the
   * loaded bytes (for a layer session, of its base).
   */
  version(): AbortablePromise<BaseVersionInfo> {
    if (this.closed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.id}`),
      );
    }
    try {
      this.guard.assertCapability('doc.open');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.id;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'document.version', effect: 'read', jobId, docId }),
    });
    return AbortablePromise.run<BaseVersionInfo>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'document.version') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.version;
    });
  }

  /**
   * Returns a `PageHandle` keyed on the page's address. We don't validate
   * the page exists synchronously: the worker resolves the address on every
   * call. This matches the cloud engine, which cannot validate without a
   * round-trip either. Display order is geometry, not liveness: clients read
   * it from `pages.list()` (each `PageLayout.index`), joined by `ref`.
   */
  page(ref: PageRef): LocalPageHandle {
    return new LocalPageHandle(
      ref,
      this.id,
      this.queue,
      { isClosed: this.doc.isClosed },
      this.doc.imageEncoder,
      this.guard,
      this.doc.publisher,
      this.doc.renderPolicy,
    );
  }

  download(options: DownloadOptions = {}): AbortablePromise<Uint8Array> {
    if (this.closed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.id}`),
      );
    }
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.id;
    const mode = options.mode ?? DEFAULT_PDF_SAVE_MODE;
    // A rewrite of a signed document is refused by the worker (one rule for
    // both engines).
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'document.saveBuffer',
          effect: 'snapshot',
          jobId,
          docId,
          mode,
        }),
    });
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'document.saveBuffer') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return new Uint8Array(payload.bytes);
    });
  }

  /** Export just this document's layer as a re-openable artifact. */
  downloadLayer(): AbortablePromise<Uint8Array> {
    if (this.closed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.id}`),
      );
    }
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.id;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'document.saveLayerBuffer', effect: 'snapshot', jobId, docId }),
    });
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'document.saveLayerBuffer') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return new Uint8Array(payload.bytes);
    });
  }

  /** Node runtimes only: the document written to a local file, never through JS (see `DocumentHandle`). */
  downloadToFile(path: string, options?: DownloadOptions): AbortablePromise<void> {
    if (this.closed) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.id}`),
      );
    }
    const mode: PdfSaveMode = options?.mode ?? DEFAULT_PDF_SAVE_MODE;
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.id;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'document.saveFile', effect: 'snapshot', jobId, docId, mode, path }),
    });
    return AbortablePromise.run<void>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'document.saveFile') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
    });
  }

  close(): AbortablePromise<void> {
    if (this.closed) {
      return AbortablePromise.resolveValue<void>(undefined);
    }
    this.doc.close();
    this.doc.queue.forgetWorkingSets(this.id);
    const docId = this.id;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) => wirePack({ kind: 'close', effect: 'close', jobId, docId }),
    });
    return AbortablePromise.run<void>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      await submission;
    });
  }
}
