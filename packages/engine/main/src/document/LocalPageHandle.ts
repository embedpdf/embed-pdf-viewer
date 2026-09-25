import {
  CONTINUOUS_RENDER_POLICY,
  type EngineRenderPolicy,
  type PageHandle,
  type PageObjectNumber,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { LocalPageAnnotationsService } from './LocalPageAnnotationsService';
import { LocalPageGeometryService } from './LocalPageGeometryService';
import { LocalPageRenderService } from './LocalPageRenderService';
import { LocalPageTextService } from './LocalPageTextService';
import { LocalPieceInfoService } from './LocalPieceInfoService';
import { LocalPageMeasureService } from './LocalPageMeasureService';
import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import type { ScopeGuard } from '../scope';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Local page handle: the page's address and its services. The per-page
 * services each own their queue interaction; the handle is otherwise
 * stateless.
 */
export class LocalPageHandle implements PageHandle {
  readonly annotations: LocalPageAnnotationsService;
  readonly text: LocalPageTextService;
  readonly geometry: LocalPageGeometryService;
  readonly render: LocalPageRenderService;
  readonly pieceInfo: LocalPieceInfoService;
  readonly measure: LocalPageMeasureService;

  constructor(
    readonly ref: PageRef,
    docId: string,
    queue: WorkerQueue,
    view: DocClosedView,
    imageEncoder: LocalImageEncoder,
    guard: ScopeGuard,
    publisher: SessionEventPublisher,
    renderPolicy: EngineRenderPolicy = CONTINUOUS_RENDER_POLICY,
  ) {
    this.annotations = new LocalPageAnnotationsService(
      docId,
      ref,
      queue,
      view,
      imageEncoder,
      guard,
      publisher,
      renderPolicy,
    );
    this.text = new LocalPageTextService(docId, ref, queue, view, guard);
    this.geometry = new LocalPageGeometryService(docId, ref, queue, view, guard);
    this.render = new LocalPageRenderService(
      docId,
      ref,
      queue,
      view,
      imageEncoder,
      guard,
      renderPolicy,
    );
    this.pieceInfo = new LocalPieceInfoService(docId, queue, view, guard, ref);
    this.measure = new LocalPageMeasureService(docId, ref, queue, view, guard, publisher);
  }
}
