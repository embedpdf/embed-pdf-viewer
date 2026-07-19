import type { PageHandle, PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { LocalPageAnnotationsService } from './LocalPageAnnotationsService';
import { LocalPageGeometryService } from './LocalPageGeometryService';
import { LocalPageRenderService } from './LocalPageRenderService';
import { LocalPageTextService } from './LocalPageTextService';
import { LocalPieceInfoService } from './LocalPieceInfoService';
import type { LocalImageEncoder } from '../render/BrowserImageEncoder';
import type { ScopeGuard } from '../scope';
import type { WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

/**
 * Local page handle. `pageIndex` is supplied as advisory metadata when
 * the document handle creates the page handle. The per-page services
 * each own their queue interaction; the handle is otherwise stateless.
 */
export class LocalPageHandle implements PageHandle {
  readonly annotations: LocalPageAnnotationsService;
  readonly text: LocalPageTextService;
  readonly geometry: LocalPageGeometryService;
  readonly render: LocalPageRenderService;
  readonly pieceInfo: LocalPieceInfoService;

  constructor(
    readonly pageObjectNumber: PageObjectNumber,
    readonly pageIndex: number,
    docId: string,
    queue: WorkerQueue,
    view: DocClosedView,
    imageEncoder: LocalImageEncoder,
    guard: ScopeGuard,
    publisher: SessionEventPublisher,
  ) {
    this.annotations = new LocalPageAnnotationsService(
      docId,
      pageObjectNumber,
      queue,
      view,
      imageEncoder,
      guard,
      publisher,
    );
    this.text = new LocalPageTextService(docId, pageObjectNumber, queue, view, guard);
    this.geometry = new LocalPageGeometryService(docId, pageObjectNumber, queue, view, guard);
    this.render = new LocalPageRenderService(
      docId,
      pageObjectNumber,
      queue,
      view,
      imageEncoder,
      guard,
    );
    this.pieceInfo = new LocalPieceInfoService(docId, queue, view, guard, pageObjectNumber);
  }
}
