import { hasLocalEngineBrand } from './localEngineBrand';
import type { LocalPageAnnotationsService } from './PageAnnotationsService';
import type { PageHandle } from './PageHandle';
import type { LocalPageRenderService } from './PageRenderService';
import type { PieceInfoService } from './PieceInfoService';

/**
 * A page of a document the local engine opened (`LocalDocumentHandle.page()`):
 * the shared {@link PageHandle}, its raw pixels and its `/PieceInfo`.
 */
export interface LocalPageHandle extends PageHandle {
  readonly annotations: LocalPageAnnotationsService;
  readonly render: LocalPageRenderService;
  /**
   * Page-level `/PieceInfo` private application data (ISO 32000 §14.5), such
   * as a stamp page's name and subject.
   */
  readonly pieceInfo: PieceInfoService;
}

/** Whether `page` is a page of a local engine's document, with its raw pixels and `/PieceInfo`. */
export function isLocalPage(page: PageHandle): page is LocalPageHandle {
  return hasLocalEngineBrand(page);
}
