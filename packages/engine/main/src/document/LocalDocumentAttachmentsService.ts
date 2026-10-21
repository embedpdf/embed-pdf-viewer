import {
  ATTACHMENT_LIMITS,
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type AttachmentList,
  type AttachmentRef,
  type AttachmentWriteVerb,
  type DocumentAttachmentsService,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * The reads of document-level attachments (the catalog's `/EmbeddedFiles`
 * name tree) on the local engine, pure reads over the worker session;
 * `create` and `delete` are changes (`attachmentVerbs`).
 *
 * Gating mirrors the metadata/bytes tier split the cloud routes use:
 * `list()` (metadata only) rides the base `doc.open` read; `download()`
 * egresses content bytes, so it gates on `doc.download` — the same rule
 * as `pages.extract` and the whole-document download.
 */
export class LocalDocumentAttachmentsService implements Omit<
  DocumentAttachmentsService,
  AttachmentWriteVerb
> {
  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
  ) {}

  list(): AbortablePromise<AttachmentList> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.open');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({ kind: 'attachments.list', effect: 'read', jobId, docId }),
    });
    return AbortablePromise.run<AttachmentList>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'attachments.list') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return { attachments: payload.attachments };
    });
  }

  download(ref: AttachmentRef): AbortablePromise<Uint8Array> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.download');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'attachments.readFile',
          effect: 'read',
          jobId,
          docId,
          ref,
          maxDecodedBytes: ATTACHMENT_LIMITS.decodedBytes,
        }),
    });
    return AbortablePromise.run<Uint8Array>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'attachments.readFile') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      const { content } = payload;
      if (content.bytes === undefined) {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          'attachments.readFile returned no bytes (path mode is server-only)',
        );
      }
      return new Uint8Array(content.bytes);
    });
  }
}
