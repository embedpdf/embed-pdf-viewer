import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  createPageImageHandle,
  type PageImageHandle,
  type PageImageOptions,
  type PageImageResult,
  type PageLayerRights,
  type PageLayout,
  type PageNetworkRenderFormat,
  type PageRef,
  type PageRenderImage,
  type PageRenderService,
  type PageRenderTransform,
  renderAreaTransform,
  renderTargetArea,
  checkImageQuality,
  resolvePageLayers,
} from '@embedpdf/engine-core/runtime';
import {
  PAGE_RENDER_FAMILIES,
  pageRenderFamilyOf,
  renderImageOptionsToWire,
  wirePaths,
  type RenderVersions,
} from '@embedpdf/engine-core/wire';

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
    /** What the caller may read, when the client can know it; null leaves it to the server. */
    private readonly layerRights: () => PageLayerRights | null,
  ) {}

  image(options: PageImageOptions = {}): AbortablePromise<PageRenderImage> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageRenderImage>(async (signal) => {
      checkImageQuality(options.quality);
      const format = normalizeFormat(options.format);
      // A picture draws what the caller may read, and the family it draws is
      // its path. Without the caller's rights (a tenant or API token), it asks
      // for everything and the server decides.
      const layers = resolvePageLayers(
        options,
        this.layerRights() ?? { annotations: true, formFields: true },
      );
      const family = PAGE_RENDER_FAMILIES[pageRenderFamilyOf(layers)];
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const pageObjectNumber = this.pageRef.objectNumber;
        const page = manifest.pages.find((p) => p.page.objectNumber === pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${pageObjectNumber} in document ${this.docId}`,
          );
        }
        // `format` flows through `options` and ends up in the token like
        // every other render option — the wire format treats it uniformly.
        // Normalized above so the URL always carries an explicit,
        // network-supported format (PNG or WebP; default WebP). What the
        // picture draws is its family's path; the token carries the family's
        // pins.
        const pins: RenderVersions = { contentVersion: page.cache.contentVersion };
        for (const pin of family.pins) pins[pin] = page.cache[pin];
        const wireToken = renderImageOptionsToWire({ ...options, format }, pins);
        // Plane-scope rule: a picture resolves at the doc-level (shared base)
        // path iff every plane its family depends on is inherited, so 1,000
        // inheriting visitors share one URL set, one origin render, and no
        // layer session.
        return planesInherited(manifest, family.planes)
          ? wirePaths.docPageRender(this.docId, family.family, this.pageRef, wireToken)
          : wirePaths.layerPageRender(
              this.docId,
              this.layerName,
              family.family,
              this.pageRef,
              wireToken,
            );
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
