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
  type DocumentHandle,
  type DocumentPagesService,
  type DocumentRedactionService,
  CONTINUOUS_RENDER_POLICY,
  type DocumentRenderService,
  type DocumentSecurityProbeInfo,
  type EngineRenderPolicy,
  type MetadataService,
  type PageHandle,
  type DownloadOptions,
  type PdfSaveMode,
  type PageRef,
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
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

export class LocalDocumentHandle implements DocumentHandle {
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
  private readonly publisher: SessionEventPublisher;
  private readonly renderPolicy: EngineRenderPolicy;
  private closed = false;

  constructor(
    readonly id: string,
    private readonly queue: WorkerQueue,
    private readonly imageEncoder: LocalImageEncoder,
    initialSecurity: DocumentSecurityProbeInfo,
    private readonly guard: ScopeGuard,
    sessionId: string,
    renderPolicy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY,
  ) {
    const view = { isClosed: () => this.closed };
    this.renderPolicy = renderPolicy;
    this.render = { getPolicy: () => AbortablePromise.resolveValue(this.renderPolicy) };
    const hub = new EventHub();
    this.events = hub;
    // A single instance, so every event is `kind: 'local'` — the same
    // interface as cloud with the collaborative fields at rest.
    this.publisher = new SessionEventPublisher(hub, sessionId);
    this.security = new LocalDocumentSecurityService(initialSecurity, id, queue, view, guard);
    this.metadata = new LocalMetadataService(id, queue, view, guard, this.publisher);
    // Catalog-level /PieceInfo (no pon); page-level lives on each page handle.
    this.pieceInfo = new LocalPieceInfoService(id, queue, view, guard);
    this.annotations = new LocalDocumentAnnotationsService(id, queue, view, guard, this.publisher);
    this.attachments = new LocalDocumentAttachmentsService(id, queue, view, guard, this.publisher);
    this.actions = new LocalDocumentActionsService(id, queue, view, guard);
    this.forms = new LocalDocumentFormsService(id, queue, view, guard, this.publisher);
    this.fonts = new LocalDocumentFontSettings(id, queue, view, guard);
    this.search = new LocalDocumentSearchService(id, queue, view, guard);
    this.pages = new LocalDocumentPagesService(id, queue, view, guard, this.publisher);
    this.redaction = new LocalDocumentRedactionService(id, queue, view, guard, this.publisher);
    this.signatures = new LocalDocumentSignaturesService(id, queue, view, guard, this.publisher);
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
    const submission = this.queue.enqueue<WorkerResultPayload>(
      { buildPack: (jobId: JobId) => wirePack({ kind: 'document.version', jobId, docId }) },
      { priority: Priority.MEDIUM },
    );
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
  page(ref: PageRef): PageHandle {
    return new LocalPageHandle(
      ref,
      this.id,
      this.queue,
      {
        isClosed: () => this.closed,
      },
      this.imageEncoder,
      this.guard,
      this.publisher,
      this.renderPolicy,
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
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'document.saveBuffer',
            jobId,
            docId,
            mode,
          }),
      },
      { priority: Priority.HIGH },
    );
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

  /** Export just this document's layer as a re-openable artifact. Works for every
   *  session opened as a layer (the default); rejects on a `sessionKind: 'plain'`
   *  session, which has no layer to export. */
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
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'document.saveLayerBuffer', jobId, docId }),
      },
      { priority: Priority.HIGH },
    );
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
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'document.saveFile', jobId, docId, mode, path }),
      },
      { priority: Priority.HIGH },
    );
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
    this.closed = true;
    const docId = this.id;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'close', jobId, docId }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<void>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      await submission;
    });
  }
}
