import { PermissionDenied } from '../auth/scope/errors';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageRenderTransform } from '../geometry/pageTransform';
import type { PdfRotation } from '../geometry/primitives';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';
import { AbortablePromise } from '../promise/AbortablePromise';

export type PageRenderEncodedFormat = 'png' | 'webp' | 'bmp';

/**
 * Formats that are acceptable for cacheable cloud HTTP render endpoints.
 * BMP and raw RGBA stay local-only because they are intentionally huge.
 */
export type PageNetworkRenderFormat = 'png' | 'webp';

export type PageRenderFormat = PageRenderEncodedFormat | 'rgba';

export type PageRenderBackground = 'white' | 'transparent';

/** What a caller may read, for {@link resolvePageLayers}. */
export interface PageLayerRights {
  /** `doc.annotate.read`. */
  readonly annotations: boolean;
  /** `doc.forms.read`. */
  readonly formFields: boolean;
}

/**
 * What a page picture draws: the options as passed, and for each one left
 * out, what the caller may read. A left-out option never asks for more than
 * the caller may see; `true` for something they may not read is refused
 * (`PermissionDenied`, naming the option).
 */
export function resolvePageLayers(
  options: { includeAnnotations?: boolean; includeFormFields?: boolean } | undefined,
  may: PageLayerRights,
): { includeAnnotations: boolean; includeFormFields: boolean } {
  const { includeAnnotations, includeFormFields } = options ?? {};
  if (includeAnnotations === true && !may.annotations) {
    throw new PermissionDenied('doc.annotate.read', 'includeAnnotations');
  }
  if (includeFormFields === true && !may.formFields) {
    throw new PermissionDenied('doc.forms.read', 'includeFormFields');
  }
  return {
    includeAnnotations: includeAnnotations ?? may.annotations,
    includeFormFields: includeFormFields ?? (includeAnnotations === false ? false : may.formFields),
  };
}

export type PageRenderViewport =
  | {
      /**
       * Render one point as `scale` device pixels. Callers
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

export type PageRenderTarget<C extends Coordinates = PageCoordinates> =
  | { kind: 'page' }
  | {
      kind: 'rect';
      /** The area to render, in page space: from the page's top-left, y down. */
      rect: C['box'];
    };

export interface PageRenderOptions<C extends Coordinates = PageCoordinates> {
  target?: PageRenderTarget<C>;
  viewport?: PageRenderViewport;
  rotation?: PdfRotation;
  background?: PageRenderBackground;
  /**
   * Draw the page's annotations into the picture, from their appearances.
   * Default: `true` when the caller may read annotations
   * (`doc.annotate.read`), so the page is drawn as the caller may see it.
   * `true` for a caller who may not is refused.
   */
  includeAnnotations?: boolean;
  /**
   * Draw the form fields too: the widgets, each in the state its field
   * shows. Default: `false` when `includeAnnotations` is `false`, otherwise
   * `true` when the caller may read the form (`doc.forms.read`), so a page
   * with annotations is the page as printed, filled form included. Pass
   * `false` when something else paints the fields over the picture, as a
   * viewer's form layer does. `true` for a caller who may not read the form
   * is refused. Hidden fields are never drawn, and no-view ones only when
   * printing.
   */
  includeFormFields?: boolean;
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

export interface PageImageOptions<
  C extends Coordinates = PageCoordinates,
> extends PageRenderOptions<C> {
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
  /**
   * The encoded image, typed `contentType`. The same call on both engines:
   * the cloud engine fetches it with the document's token. Cancel with
   * `.abort()`.
   */
  blob(): AbortablePromise<Blob>;
}

/** What `render.image()` gives: the image, and how its pixels map to page space. */
export interface PageRenderImage extends PageImageHandle {
  transform: PageRenderTransform;
}

/** What `render.raw()` gives: the pixels, and how they map to page space. */
export interface PageRenderRaster extends PageRaster {
  transform: PageRenderTransform;
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
    blob() {
      return AbortablePromise.run(async (signal) => {
        if (typeof Blob === 'undefined') {
          throw new EngineError(
            EngineErrorCode.RuntimeUnavailable,
            'Blob is not available in this environment',
          );
        }
        const blob = await blobSource.blob(signal);
        if (signal.aborted) throw signal.reason;
        return blob;
      });
    },
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
