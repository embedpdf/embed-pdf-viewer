import {
  AbortablePromise,
  CONTINUOUS_RENDER_POLICY,
  EngineError,
  EngineErrorCode,
  createPageImageHandle,
  renderTransform,
  wirePack,
  type EngineRenderPolicy,
  type PageImageOptions,
  type PageRenderImage,
  type PageRenderOptions,
  type PageRenderRaster,
  type LocalPageRenderService as LocalPageRenderServiceContract,
  type PageRef,
  checkImageQuality,
  resolvePageLayers,
} from '@embedpdf/engine-core/runtime';

import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import { assertFullPageOnLattice, withRenderBudget } from '../render/renderPolicyGuard';
import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

export class LocalPageRenderService implements LocalPageRenderServiceContract {
  constructor(
    private readonly docId: string,
    private readonly ref: PageRef,
    private readonly queue: JobQueue,
    private readonly view: DocClosedView,
    private readonly encoder: LocalImageEncoder,
    private readonly guard: ScopeGuard,
    private readonly policy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY,
  ) {}

  raw(options?: PageRenderOptions): AbortablePromise<PageRenderRaster> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    // Cloud parity: /render gates on `doc.render` (the session-level
    // rendering capability), and a picture draws the annotations and form
    // fields the caller may read. image() flows through raw() so the checks
    // here cover both.
    // Deployment render policy (localEngine({ renderPolicy })): an
    // enforced lattice rejects off-lattice full-page renders exactly like
    // the enforcing server, and the policy's pixel budget rides into the
    // worker either way. Both are the identity under the default
    // `continuous` policy.
    let layers: ReturnType<typeof resolvePageLayers>;
    try {
      this.guard.assertCapability('doc.render');
      layers = resolvePageLayers(options, {
        annotations: this.guard.can('doc.annotate.read'),
        formFields: this.guard.can('doc.forms.read'),
      });
      assertFullPageOnLattice(this.policy, options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    const effectiveOptions = withRenderBudget(this.policy, { ...options, ...layers });
    const docId = this.docId;
    const ref = this.ref;
    const target = options?.target;
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          kind: 'pages.render',
          effect: 'read',
          jobId,
          docId,
          page: ref,
          options: effectiveOptions,
        }),
      // A tile is about its part of the page: off screen, it ranks as near.
      ...(target?.kind === 'rect' ? { region: target.rect } : {}),
    });
    return AbortablePromise.run<PageRenderRaster>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'pages.render') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      const { raster, area } = payload;
      return {
        ...raster,
        transform: renderTransform(area, options?.rotation ?? 0, raster.width, raster.height),
      };
    });
  }

  image(options: PageImageOptions = {}): AbortablePromise<PageRenderImage> {
    return AbortablePromise.run<PageRenderImage>(async (signal) => {
      checkImageQuality(options.quality);
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
      const handle = createPageImageHandle(result, {
        async blob() {
          return new Blob([copyToExactArrayBuffer(bytes)], {
            type: result.contentType,
          });
        },
      });
      return { ...handle, transform: raster.transform };
    });
  }
}

function copyToExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}
