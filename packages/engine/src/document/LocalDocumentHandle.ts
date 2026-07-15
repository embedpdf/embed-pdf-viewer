import {
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
  type DocumentSecurityProbeInfo,
  type DocumentSecurityService,
  type MetadataService,
  type PageHandle,
  type PageObjectNumber,
  type PdfSaveMode,
} from '@embedpdf/engine-core/runtime';
import { EventHub, SessionEventPublisher } from '@embedpdf/engine-services';

import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import type { ScopeGuard } from '../scope';
import { LocalDocumentAnnotationsService } from './LocalDocumentAnnotationsService';
import { LocalDocumentActionsService } from './LocalDocumentActionsService';
import { LocalDocumentFormsService } from './LocalDocumentFormsService';
import { LocalDocumentPagesService } from './LocalDocumentPagesService';
import { LocalDocumentSearchService } from './LocalDocumentSearchService';
import { LocalDocumentSecurityService } from './LocalDocumentSecurityService';
import { LocalMetadataService } from './LocalMetadataService';
import { LocalPageHandle } from './LocalPageHandle';
import { LocalPieceInfoService } from './LocalPieceInfoService';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

export class LocalDocumentHandle implements DocumentHandle {
  readonly capabilities = {
    weakAnnotationEditSessions: 'not-needed',
    pageEditSessions: 'unsupported',
  } as const;
  readonly metadata: MetadataService;
  readonly pieceInfo: LocalPieceInfoService;
  readonly annotations: DocumentAnnotationsService;
  readonly actions: DocumentActionsService;
  readonly forms: LocalDocumentFormsService;
  readonly search: LocalDocumentSearchService;
  readonly pages: DocumentPagesService;
  readonly security: DocumentSecurityService;
  readonly events: DocumentEventStream;
  private readonly publisher: SessionEventPublisher;
  private closed = false;

  constructor(
    readonly id: string,
    private readonly queue: WorkerQueue,
    private readonly imageEncoder: LocalImageEncoder,
    initialSecurity: DocumentSecurityProbeInfo,
    private readonly guard: ScopeGuard,
    sessionId: string,
  ) {
    const view = { isClosed: () => this.closed };
    const hub = new EventHub();
    this.events = hub;
    // A single instance, so every event is `kind: 'local'` — the same
    // interface as cloud with the collaborative fields at rest.
    this.publisher = new SessionEventPublisher(hub, sessionId);
    this.security = new LocalDocumentSecurityService(initialSecurity, id, queue, view, guard);
    this.metadata = new LocalMetadataService(id, queue, view, guard, this.publisher);
    // Catalog-level /PieceInfo (no pon); page-level lives on each page handle.
    this.pieceInfo = new LocalPieceInfoService(id, queue, view, guard);
    this.annotations = new LocalDocumentAnnotationsService(id, queue, view, guard);
    this.actions = new LocalDocumentActionsService(id, queue, view, guard);
    this.forms = new LocalDocumentFormsService(id, queue, view, guard, this.publisher);
    this.search = new LocalDocumentSearchService(id, queue, view, guard);
    this.pages = new LocalDocumentPagesService(id, queue, view, guard, this.publisher);
  }

  /**
   * Returns a `PageHandle` keyed on the page's PDF indirect object
   * number. We don't validate the page exists synchronously - the worker
   * does that on the next call. This matches the cloud engine, which
   * cannot validate without a round-trip either.
   *
   * `pageIndex` is advisory metadata, reported as `-1`. Display order is
   * geometry, not liveness: clients read it from `pages.list()` (each
   * `PageLayout.index`), joined to this handle by `pageObjectNumber`.
   */
  page(pageObjectNumber: PageObjectNumber): PageHandle {
    return new LocalPageHandle(
      pageObjectNumber,
      -1,
      this.id,
      this.queue,
      {
        isClosed: () => this.closed,
      },
      this.imageEncoder,
      this.guard,
      this.publisher,
    );
  }

  download(opts: { mode?: PdfSaveMode } = {}): AbortablePromise<Uint8Array> {
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
    const mode = opts.mode ?? DEFAULT_PDF_SAVE_MODE;
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

  /** Export just this document's layer as a re-openable artifact. Rejects when the
   *  document was opened without a layer (the worker rejects a base-only session). */
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
