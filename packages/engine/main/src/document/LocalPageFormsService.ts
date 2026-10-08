import {
  CONTINUOUS_RENDER_POLICY,
  type AbortablePromise,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceImagesResult,
  type AnnotationAppearanceRenderOptions,
  type AnnotationAppearancesResult,
  type EngineRenderPolicy,
  type LocalPageFormsService as LocalPageFormsServiceContract,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import {
  renderAppearanceImages,
  renderAppearanceRasters,
  type AppearanceBatchContext,
} from './appearanceBatch';
import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import type { ScopeGuard } from '../scope';
import type { JobQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/** Page-scoped form service: the page's widget images, every mode and state. */
export class LocalPageFormsService implements LocalPageFormsServiceContract {
  private readonly batch: AppearanceBatchContext;

  constructor(
    docId: string,
    ref: PageRef,
    queue: JobQueue,
    view: DocClosedView,
    private readonly encoder: LocalImageEncoder,
    guard: ScopeGuard,
    policy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY,
  ) {
    this.batch = { docId, page: ref, queue, isClosed: () => view.isClosed(), guard, policy };
  }

  renderAppearancesRaw(
    options?: AnnotationAppearanceRenderOptions,
  ): AbortablePromise<AnnotationAppearancesResult> {
    return renderAppearanceRasters(this.batch, 'widgets', options);
  }

  renderAppearances(
    options: AnnotationAppearanceImageOptions = {},
  ): AbortablePromise<AnnotationAppearanceImagesResult> {
    return renderAppearanceImages(this.batch, this.encoder, 'widgets', options);
  }
}
