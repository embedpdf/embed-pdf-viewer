import {
  AbortablePromise,
  checkImageQuality,
  createPageImageHandle,
  EngineError,
  EngineErrorCode,
  wirePack,
  type AnnotationAppearanceImage,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceImagesResult,
  type AnnotationAppearanceRenderOptions,
  type AnnotationAppearancesResult,
  type AnnotationFamily,
  type DocCapability,
  type EngineRenderPolicy,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import { assertAppearanceOnLattice, withAppearanceBudget } from '../render/renderPolicyGuard';
import type { ScopeGuard } from '../scope';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

/** What a page's appearance batch needs: its page, its queue and its rules. */
export interface AppearanceBatchContext {
  readonly docId: string;
  readonly page: PageRef;
  readonly queue: JobQueue;
  readonly isClosed: () => boolean;
  readonly guard: ScopeGuard;
  readonly policy: EngineRenderPolicy;
}

/**
 * Every appearance of one family on a page, each as its own raw raster: the
 * page's annotations except widgets (`doc.annotate.read`), or its widgets
 * (`doc.forms.read`). Seeing how something draws takes what reading it takes.
 * The deployment policy applies as it does to full pages: appearances are
 * sized by `rect × scale`, so an enforced lattice bounds the scale and the
 * pixel budget rides into the worker.
 */
export function renderAppearanceRasters(
  ctx: AppearanceBatchContext,
  family: AnnotationFamily,
  options?: AnnotationAppearanceRenderOptions,
): AbortablePromise<AnnotationAppearancesResult> {
  if (ctx.isClosed()) {
    return AbortablePromise.rejectReason(
      new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${ctx.docId}`),
    );
  }
  const capability: DocCapability = family === 'widgets' ? 'doc.forms.read' : 'doc.annotate.read';
  try {
    ctx.guard.assertCapability(capability);
    assertAppearanceOnLattice(ctx.policy, options);
  } catch (err) {
    return AbortablePromise.rejectReason(err);
  }
  const effectiveOptions = withAppearanceBudget(ctx.policy, options);
  const { docId, page } = ctx;
  const submission = ctx.queue.enqueue<WorkerResultPayload>({
    buildPack: (jobId: JobId) =>
      wirePack({
        kind: 'annotations.renderAppearances',
        effect: 'read',
        jobId,
        docId,
        page,
        family,
        ...(effectiveOptions ? { options: effectiveOptions } : {}),
      }),
  });
  return AbortablePromise.run<AnnotationAppearancesResult>(async (signal) => {
    const onAbort = () => submission.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    const payload = await submission;
    if (payload.tag !== 'annotations.renderAppearances') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
    }
    return payload.result;
  });
}

/** The same appearances, each encoded by the engine's image encoder. */
export function renderAppearanceImages(
  ctx: AppearanceBatchContext,
  encoder: LocalImageEncoder,
  family: AnnotationFamily,
  options: AnnotationAppearanceImageOptions = {},
): AbortablePromise<AnnotationAppearanceImagesResult> {
  return AbortablePromise.run<AnnotationAppearanceImagesResult>(async (signal) => {
    checkImageQuality(options.quality);
    const raw = renderAppearanceRasters(ctx, family, options);
    const onAbort = () => raw.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    const result = await raw;
    if (signal.aborted) throw new EngineError(EngineErrorCode.Aborted, 'appearance render aborted');

    // Encode each raster sequentially. `encoder.encode` transfers the
    // raster's backing buffer into a worker, so we never touch
    // `appearance.raster.data` again after this point.
    const appearances: AnnotationAppearanceImage[] = [];
    for (const appearance of result.appearances) {
      if (signal.aborted) {
        throw new EngineError(EngineErrorCode.Aborted, 'appearance render aborted');
      }
      const encoded = await encoder.encode(appearance.raster, options, signal);
      if (encoded.source.kind !== 'bytes') {
        throw new EngineError(
          EngineErrorCode.WireFormat,
          'local appearance image handle expected a byte source',
        );
      }
      const bytes = encoded.source.bytes;
      const image = createPageImageHandle(encoded, {
        async blob() {
          return new Blob([copyToExactArrayBuffer(bytes)], { type: encoded.contentType });
        },
      });
      appearances.push({
        ref: appearance.ref,
        mode: appearance.mode,
        state: appearance.state,
        rect: appearance.rect,
        image,
      });
    }
    return { page: result.page, appearances };
  });
}

function copyToExactArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const body = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(body).set(bytes);
  return body;
}
