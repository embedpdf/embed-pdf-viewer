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
import { planesInherited } from './planes';
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
        // WS2b plane rule: text depends on the `content` plane — while it
        // is inherited, every visitor's layer reads ONE doc-level URL (and
        // the base worker session at the origin).
        return planesInherited(manifest, ['content'])
          ? wirePaths.docPageText(this.docId, this.pageObjectNumber, page.cache.contentVersion)
          : wirePaths.layerPageText(
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
