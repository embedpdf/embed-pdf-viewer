import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  createPageImageHandle,
  type PageImageHandle,
  type PageImageOptions,
  type PageImageResult,
  type PageLayout,
  type PageNetworkRenderFormat,
  type PageRef,
  type PageRenderImage,
  type PageRenderService,
  type PageRenderTask,
  type PageRenderTransform,
  pageRenderTask,
  renderAreaTransform,
  renderTargetArea,
  checkImageQuality,
} from '@embedpdf/engine-core/runtime';
import { renderImageOptionsToWire, wirePaths } from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

export class CloudPageRenderService implements PageRenderService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageRef: PageRef,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly layout: (signal: AbortSignal) => Promise<PageLayout>,
  ) {}

  /**
   * The image's URL and transform; the browser fetches the pixels. The
   * priority does not travel yet (the request header lands with the server's
   * scheduling), so `setPriority` does nothing.
   */
  image(options: PageImageOptions = {}): PageRenderTask<PageRenderImage> {
    if (this.isClosed()) {
      return pageRenderTask(
        AbortablePromise.rejectReason(
          new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
        ),
        () => {},
      );
    }
    const task = AbortablePromise.run<PageRenderImage>(async (signal) => {
      checkImageQuality(options.quality);
      const format = normalizeFormat(options.format);
      const includeAnnotations = options.includeAnnotations ?? true;
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const pageObjectNumber = this.pageRef.objectNumber;
        const page = manifest.pages.find((p) => p.state.page.objectNumber === pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${pageObjectNumber} in document ${this.docId}`,
          );
        }
        // `format` flows through `options` and ends up in the token like
        // every other render option — the wire format treats it uniformly.
        // Normalized above so the URL always carries an explicit,
        // network-supported format (PNG or WebP; default WebP).
        // Annotatedness itself is path-expressed (the token/path law): the
        // token never carries it; the annotated family's token carries the
        // `annotationVersion` pin instead.
        const wireToken = renderImageOptionsToWire(
          { ...options, format },
          {
            contentVersion: page.cache.contentVersion,
            ...(includeAnnotations ? { annotationVersion: page.cache.annotationVersion } : {}),
          },
        );
        // Plane-scope rule: a render resolves at the doc-level (shared base)
        // path iff every plane it depends on is inherited — annotation-free
        // renders (full pages and tiles; the rect target rides the same
        // token) depend on `content`, annotated ones on
        // `content + annotations`. Each is its own family at both tiers
        // (prefix law: edge grants see only prefixes). 1,000 inheriting
        // visitors → one URL set, one origin render, no layer session.
        if (includeAnnotations) {
          return planesInherited(manifest, ['content', 'annotations'])
            ? wirePaths.docPageRenderAnnotated(this.docId, this.pageRef, wireToken)
            : wirePaths.layerPageRenderAnnotated(
                this.docId,
                this.layerName,
                this.pageRef,
                wireToken,
              );
        }
        return planesInherited(manifest, ['content'])
          ? wirePaths.docPageRender(this.docId, this.pageRef, wireToken)
          : wirePaths.layerPageRender(this.docId, this.layerName, this.pageRef, wireToken);
      };
      // The advertised URL reflects the current manifest; the blob loader
      // re-resolves per fetch through the 404 → manifest-refresh rail, so a
      // scope flip (e.g. this layer's first annotation write) self-heals
      // instead of failing on a stale path family.
      const [requestPath, transform] = await Promise.all([
        buildPath(signal),
        this.transformOf(options, signal),
      ]);
      const handle = createCloudPageImageHandle(
        {
          width: transform.width,
          height: transform.height,
          format,
          contentType: `image/${format}`,
          source: { kind: 'url', url: this.http.absoluteUrl(requestPath) },
        },
        this.http,
        buildPath,
        async (s) => {
          await this.manifest.refresh(s);
        },
      );
      return { ...handle, transform };
    });
    return pageRenderTask(task, () => {});
  }

  /**
   * The image's transform, computed like the server's render (the same
   * `renderSize` and matrix), so the handle knows its size and its pixels
   * before any are fetched. Only a full page needs the page's layout.
   */
  private async transformOf(
    options: PageImageOptions,
    signal: AbortSignal,
  ): Promise<PageRenderTransform> {
    const target = options.target;
    const area =
      target?.kind === 'rect'
        ? renderTargetArea(target.rect)
        : { x: 0, y: 0, ...(await this.layout(signal)).size };
    return renderAreaTransform(area, options);
  }
}

function createCloudPageImageHandle(
  result: PageImageResult,
  http: HttpClient,
  buildPath: (signal: AbortSignal) => Promise<string>,
  onStaleVersion: (signal: AbortSignal) => Promise<void>,
): PageImageHandle {
  return createPageImageHandle(result, {
    blob: (signal) =>
      http.getBlobWithRefresh(buildPath, onStaleVersion, signal ?? new AbortController().signal),
  });
}

function normalizeFormat(format: PageImageOptions['format']): PageNetworkRenderFormat {
  if (format === undefined) return 'webp';
  if (format === 'png' || format === 'webp') return format;
  throw new EngineError(
    EngineErrorCode.InvalidArg,
    `cloud render.image() supports only "png" and "webp" (got "${format}")`,
  );
}
