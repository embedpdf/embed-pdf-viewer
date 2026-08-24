import type { PageAnnotationsService } from './PageAnnotationsService';
import type { PageGeometryService } from './PageGeometryService';
import type { PageRenderService } from './PageRenderService';
import type { PageTextService } from './PageTextService';
import type { PieceInfoService } from './PieceInfoService';
import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * Page-scoped handle returned by `DocumentHandle.page(pageObjectNumber)`.
 * The handle is keyed on the PDF indirect object number, never the page
 * index, so it survives page-list mutations.
 */
export interface PageHandle {
  readonly pageObjectNumber: PageObjectNumber;
  /**
   * Display index at the time this handle was minted. The engine refreshes
   * this on every annotation/list call against the live `PageRecord`, but
   * callers should treat it as advisory metadata only.
   */
  readonly pageIndex: number;
  readonly annotations: PageAnnotationsService;
  readonly text: PageTextService;
  readonly geometry: PageGeometryService;
  readonly render: PageRenderService;
  /**
   * PAGE-level `/PieceInfo` private application data (ISO 32000 §14.5) —
   * e.g. a stamp page's name/subject. Optional: local implements it; cloud
   * omits it until a cloud consumer ships (the `downloadLayer?` pattern).
   */
  readonly pieceInfo?: PieceInfoService;
}
