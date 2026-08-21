import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentPagesService,
  type PageDeleteResult,
  type PageInsertBlankSpec,
  type PageInsertResult,
  type PageListSnapshot,
  type PageMoveResult,
  type PageObjectNumber,
  type PageRotateResult,
  type PageRotation,
  type PageFlattenResult,
  type PageFlattenUsage,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/** Detach a Uint8Array view into a standalone, transferable ArrayBuffer. */
function copyToExactBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(view.byteLength);
  new Uint8Array(copy).set(view);
  return copy;
}

/**
 * Document-scoped page service for the local engine. All work funnels
 * through the same in-process worker the rest of the engine uses, so
 * `pages.move()` is sequenced against any in-flight annotation
 * mutations: a page reorder cannot land while a write to one of those
 * pages is mid-flight, and the reorder is observed atomically by every
 * subsequent read.
 */
export class LocalDocumentPagesService implements DocumentPagesService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
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
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'pages.list', jobId, docId }),
      },
      { priority: Priority.MEDIUM },
    );
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

  move(pageObjectNumbers: PageObjectNumber[], destIndex: number): AbortablePromise<PageMoveResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // pages.move maps to the cloud's POST /pages/move (gated by
    // `doc.pages.assemble`).
    try {
      this.guard.assertCapability('doc.pages.assemble');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.move',
            jobId,
            docId,
            pageObjectNumbers,
            destIndex,
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<PageMoveResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.move') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'pages.moved',
        pageObjectNumbers,
        destIndex,
        ...payload.result,
      });
      return payload.result;
    });
  }

  rotate(
    pageObjectNumbers: PageObjectNumber[],
    rotation: PageRotation,
  ): AbortablePromise<PageRotateResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // pages.rotate maps to the cloud's POST /pages/rotate (gated by
    // `doc.pages.assemble`, like every page-structure verb).
    try {
      this.guard.assertCapability('doc.pages.assemble');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.rotate',
            jobId,
            docId,
            pageObjectNumbers,
            rotation,
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<PageRotateResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.rotate') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'pages.rotated',
        pageObjectNumbers,
        rotation,
        ...payload.result,
      });
      return payload.result;
    });
  }

  delete(pageObjectNumbers: PageObjectNumber[]): AbortablePromise<PageDeleteResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // pages.delete maps to the cloud's POST /pages/delete (gated by
    // `doc.pages.assemble`, like every page-structure verb).
    try {
      this.guard.assertCapability('doc.pages.assemble');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.delete',
            jobId,
            docId,
            pageObjectNumbers,
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<PageDeleteResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.delete') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'pages.deleted',
        pageObjectNumbers,
        ...payload.result,
      });
      return payload.result;
    });
  }

  flatten(
    pageObjectNumbers: PageObjectNumber[],
    usage: PageFlattenUsage = 'display',
  ): AbortablePromise<PageFlattenResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      // Flatten rewrites page content and removes painted annotations. Broad
      // annotation authority is deliberate; collab-scoped deletion cannot be
      // safely enforced by a whole-page verb.
      this.guard.assertCapability('doc.pages.modify');
      this.guard.assertCapability('doc.annotate.modify');
    } catch (error) {
      return AbortablePromise.rejectReason(error);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'pages.flatten', jobId, docId, pageObjectNumbers, usage }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<PageFlattenResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.flatten') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      if (payload.result.meta !== null) {
        this.publisher.publishLocal({
          type: 'pages.flattened',
          ...payload.result,
        });
      }
      return payload.result;
    });
  }

  insert(bytes: Uint8Array | ArrayBuffer, destIndex?: number): AbortablePromise<PageInsertResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // pages.insert is a structure verb like move/delete — same gate; it will
    // map to the cloud's POST /pages/insert (multipart) when that ships.
    try {
      this.guard.assertCapability('doc.pages.assemble');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    // A Uint8Array view is copied to a fresh ArrayBuffer so the transfer
    // can't disturb a larger buffer the caller still owns (the open() rule);
    // a bare ArrayBuffer transfers as-is — the call takes ownership.
    const buffer = bytes instanceof ArrayBuffer ? bytes : copyToExactBuffer(bytes);
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({ kind: 'pages.insert', jobId, docId, bytes: buffer, destIndex }, [buffer]),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<PageInsertResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.insert') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'pages.inserted',
        destIndex,
        ...payload.result,
      });
      return payload.result;
    });
  }

  insertBlank(spec: PageInsertBlankSpec, destIndex?: number): AbortablePromise<PageInsertResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // The blank-page sibling of pages.insert: same structure gate, same
    // event; it will map to the cloud's JSON POST /pages/insert-blank when
    // that ships. Pure parameters — nothing to transfer.
    try {
      this.guard.assertCapability('doc.pages.assemble');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.insertBlank',
            jobId,
            docId,
            size: spec.size,
            count: spec.count,
            destIndex,
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<PageInsertResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.insertBlank') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({
        type: 'pages.inserted',
        destIndex,
        ...payload.result,
      });
      return payload.result;
    });
  }

  extract(pageObjectNumbers: PageObjectNumber[]): AbortablePromise<Uint8Array> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // pages.extract egresses content bytes (a partial download), so it is
    // gated by `doc.download` — NOT `doc.pages.assemble`: it reads, never
    // restructures. No event is published: nothing about the document changed.
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.extract',
            jobId,
            docId,
            pageObjectNumbers,
          }),
      },
      { priority: Priority.MEDIUM },
    );
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
