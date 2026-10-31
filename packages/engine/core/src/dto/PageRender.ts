import { PermissionDenied } from '../auth/scope/errors';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageRenderTransform } from '../geometry/pageTransform';
import type { PdfRotation } from '../geometry/primitives';
import type { PageFlattenUsage } from '../mutation/PageFlattenResult';
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

/** What a page picture draws beside the page content. */
export interface PageRenderLayers {
  readonly includeAnnotations: boolean;
  readonly includeFormFields: boolean;
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
): PageRenderLayers {
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

/**
 * The two print resolutions, one per print right: 150 for `doc.print`, 300
 * for `doc.print.high` (Acrobat's low and high resolution printing).
 */
export type PrintDpi = 150 | 300;

/**
 * A thumbnail's long side, in pixels: a thumbnail is the whole page at this
 * size, whatever the page's (a US Letter page is 396 × 512).
 */
export const PAGE_THUMBNAIL_SIZE = 512;

/**
 * What a caller may draw, for {@link checkRenderUsage}: each kind of picture
 * has its own right, and needs no other.
 */
export interface PagePictureRights {
  /** `doc.render`: pictures on screen, any size, any area. */
  readonly render: boolean;
  /** `doc.render.thumbnail`: thumbnails (`doc.render` implies it). */
  readonly thumbnail: boolean;
  /** `doc.print`. */
  readonly print: boolean;
  /** `doc.print.high`. */
  readonly printHigh: boolean;
}

/**
 * Check what a render is for, and that the caller may make that picture. A
 * print picture (`usage: 'print'`) takes a `{ kind: 'dpi', dpi }` viewport
 * with a DPI of 150 or 300, and no `target`, `rotation` or `background`: it
 * is the whole page, upright, on white. A `dpi` viewport is for print
 * pictures only. A thumbnail (a `{ kind: 'thumbnail' }` viewport) is for the
 * screen and is always the whole page, so it takes no `target`. Anything
 * else is `InvalidArg`, naming the option. With the caller's rights, a
 * picture they may not make is refused (`PermissionDenied`), each kind by its
 * own right only: a screen picture without `doc.render`, a thumbnail without
 * `doc.render.thumbnail`, any print without `doc.print` and 300 DPI without
 * `doc.print.high`. Without them (a cloud caller whose rights the client
 * can't know), the server decides.
 */
export function checkRenderUsage<C extends Coordinates>(
  options:
    | Pick<PageRenderOptions<C>, 'usage' | 'viewport' | 'target' | 'rotation' | 'background'>
    | undefined,
  may: PagePictureRights | null,
): void {
  const { usage, viewport } = options ?? {};
  if (usage === undefined || usage === 'display') {
    if (viewport?.kind === 'dpi') {
      invalid('viewport', 'a dpi viewport is only for a print picture (usage: "print")');
    }
    if (viewport?.kind === 'thumbnail') {
      if (options?.target !== undefined && options.target.kind !== 'page') {
        invalid('target', 'a thumbnail is the whole page: it takes no target');
      }
      if (may !== null && !may.thumbnail) {
        throw new PermissionDenied('doc.render.thumbnail', 'viewport');
      }
      return;
    }
    if (may !== null && !may.render) throw new PermissionDenied('doc.render', 'usage');
    return;
  }
  if (usage !== 'print') invalid('usage', 'usage must be "display" or "print"');
  if (viewport?.kind !== 'dpi' || (viewport.dpi !== 150 && viewport.dpi !== 300)) {
    invalid('viewport', "a print picture needs viewport: { kind: 'dpi', dpi: 150 or 300 }");
  }
  for (const field of ['target', 'rotation', 'background'] as const) {
    if (options?.[field] !== undefined) {
      invalid(field, `a print picture takes no ${field}: it is the whole page, upright, on white`);
    }
  }
  if (may === null) return;
  if (!may.print) throw new PermissionDenied('doc.print', 'usage');
  if (viewport.dpi === 300 && !may.printHigh) {
    throw new PermissionDenied('doc.print.high', 'viewport');
  }
}

/** A print picture's DPI: its viewport's, when it is one; otherwise `undefined`. */
export function printDpiOf(
  options: Pick<PageRenderOptions, 'usage' | 'viewport'> | undefined,
): PrintDpi | undefined {
  return options?.usage === 'print' && options.viewport?.kind === 'dpi'
    ? options.viewport.dpi
    : undefined;
}

function invalid(field: string, message: string): never {
  throw new EngineError(EngineErrorCode.InvalidArg, message, { details: { field } });
}

/** A screen picture's size: by its scale, or by its width. */
export type PageScreenViewport =
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

/** A picture's size: a screen size, a thumbnail, or a print picture's DPI. */
export type PageRenderViewport =
  | PageScreenViewport
  | {
      /**
       * A thumbnail: the whole page, {@link PAGE_THUMBNAIL_SIZE} pixels on its
       * long side. Needs `doc.render.thumbnail`, which `doc.render` includes.
       */
      kind: 'thumbnail';
    }
  | {
      /**
       * A print picture's size (`usage: 'print'` only): `dpi` dots per inch
       * of the paper the page prints on, A4 or Letter. A page that fits on
       * that paper is drawn at its own size at this DPI. A bigger one gets
       * no more pixels than it needs shrunk to fit the paper, since the
       * printer would throw the rest away: an A0 drawing at 300 DPI is
       * 2482 × 3508 pixels, not 9933 × 14043. 150 needs `doc.print`, 300
       * `doc.print.high`.
       */
      kind: 'dpi';
      dpi: PrintDpi;
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
   * What the picture is for: the screen (`'display'`, the default) or paper
   * (`'print'`). A print picture follows the print rules: layers in their
   * print state, and only the annotations and form fields with the `print`
   * flag (no-view ones included, hidden ones never). It needs `doc.print`
   * and a `{ kind: 'dpi', dpi }` viewport, and takes no `target`,
   * `rotation` or `background`.
   */
  usage?: PageFlattenUsage;
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
  widgetVersion?: number;
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

/** An encoded image, as a renderer takes it: a blob, or a URL to paint. */
export interface ImageSource {
  /**
   * A `blob:` URL for the image, and `revoke()` to free it. Cancel with
   * `.abort()`: a URL made after the cancel is revoked, never leaked.
   */
  objectUrl(): AbortablePromise<PageImageObjectUrl>;
  /**
   * The encoded image. The same call on both engines: the cloud engine
   * fetches it with the document's token. Cancel with `.abort()`.
   */
  blob(): AbortablePromise<Blob>;
}

export interface PageImageHandle extends PageImageResult, ImageSource {}

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
  return { ...result, ...imageSourceOf(blobSource) };
}

/**
 * An image whose encoded bytes this device holds (a picture it made, such as
 * a stamp's preview), to paint like one an engine rendered.
 */
export function imageSourceOfBytes(bytes: Uint8Array, contentType: string): ImageSource {
  return imageSourceOf({
    blob: async () => new Blob([bytes.slice()], { type: contentType }),
  });
}

/** The image `blobSource` gives, as a blob and as an object URL. */
function imageSourceOf(blobSource: PageImageBlobSource): ImageSource {
  return {
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
