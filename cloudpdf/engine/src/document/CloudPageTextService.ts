import {
  AbortablePromise,
  createTextLayout,
  EngineError,
  EngineErrorCode,
  sliceText,
  type DocumentManifest,
  type PageRef,
  type PageTextService,
  type PageTextSnapshot,
  type TextLayout,
  type TextRange,
} from '@embedpdf/engine-core/runtime';
import {
  PageGeometrySnapshotSchema,
  PageTextSnapshotSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud-side per-page text service. `get()` fetches the content-addressed
 * URL `/v1/docs/:id/text/pages/:pon/data@contentVersion=N` and `layout()`
 * its geometry twin, where `N` is the page's current `contentVersion` from
 * the cached manifest. On a 404 (stale version) the SDK transparently
 * refreshes `/head` + `/manifest@docVersion=N`, rebuilds the URL with the
 * fresh version, and retries exactly once.
 */
export class CloudPageTextService implements PageTextService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageRef: PageRef,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  get(): AbortablePromise<PageTextSnapshot> {
    return this.readLeaf('text', (raw) => PageTextSnapshotSchema.parse(raw));
  }

  slice(range: TextRange): AbortablePromise<string> {
    return AbortablePromise.run(async (signal) =>
      sliceText(await this.get().abortWith(signal), range),
    );
  }

  layout(): AbortablePromise<TextLayout> {
    return this.readLeaf('geometry', (raw) =>
      createTextLayout(PageGeometrySnapshotSchema.parse(raw)),
    );
  }

  /** One of the page's content leaves at the manifest's pin, with the stale-pin retry. */
  private readLeaf<T>(leaf: 'text' | 'geometry', parse: (raw: unknown) => T): AbortablePromise<T> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<T>((signal) =>
      this.http.getJsonWithRefresh(
        async (s) => this.leafPath(leaf, await this.manifest.get(s)),
        parse,
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      ),
    );
  }

  private leafPath(leaf: 'text' | 'geometry', manifest: DocumentManifest): string {
    const pageObjectNumber = this.pageRef.pageObjectNumber;
    const page = manifest.pages.find((p) => p.state.page.pageObjectNumber === pageObjectNumber);
    if (!page) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no page with object number ${pageObjectNumber} in document ${this.docId}`,
      );
    }
    const version = page.cache.contentVersion;
    // Plane-scope rule: text and geometry depend on the `content` plane —
    // while it is inherited, every visitor's layer reads one doc-level URL
    // (and the base worker session at the origin).
    if (planesInherited(manifest, ['content'])) {
      return leaf === 'text'
        ? wirePaths.docPageText(this.docId, this.pageRef, version)
        : wirePaths.docPageGeometry(this.docId, this.pageRef, version);
    }
    return leaf === 'text'
      ? wirePaths.layerPageText(this.docId, this.layerName, this.pageRef, version)
      : wirePaths.layerPageGeometry(this.docId, this.layerName, this.pageRef, version);
  }
}
