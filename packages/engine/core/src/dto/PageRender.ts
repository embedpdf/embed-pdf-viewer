import { EngineError } from '../errors/EngineError';
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
}

export interface PageImageOptions extends PageRenderOptions {
  format?: PageRenderEncodedFormat;
  quality?: number;
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
  width?: number;
  height?: number;
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
  objectUrl(signal?: AbortSignal): Promise<PageImageObjectUrl>;
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
    async objectUrl(signal?: AbortSignal) {
      if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) {
        throw new EngineError(
          EngineErrorCode.RuntimeUnavailable,
          'Object URLs are not available in this environment',
        );
      }

      const blob = await blobSource.blob(signal);
      const url = URL.createObjectURL(blob);
      return { url, revoke: () => URL.revokeObjectURL(url) };
    },
  };
}
