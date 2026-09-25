import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type PageMeasureService,
  type PageRef,
  type PdfMeasure,
  type PageMeasurementViewport,
} from '@embedpdf/engine-core/runtime';
import {
  PageMeasurementViewportSchema,
  PageScaleResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

export class CloudPageMeasureService implements PageMeasureService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageRef: PageRef,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
  ) {}
  listViewports(): AbortablePromise<PageMeasurementViewport[]> {
    return AbortablePromise.run(async (signal) => {
      this.check();
      // Viewports have no independent cache pin. Always read the current layer.
      return this.http.getJson(
        wirePaths.layerPageViewports(this.docId, this.layerName, this.pageRef),
        (raw) => PageMeasurementViewportSchema.array().parse(raw),
        signal,
      );
    });
  }
  setScale(measure: PdfMeasure | null): AbortablePromise<void> {
    return AbortablePromise.run(async (signal) => {
      await Promise.resolve();
      signal.throwIfAborted();
      this.check();
      const result = await this.http.putJson(
        wirePaths.layerPageScale(this.docId, this.layerName, this.pageRef),
        { measure },
        (raw) => PageScaleResultSchema.parse(raw),
        signal,
      );
      this.manifest.apply(result.meta, []);
      this.publisher.publishLocal({ type: 'page.viewportsChanged', ...result });
    });
  }
  private check(): void {
    if (this.isClosed())
      throw new EngineError(EngineErrorCode.DocNotOpen, `Document not open: ${this.docId}`);
  }
}
