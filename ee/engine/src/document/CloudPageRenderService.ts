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
import { planesInherited } from './planes';
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
      const includeAnnotations = options.includeAnnotations ?? true;
      const buildPath = async (s: AbortSignal): Promise<string> => {
        const manifest = await this.manifest.get(s);
        const page = manifest.pages.find((p) => p.state.pageObjectNumber === this.pageObjectNumber);
        if (!page) {
          throw new EngineError(
            EngineErrorCode.NotFound,
            `no page with object number ${this.pageObjectNumber} in document ${this.docId}`,
          );
        }
        // `format` flows through `options` and ends up in the token like
        // every other render option — the wire format treats it uniformly.
        // Normalized above so the URL always carries an explicit,
        // network-supported format (PNG or WebP; default WebP).
        // Annotatedness itself is PATH-expressed (the token/path law): the
        // token never carries it; the annotated family's token carries the
        // `annotationVersion` pin instead.
        const wireToken = renderImageOptionsToWire(
          { ...options, format },
          {
            contentVersion: page.cache.contentVersion,
            ...(includeAnnotations ? { annotationVersion: page.cache.annotationVersion } : {}),
          },
        );
        // WS2b plane rule: a render resolves at the DOC-LEVEL (shared base)
        // path iff every plane it depends on is inherited — annotation-free
        // renders (full pages AND tiles; the rect target rides the same
        // token) depend on `content`, annotated ones on
        // `content + annotations`. Each is its OWN family at BOTH tiers
        // (prefix law: edge grants see only prefixes). 1,000 inheriting
        // visitors → one URL set, one origin render, no layer session.
        if (includeAnnotations) {
          return planesInherited(manifest, ['content', 'annotations'])
            ? wirePaths.docPageRenderAnnotated(this.docId, this.pageObjectNumber, wireToken)
            : wirePaths.layerPageRenderAnnotated(
                this.docId,
                this.layerName,
                this.pageObjectNumber,
                wireToken,
              );
        }
        return planesInherited(manifest, ['content'])
          ? wirePaths.docPageRender(this.docId, this.pageObjectNumber, wireToken)
          : wirePaths.layerPageRender(this.docId, this.layerName, this.pageObjectNumber, wireToken);
      };
      // The advertised URL reflects the CURRENT manifest; the blob loader
      // re-resolves per fetch through the 404 → manifest-refresh rail, so a
      // scope flip (e.g. this layer's first annotation write) self-heals
      // instead of failing on a stale path family.
      const requestPath = await buildPath(signal);
      return createCloudPageImageHandle(
        {
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
