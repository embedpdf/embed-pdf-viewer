import type { PdfMeasure, PageMeasurementViewportList } from '../dto/Measure';
import type { PageScaleResult } from '../mutation/PageScaleResult';
import type { AbortablePromise } from '../promise/AbortablePromise';

export interface PageMeasureService {
  /** Viewports in drawing order. Last containing viewport wins, including foreign ones. */
  listViewports(): AbortablePromise<PageMeasurementViewportList>;
  /** Upsert/remove EmbedPDF's full-page calibration. Other producers' entries survive.
   * Existing annotations retain their own scale snapshots. */
  setScale(measure: PdfMeasure | null): AbortablePromise<PageScaleResult>;
}
