import type { PageAnnotationsService } from './PageAnnotationsService';
import type { PageRenderService } from './PageRenderService';
import type { PageTextService } from './PageTextService';
import type { PieceInfoService } from './PieceInfoService';
import type { PageMeasureService } from './PageMeasureService';
import type { PageRef } from '../identity/PageRef';

/**
 * Page-scoped handle returned by `DocumentHandle.page(ref)`. The handle is
 * keyed on the page's durable address (its PDF indirect object number),
 * never the page index, so it survives page-list mutations.
 */
export interface PageHandle {
  readonly ref: PageRef;
  readonly annotations: PageAnnotationsService;
  readonly text: PageTextService;
  readonly render: PageRenderService;
  /**
   * Page-level `/PieceInfo` private application data (ISO 32000 §14.5) —
   * e.g. a stamp page's name/subject. Optional: local implements it; cloud
   * omits it until a cloud consumer ships (the `downloadLayer?` pattern).
   */
  readonly pieceInfo?: PieceInfoService;
  readonly measure: PageMeasureService;
}
