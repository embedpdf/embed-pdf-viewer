import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentMetadata,
  type MetadataPatch,
  type MetadataService,
  type MetadataUpdateResult,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

export class LocalMetadataService implements MetadataService {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {}

  read(): AbortablePromise<DocumentMetadata> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Metadata read is session-level — same gate as /head/manifest on
    // the cloud (`doc.open`). The metadata routes use
    // `requireLayerCapability('doc.open', ...)`.
    try {
      this.guard.assertCapability('doc.open');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'metadata.read', jobId, docId }),
      },
      { priority: Priority.MEDIUM },
    );
    return AbortablePromise.run<DocumentMetadata>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });

      const payload = await submission;
      if (payload.tag !== 'metadata.read') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.metadata;
    });
  }

  update(patch: MetadataPatch): AbortablePromise<MetadataUpdateResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // metadata.update maps to the cloud's POST /metadata (gated by
    // `doc.metadata.modify`, PDF bit 4).
    try {
      this.guard.assertCapability('doc.metadata.modify');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) => wirePack({ kind: 'metadata.update', jobId, docId, patch }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<MetadataUpdateResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'metadata.update') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.publisher.publishLocal({ type: 'metadata.updated', ...payload.result });
      return payload.result;
    });
  }
}
