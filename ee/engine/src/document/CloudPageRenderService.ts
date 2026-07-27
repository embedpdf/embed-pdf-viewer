import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  createPageImageHandle,
  type PageImageHandle,
  type PageImageOptions,
  type PageImageResult,
  type PageNetworkRenderFormat,
  type PageObjectNumber,
  type PageRaster,
  type PageRenderOptions,
  type PageRenderService,
} from '@embedpdf/engine-core/runtime';
import { renderImageOptionsToWire, wirePaths } from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

export class CloudPageRenderService implements PageRenderService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly pageObjectNumber: PageObjectNumber,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  image(options: PageImageOptions = {}): AbortablePromise<PageImageHandle> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<PageImageHandle>(async (signal) => {
      const format = normalizeFormat(options.format);
      const manifest = await this.manifest.get(signal);
      const page = manifest.pages.find((p) => p.state.pageObjectNumber === this.pageObjectNumber);
      if (!page) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `no page with object number ${this.pageObjectNumber} in document ${this.docId}`,
        );
      }
      const includeAnnotations = options.includeAnnotations ?? true;
      // `format` flows through `options` and ends up in the token like every
      // other render option — the wire format treats it uniformly. Normalize
      // here first so the URL always carries an explicit, network-supported
      // format (PNG or WebP), defaulting to WebP when the caller omits it.
      const requestPath = wirePaths.layerPageRender(
        this.docId,
        this.layerName,
        this.pageObjectNumber,
        renderImageOptionsToWire(
          { ...options, format },
          {
            contentVersion: page.cache.contentVersion,
            annotationVersion: includeAnnotations ? page.cache.annotationVersion : undefined,
          },
        ),
      );
      return createCloudPageImageHandle(
        {
          format,
          contentType: `image/${format}`,
          source: { kind: 'url', url: this.http.absoluteUrl(requestPath) },
        },
        this.http,
        requestPath,
      );
    });
  }

  raw(_options?: PageRenderOptions): AbortablePromise<PageRaster> {
    return AbortablePromise.rejectReason(
      new EngineError(
        EngineErrorCode.NotImplemented,
        'render.raw() is not available in the cloud engine; use render.image()',
      ),
    );
  }
}

function createCloudPageImageHandle(
  result: PageImageResult,
  http: HttpClient,
  requestPath: string,
): PageImageHandle {
  return createPageImageHandle(result, {
    blob: (signal) => http.getBlob(requestPath, signal ?? new AbortController().signal),
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
