import type { PageImageHandle, PageNetworkRenderFormat, PageRaster } from './PageRender';
import type { PdfRect, PdfRotation } from '../geometry/primitives';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageState } from '../revision/PageState';

/**
 * Which `/AP` sub-dictionary to render. PDFium exposes Normal (`/N`),
 * Rollover (`/R`) and Down (`/D`); the overwhelming common case for a
 * static appearance is `normal`.
 */
export type AnnotationAppearanceMode = 'normal' | 'rollover' | 'down';

/**
 * Worker-side options for batch-rendering a page's annotation appearance
 * streams. Deliberately narrower than `PageRenderOptions`: appearance
 * bitmaps are sized to each annotation's own `/Rect`, so there is no
 * page target/viewport — only a uniform device scale and page rotation.
 */
export interface AnnotationAppearanceRenderOptions {
  /**
   * Device pixels per PDF user-space unit. Callers that care about
   * devicePixelRatio should fold it into this value. Default `1`.
   */
  scale?: number;
  /** Page rotation in degrees clockwise. Default `0`. */
  rotation?: PdfRotation;
  /**
   * Appearance modes to render per annotation. Only modes that actually
   * exist on the annotation's `/AP` are emitted. Default `['normal']`.
   */
  modes?: AnnotationAppearanceMode[];
}

/**
 * Encoded-output options for the cacheable cloud HTTP endpoint. Extends
 * the worker render options with image-encoding controls, mirroring the
 * `PageRenderOptions` -> `PageImageOptions` split.
 */
export interface AnnotationAppearanceImageOptions extends AnnotationAppearanceRenderOptions {
  format?: PageNetworkRenderFormat;
  quality?: number;
}

/**
 * HTTP/token shape: encoded options plus the version field used to make the
 * response content-addressed and CDN-cacheable.
 *
 * Only `annotationVersion` matters here: an appearance bitmap is rendered
 * purely from the annotation's own `/AP` stream, so it changes iff the
 * annotation changes. Page base content (`contentVersion`/`docVersion`) does
 * not affect appearances and is deliberately NOT part of the cache key —
 * same as the annotation list endpoint.
 */
export interface AnnotationAppearancesQuery {
  options: AnnotationAppearanceImageOptions;
  annotationVersion?: number;
}

/**
 * One rendered appearance: the raw RGBA raster plus the metadata needed to
 * position and identify it. `rect` is the placement box in PDF user space
 * (y-up), so the consumer can place the bitmap without a second read.
 *
 * Rotation convention: for annotations whose rotation lives in the AP
 * `/Matrix` — box-family kinds (square/circle/free-text/stamp) whose DTO
 * carries BOTH `rotation` and `unrotatedRect` — the raster renders
 * ROTATION-STRIPPED and `rect` is the logical `unrotatedRect`; the consumer
 * re-applies the DTO's `rotation` as a view transform about the box centre
 * (e.g. CSS `rotate`), which makes the raster rotation-invariant (rotating
 * never re-renders). Everything else — vertex kinds, whose rotation is
 * pre-baked into their geometry, and foreign PDFs with arbitrary AP
 * matrices — renders as-is with `rect` = `/Rect` and needs no transform.
 */
export interface AnnotationAppearanceRaster {
  /** Full wire identity (durable or weak), including index-only annotations. */
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  rect: PdfRect;
  raster: PageRaster;
}

/**
 * Batch result for one page: the page revision state plus every rendered
 * appearance, keyed implicitly by `ref` on each entry.
 */
export interface AnnotationAppearancesResult {
  pageState: PageState;
  appearances: AnnotationAppearanceRaster[];
}

/**
 * Encoded counterpart of {@link AnnotationAppearanceRaster}: the same
 * identity/placement metadata, but the RGBA raster has been run through an
 * image encoder into a lazily-fetched `PageImageHandle` (PNG/WebP). This is
 * what both the local engine's `renderAppearanceImages()` and the cloud
 * client (decoding the multipart parts) produce.
 */
export interface AnnotationAppearanceImage {
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  /** Placement box (unrotated for rotation-stripped renders) — see
   *  {@link AnnotationAppearanceRaster}. */
  rect: PdfRect;
  image: PageImageHandle;
}

/**
 * Batch encoded result for one page — image-handle analogue of
 * {@link AnnotationAppearancesResult}.
 */
export interface AnnotationAppearanceImagesResult {
  pageState: PageState;
  appearances: AnnotationAppearanceImage[];
}

/**
 * One entry in the `multipart/form-data` manifest the cloud appearance
 * endpoint returns. Identifies which multipart part (`part`) carries the
 * encoded bitmap for this annotation, plus the metadata the client needs to
 * place and identify it without a second round-trip. The client addresses the
 * image by `part` and identifies the annotation by `ref` (durable or weak), so
 * every annotation with an appearance stream is emitted — including index-only
 * ones.
 */
export interface AnnotationAppearanceManifestEntry {
  /** `name` of the multipart part carrying this appearance's image bytes. */
  part: string;
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  rect: PdfRect;
  width: number;
  height: number;
  format: PageNetworkRenderFormat;
  contentType: string;
}

/**
 * The JSON part (`name="manifest"`) of the appearance multipart response. The
 * remaining parts are the encoded images, one per `appearances[i].part`.
 */
export interface AnnotationAppearanceManifest {
  pageState: PageState;
  appearances: AnnotationAppearanceManifestEntry[];
}
