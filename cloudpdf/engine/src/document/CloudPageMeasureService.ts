import {
  opIdOf,
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type PageMeasureService,
  type PageRef,
  type PdfMeasure,
  type PageMeasurementViewportList,
  type PageScaleResult,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';
import {
  PageMeasurementViewportListSchema,
  PageScaleResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { CloudWrites } from './CloudWrites';
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
    private readonly writes: CloudWrites,
  ) {}
  listViewports(): AbortablePromise<PageMeasurementViewportList> {
    return AbortablePromise.run(async (signal) => {
      this.check();
      // Viewports have no independent cache pin. Always read the current layer.
      return this.http.getJson(
        wirePaths.layerPageViewports(this.docId, this.layerName, this.pageRef),
        (raw) => PageMeasurementViewportListSchema.parse(raw),
        signal,
      );
    });
  }
  setScale(measure: PdfMeasure | null, options?: WriteOptions): AbortablePromise<PageScaleResult> {
    return AbortablePromise.run(async (signal) => {
      const opId = opIdOf(options);
      this.check();
      return this.writes.run(opId, signal, async (write) => {
        const result = await write.send((sent) =>
          this.http.putJson(
            wirePaths.layerPageScale(this.docId, this.layerName, this.pageRef),
            { measure },
            (raw) => PageScaleResultSchema.parse(raw),
            signal,
            sent,
          ),
        );
        this.manifest.apply(result.meta, []);
        this.publisher.publishWrite(opId, { type: 'pages.scaleSet', ...result });
        return result;
      });
    });
  }
  private check(): void {
    if (this.isClosed())
      throw new EngineError(EngineErrorCode.DocNotOpen, `Document not open: ${this.docId}`);
  }
}
