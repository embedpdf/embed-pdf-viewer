import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  wirePack,
  type DocumentFontSettings,
  type DocumentSetFontSettingsWorkerRequest,
  type FontEmbeddingPolicy,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

/**
 * Per-document font and text-layout settings for the local engine: one
 * `document.setFontSettings` request per call, applied on the worker's
 * document session. Session state only — nothing is written to the file.
 */
export class LocalDocumentFontSettings implements DocumentFontSettings {
  constructor(
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: { isClosed(): boolean },
    private readonly guard: ScopeGuard,
    private readonly layerName?: string,
  ) {}

  setEmbeddingPolicy(policy: FontEmbeddingPolicy): AbortablePromise<void> {
    return this.send({ embeddingPolicy: policy });
  }

  setTypographicFeatures(enabled: boolean): AbortablePromise<void> {
    return this.send({ typographicFeatures: enabled });
  }

  private send(
    settings: Omit<DocumentSetFontSettingsWorkerRequest, 'kind' | 'jobId' | 'docId' | 'layerName'>,
  ): AbortablePromise<void> {
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
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'document.setFontSettings',
          jobId,
          docId: this.docId,
          ...(this.layerName !== undefined ? { layerName: this.layerName } : {}),
          ...settings,
        }),
    });
    return AbortablePromise.run<void>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'document.setFontSettings') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
    });
  }
}
