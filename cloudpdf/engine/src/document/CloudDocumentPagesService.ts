import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentPagesService,
  type PageFlattenResult,
  type PageFlattenUsage,
  type PageDeleteResult,
  type PageListSnapshot,
  type PageMoveResult,
  type PageObjectNumber,
  type PageRotateResult,
  type PageRotation,
} from '@embedpdf/engine-core/runtime';
import {
  PageDeleteResultSchema,
  PageFlattenResultSchema,
  PageListSnapshotSchema,
  PageMoveResultSchema,
  PageRotateResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

/**
 * Cloud-side document pages service. Mirrors `LocalDocumentPagesService`
 * over HTTP: GET /pages for `list`, POST /pages/move for the reorder.
 *
 * Page identity rule (locked with the user, do not change):
 *   - Pages are addressed exclusively by their indirect
 *     `pageObjectNumber`. The wire never sends a page index for a
 *     mutation. This keeps multi-call client logic from having to
 *     account for index drift between requests.
 *   - Successful `move()` returns the new `layout` (order + geometry) plus
 *     cloud coherence pins. The server does NOT bump per-page revisions on a
 *     page move (page reorder is intentionally outside the weak-ref staleness
 *     model), only `docVersion` + `layoutVersion`.
 */
export class CloudDocumentPagesService implements DocumentPagesService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
  ) {}

  /**
   * Page-geometry list. The geometry bytes live at the content-addressed
   * `/layout@layoutVersion=N` leaf (not in the manifest); the manifest only
   * publishes the `layoutVersion` pointer. So `list()` reads `layoutVersion`
   * from the cached manifest, fetches the layout leaf, and on a 404 (stale
   * pointer) transparently refreshes the manifest and retries once — the
   * same ladder the per-page text/geometry reads use. `layoutVersion` bumps
   * only on structural page ops, so this leaf stays cached across content
   * and annotation edits.
   */
  list(): AbortablePromise<PageListSnapshot> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageListSnapshot>(async (signal) => {
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        // WS2b plane rule: the layout leaf depends on the `layout` plane —
        // while inherited (no move/rotate/insert/delete ever ran), every
        // visitor's page list is ONE doc-level URL served from the base
        // session; the SDK open sequence creates no layer session.
        return planesInherited(manifest, ['layout'])
          ? wirePaths.docLayout(this.docId, manifest.layoutVersion)
          : wirePaths.layerLayout(this.docId, this.layerName, manifest.layoutVersion);
      };
      return this.http.getJsonWithRefresh(
        buildPath,
        (raw) => PageListSnapshotSchema.parse(raw),
        async (s) => {
          await this.manifest.refresh(s);
        },
        signal,
      );
    });
  }

  move(pageObjectNumbers: PageObjectNumber[], destIndex: number): AbortablePromise<PageMoveResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageMoveResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerPagesMove(this.docId, this.layerName),
        { pageObjectNumbers, destIndex },
        (raw) => PageMoveResultSchema.parse(raw),
        signal,
      );
      // A move only advances docVersion + layoutVersion (no per-page pin
      // changes), so the cached manifest can be patched in place — no refetch.
      if (result.cache) this.manifest.applyPageStructure(result.cache);
      // Publish AFTER absorb: listeners reading the manifest in their
      // callback must see post-mutation state.
      this.publisher.publishLocal({ type: 'pages.moved', pageObjectNumbers, destIndex, ...result });
      return result;
    });
  }

  rotate(
    pageObjectNumbers: PageObjectNumber[],
    rotation: PageRotation,
  ): AbortablePromise<PageRotateResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageRotateResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerPagesRotate(this.docId, this.layerName),
        { pageObjectNumbers, rotation },
        (raw) => PageRotateResultSchema.parse(raw),
        signal,
      );
      // Rotation shares the move patch exactly: docVersion + layoutVersion
      // advance, every per-page pin (and its cached render) stays warm.
      if (result.cache) this.manifest.applyPageStructure(result.cache);
      this.publisher.publishLocal({
        type: 'pages.rotated',
        pageObjectNumbers,
        rotation,
        ...result,
      });
      return result;
    });
  }

  delete(pageObjectNumbers: PageObjectNumber[]): AbortablePromise<PageDeleteResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageDeleteResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerPagesDelete(this.docId, this.layerName),
        { pageObjectNumbers },
        (raw) => PageDeleteResultSchema.parse(raw),
        signal,
      );
      // The structural advance plus dropping the deleted pages' manifest
      // rows — a retired PON must not be buildable from the local cache.
      if (result.cache) this.manifest.applyPageDelete(result.cache, pageObjectNumbers);
      this.publisher.publishLocal({ type: 'pages.deleted', pageObjectNumbers, ...result });
      return result;
    });
  }

  flatten(
    pageObjectNumbers: PageObjectNumber[],
    usage: PageFlattenUsage = 'display',
  ): AbortablePromise<PageFlattenResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageFlattenResult>(async (signal) => {
      const result = await this.http.postJson(
        wirePaths.layerPagesFlatten(this.docId, this.layerName),
        { pageObjectNumbers, usage },
        (raw) => PageFlattenResultSchema.parse(raw),
        signal,
      );
      // Nothing flattened means no artifact and therefore no coherence bump.
      if (result.meta === null) return result;
      // Flatten bakes annotations into page content (WS2b: both planes
      // flip).
      this.manifest.apply(result.meta, ['content', 'annotations']);
      this.publisher.publishLocal({
        type: 'pages.flattened',
        ...result,
      });
      return result;
    });
  }
}
