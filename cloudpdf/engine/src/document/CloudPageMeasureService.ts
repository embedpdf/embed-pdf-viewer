import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentPagesService,
  type PageMeasureService,
  type PageRef,
  type PdfMeasure,
  type PageMeasurementViewportList,
  type PageScaleResult,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';
import { PageMeasurementViewportListSchema, wirePaths } from '@embedpdf/engine-core/wire';

import type { HttpClient } from '../transport/HttpClient';

export class CloudPageMeasureService implements PageMeasureService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageRef: PageRef,
    private readonly isClosed: () => boolean,
    private readonly setScales: DocumentPagesService['setScale'],
  ) {}
  listViewports(): AbortablePromise<PageMeasurementViewportList> {
    return AbortablePromise.run(async (signal) => {
      this.check();
      // The current layer's: the page's layout carries the same viewports at its pins.
      return this.http.getJson(
        wirePaths.layerPageViewports(this.docId, this.layerName, this.pageRef),
        (raw) => PageMeasurementViewportListSchema.parse(raw),
        signal,
      );
    });
  }
  /** A one-page `doc.pages.setScale`: one change, as every scale change is. */
  setScale(measure: PdfMeasure | null, options?: WriteOptions): AbortablePromise<PageScaleResult> {
    return this.setScales([this.pageRef], measure, options);
  }
  private check(): void {
    if (this.isClosed())
      throw new EngineError(EngineErrorCode.DocNotOpen, `Document not open: ${this.docId}`);
  }
}
