import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  createPageImageHandle,
  wirePack,
  type PageImageHandle,
  type PageImageOptions,
  type PageObjectNumber,
  type PageRaster,
  type PageRenderOptions,
  type PageRenderService,
} from '@embedpdf/engine-core/runtime';

import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

export class LocalPageRenderService implements PageRenderService {
  constructor(
    private readonly docId: string,
    private readonly pageObjectNumber: PageObjectNumber,
    private readonly queue: WorkerQueue,
    private readonly view: DocClosedView,
    private readonly encoder: LocalImageEncoder,
    private readonly guard: ScopeGuard,
  ) {}

  raw(options?: PageRenderOptions): AbortablePromise<PageRaster> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Cloud parity: /render gates on `doc.render` (the session-level
    // rendering capability). image() flows through raw() so a single
    // assertion here covers both.
    try {
      this.guard.assertCapability('doc.render');
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const docId = this.docId;
    const pon = this.pageObjectNumber;
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'pages.render',
            jobId,
            docId,
            pageObjectNumber: pon,
            options,
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<PageRaster>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.render') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      return payload.raster;
    });
  }

  image(options: PageImageOptions = {}): AbortablePromise<PageImageHandle> {
    return AbortablePromise.run<PageImageHandle>(async (signal) => {
      const raw = this.raw(options);
      const onAbort = () => raw.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const raster = await raw;
      if (signal.aborted)
        throw new EngineError(EngineErrorCode.Aborted, 'page image render aborted');
      const result = await this.encoder.encode(raster, options, signal);
      if (result.source.kind !== 'bytes') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          'local page image handle expected a byte source',
        );
      }
      const bytes = result.source.bytes;
      return createPageImageHandle(result, {
        async blob() {
          return new Blob([copyToExactArrayBuffer(bytes)], {
            type: result.contentType,
          });
        },
      });
    });
  }
}

function copyToExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}
