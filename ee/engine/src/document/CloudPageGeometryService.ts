import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type PageGeometryService,
  type PageGeometrySnapshot,
  type PageObjectNumber,
} from '@embedpdf/engine-core/runtime';
import { PageGeometrySnapshotSchema, wirePaths } from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

export class CloudPageGeometryService implements PageGeometryService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageObjectNumber: PageObjectNumber,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  read(): AbortablePromise<PageGeometrySnapshot> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageGeometrySnapshot>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const page = manifest.pages.find((p) => p.state.pageObjectNumber === this.pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${this.pageObjectNumber} in document ${this.docId}`,
          );
        }
        return wirePaths.layerPageGeometry(
          this.docId,
          this.layerName,
          this.pageObjectNumber,
          page.cache.contentVersion,
        );
      };
      return this.http.getJsonWithRefresh(
        buildPath,
        (raw) => PageGeometrySnapshotSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }
}
