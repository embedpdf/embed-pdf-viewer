import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  opIdOf,
  resolvePageExtract,
  wirePack,
  type DocumentPagesService,
  type PageExtractFlatten,
  type PageExtractOptions,
  type PageListSnapshot,
  type PageNameInput,
  type PageNameResult,
  type PageRemoveNameInput,
  type PageFlattenResult,
  type PageStructureVerb,
  type FlattenWriteOptions,
  type SessionEventPublisher,
  type WriteOptions,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Document-scoped page service for the local engine: the reads, extract,
 * flatten and the page names. The structure verbs are changes
 * (`pageVerbs`), so they can be undone. All work funnels through the same
 * in-process worker the rest of the engine uses, in the order it was asked.
 */
export class LocalDocumentPagesService implements Omit<DocumentPagesService, PageStructureVerb> {
  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<PageListSnapshot> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // pages.list is the page-geometry read: a session-level read gated by
    // `doc.open` (mirrors the cloud's /layout endpoint, which is itself
    // gated behind the manifest's `doc.open` read).
    try {
      this.guard.assertCapability('doc.open');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) => wirePack({ kind: 'pages.list', effect: 'read', jobId, docId }),
    });
    return AbortablePromise.run<PageListSnapshot>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.list') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.snapshot;
    });
  }

  setName(input: PageNameInput, options?: WriteOptions): AbortablePromise<PageNameResult> {
    return this.runNameJob(
      { kind: 'pages.setName', effect: 'write', ...input },
      'pages.setName',
      input.name,
      options,
    );
  }

  removeName(input: PageRemoveNameInput, options?: WriteOptions): AbortablePromise<PageNameResult> {
    return this.runNameJob(
      { kind: 'pages.removeName', effect: 'write', name: input.name },
      'pages.removeName',
      input.name,
      options,
    );
  }

  /**
   * Named pages are layout: both verbs are page-structure mutations mapped
   * to the cloud's POST /pages/names and /pages/names/delete (gated by
   * `doc.pages.assemble`, like every page-structure verb) and publish one
   * `pages.named` event carrying the fresh layout.
   */
  private runNameJob(
    request:
      | {
          kind: 'pages.setName';
          effect: 'write';
          name: string;
          page: PageRef;
          replace?: string;
        }
      | { kind: 'pages.removeName'; effect: 'write'; name: string },
    tag: 'pages.setName' | 'pages.removeName',
    name: string,
    options: WriteOptions | undefined,
  ): AbortablePromise<PageNameResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
      this.guard.assertCapability('doc.pages.assemble');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) => wirePack({ ...request, jobId, opId, docId }),
    });
    return AbortablePromise.run<PageNameResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== tag) {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishWrite(opId, {
        type: 'pages.named',
        name,
        page: request.kind === 'pages.setName' ? request.page : null,
        ...payload.result,
      });
      return payload.result;
    });
  }

  flatten(pages: PageRef[], options?: FlattenWriteOptions): AbortablePromise<PageFlattenResult> {
    const usage = options?.usage ?? 'display';
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
      // Flatten rewrites page content and removes painted annotations. Broad
      // annotation authority is deliberate; collab-scoped deletion cannot be
      // safely enforced by a whole-page verb.
      this.guard.assertCapability('doc.pages.modify');
      this.guard.assertCapability('doc.annotate.modify');
    } catch (error) {
      return AbortablePromise.rejectReason(error);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'pages.flatten',
          effect: 'contentWrite',
          jobId,
          opId,
          docId,
          pages,
          usage,
        }),
    });
    return AbortablePromise.run<PageFlattenResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.flatten') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      if (payload.wrote) {
        this.publisher.publishWrite(opId, { type: 'pages.flattened', ...payload.result });
      }
      return payload.result;
    });
  }

  extract(pages: PageRef[], options?: PageExtractOptions): AbortablePromise<Uint8Array> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // pages.extract egresses content bytes (a partial download), so it is
    // gated by `doc.download` — not `doc.pages.assemble`: it reads, never
    // restructures. A flattened copy also passes on `doc.download.flattened`,
    // and paints only what the caller may read. No event is published:
    // nothing about the document changed.
    let flatten: PageExtractFlatten | null;
    try {
      flatten = resolvePageExtract(options, {
        download: this.guard.can('doc.download'),
        downloadFlattened: this.guard.can('doc.download.flattened'),
        annotations: this.guard.can('doc.annotate.read'),
        formFields: this.guard.can('doc.forms.read'),
      });
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'pages.extract',
          effect: 'snapshot',
          jobId,
          docId,
          pages,
          ...(flatten ? { flatten } : {}),
        }),
    });
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.extract') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return new Uint8Array(payload.bytes);
    });
  }
}
