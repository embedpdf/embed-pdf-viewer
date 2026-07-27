import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type PageObjectNumber,
  type PageTextService,
  type PageTextSnapshot,
} from '@embedpdf/engine-core/runtime';
import { PageTextSnapshotSchema, wirePaths } from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud-side per-page text service. `read()` fetches the
 * content-addressed URL `/v1/docs/:id/text/pages/:pon/data@contentVersion=N`, where
 * `:P` is the page's current `contentVersion` from the cached
 * manifest. On a 404 (stale version) the SDK transparently refreshes
 * `/head` + `/manifest@docVersion=N`, rebuilds the URL with the fresh `cN`,
 * and retries exactly once.
 */
export class CloudPageTextService implements PageTextService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageObjectNumber: PageObjectNumber,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  read(): AbortablePromise<PageTextSnapshot> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageTextSnapshot>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const page = manifest.pages.find((p) => p.state.pageObjectNumber === this.pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${this.pageObjectNumber} in document ${this.docId}`,
          );
        }
        return wirePaths.layerPageText(
          this.docId,
          this.layerName,
          this.pageObjectNumber,
          page.cache.contentVersion,
        );
      };
      return this.http.getJsonWithRefresh(
        buildPath,
        (raw) => PageTextSnapshotSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }
}
