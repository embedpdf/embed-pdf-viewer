import { EngineError } from '../errors/EngineError';
import { AbortablePromise } from '../promise/AbortablePromise';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PdfRect, PdfRotation } from '../geometry/primitives';

export type PageRenderEncodedFormat = 'png' | 'webp' | 'bmp';

/**
 * Formats that are acceptable for cacheable cloud HTTP render endpoints.
 * BMP and raw RGBA stay local-only because they are intentionally huge.
 */
export type PageNetworkRenderFormat = 'png' | 'webp';

export type PageRenderFormat = PageRenderEncodedFormat | 'rgba';

export type PageRenderBackground = 'white' | 'transparent';

export type PageRenderViewport =
  | {
      /**
       * Render one PDF user-space unit as `scale` device pixels. Callers
       * that care about devicePixelRatio should fold it into this value.
       */
      kind: 'scale';
      scale?: number;
    }
  | {
      /**
       * Exact output width in device pixels. Height preserves the region's
       * aspect ratio after rotation.
       */
      kind: 'width';
      width: number;
    };

export type PageRenderTarget =
  | { kind: 'page' }
  | {
      kind: 'rect';
      /**
       * PDF user-space rectangle. Same convention as annotation rects:
       * top > bottom, origin at the PDF page's bottom-left.
       */
      rect: PdfRect;
    };

export interface PageRenderOptions {
  target?: PageRenderTarget;
  viewport?: PageRenderViewport;
  rotation?: PdfRotation;
  background?: PageRenderBackground;
  includeAnnotations?: boolean;
  /**
   * Output-pixel budget: the renderer rejects (InvalidArg) instead of
   * allocating when `outputWidth × outputHeight` exceeds it. A width
   * lattice bounds width but not height — a 1×14,400pt page still
   * explodes vertically — so the guard lives where the allocation
   * happens (the decode-bomb-guard pattern). Server requests carry it
   * from the deployment's render policy; local engines inject it only
   * when `localEngine({ renderPolicy })` configured a budget — the
   * default local policy stays continuous and unbudgeted (exactness is
   * the local product promise).
   */
  maxOutputPixels?: number;
}

export interface PageImageOptions extends PageRenderOptions {
  format?: PageRenderEncodedFormat;
  /**
   * WebP quality from 0 (smallest) to 1 (best), the same scale as
   * `canvas.toBlob`. PNG and BMP are lossless and ignore it.
   */
  quality?: number;
}

/** `InvalidArg` unless `quality` is absent or between 0 and 1. */
export function checkImageQuality(quality: number | undefined): void {
  if (quality === undefined || (quality >= 0 && quality <= 1)) return;
  throw new EngineError(EngineErrorCode.InvalidArg, 'quality must be between 0 and 1', {
    details: { field: 'quality' },
  });
}

export interface PageRenderQuery {
  options: PageImageOptions;
  contentVersion?: number;
  annotationVersion?: number;
}

/**
 * Raw renderer output shared by local workers and server workers. The pixel
 * buffer is a first-class ArrayBuffer so worker transports can transfer
 * ownership instead of cloning it.
 */
export interface PageRaster {
  width: number;
  height: number;
  stride: number;
  color: 'rgba8';
  premultipliedAlpha: false;
  data: ArrayBuffer;
}

export interface PageImageResult {
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  format: PageRenderEncodedFormat;
  contentType: string;
  source: PageImageSource;
}

export type PageImageSource = { kind: 'bytes'; bytes: Uint8Array } | { kind: 'url'; url: string };

export interface PageImageObjectUrl {
  url: string;
  revoke(): void;
}

export interface PageImageHandle extends PageImageResult {
  /**
   * A `blob:` URL for the image, and `revoke()` to free it. Cancel with
   * `.abort()`: a URL made after the cancel is revoked, never leaked.
   */
  objectUrl(): AbortablePromise<PageImageObjectUrl>;
}

export interface PageImageBlobSource {
  blob(signal?: AbortSignal): Promise<Blob>;
}

export function createPageImageHandle(
  result: PageImageResult,
  blobSource: PageImageBlobSource,
): PageImageHandle {
  return {
    ...result,
    objectUrl() {
      return AbortablePromise.run(async (signal) => {
        if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
          throw new EngineError(
            EngineErrorCode.RuntimeUnavailable,
            'Object URLs are not available in this environment',
          );
        }

        const blob = await blobSource.blob(signal);
        const url = URL.createObjectURL(blob);
        // Cancelled while the blob arrived: nobody will revoke it but us.
        if (signal.aborted) {
          URL.revokeObjectURL(url);
          throw signal.reason;
        }
        return { url, revoke: () => URL.revokeObjectURL(url) };
      });
    },
  };
}
