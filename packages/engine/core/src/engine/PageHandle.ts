import type { PageAnnotationsService } from './PageAnnotationsService';
import type { PageFormsService } from './PageFormsService';
import type { PageRenderService } from './PageRenderService';
import type { PageTextService } from './PageTextService';
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
  readonly forms: PageFormsService;
  readonly text: PageTextService;
  readonly render: PageRenderService;
  readonly measure: PageMeasureService;
}
