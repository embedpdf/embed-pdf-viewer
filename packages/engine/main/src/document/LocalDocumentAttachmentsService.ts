import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  normalizeAttachmentFileSource,
  wirePack,
  type AttachmentContent,
  type AttachmentCreateResult,
  type AttachmentDeleteResult,
  type AttachmentFileSource,
  type DocumentAttachmentsService,
  type EmbeddedFileItem,
  type EmbeddedFileRef,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Document-level attachments (the catalog's `/EmbeddedFiles` name tree)
 * for the local engine. `list()`/`download()` are pure reads over the
 * worker session; `create()`/`delete()` are mutations.
 *
 * Gating mirrors the metadata/bytes tier split the cloud routes use:
 * `list()` (metadata only) rides the base `doc.open` read; `download()`
 * egresses content bytes, so it gates on `doc.download` — the same rule
 * as `pages.extract` and the whole-document download. `create`/`delete`
 * are mutations gated on `doc.attachments.modify` and publish
 * `attachment.created`/`attachment.deleted` events after the worker
 * confirms — ground truth, never optimistic.
 */
export class LocalDocumentAttachmentsService implements DocumentAttachmentsService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  list(): AbortablePromise<EmbeddedFileItem[]> {
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
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'attachments.list', jobId, docId }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<EmbeddedFileItem[]>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'attachments.list') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.items;
    });
  }

  download(ref: EmbeddedFileRef): AbortablePromise<AttachmentContent> {
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
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'attachments.readFile', jobId, docId, ref }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<AttachmentContent>(async (signal) => {
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
      return {
        bytes: new Uint8Array(content.bytes),
        name: content.name,
        ...(content.mimeType !== undefined ? { mimeType: content.mimeType } : {}),
      };
    });
  }

  create(file: AttachmentFileSource): AbortablePromise<AttachmentCreateResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.attachments.modify');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    return AbortablePromise.run<AttachmentCreateResult>(async (signal) => {
      // Same splitter the file-attachment annotation draft uses: metadata
      // into the JSON body, bytes onto the transfer list.
      const { wireFile, resource } = await normalizeAttachmentFileSource(file, 'r0');
      const submission = this.queue.enqueue<WorkerResultPayload>(
        {
          buildPack: (jobId: JobId) =>
            wirePack(
              {
                kind: 'attachments.create',
                jobId,
                docId,
                file: wireFile,
                resources: { r0: resource },
              },
              [resource.bytes],
            ),
        },
        { priority: Priority.MEDIUM },
      );
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'attachments.create') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({ type: 'attachment.created', ...payload.result });
      return payload.result;
    });
  }

  delete(ref: EmbeddedFileRef): AbortablePromise<AttachmentDeleteResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.attachments.modify');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'attachments.delete', jobId, docId, ref }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<AttachmentDeleteResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'attachments.delete') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({ type: 'attachment.deleted', ...payload.result });
      return payload.result;
    });
  }
}
