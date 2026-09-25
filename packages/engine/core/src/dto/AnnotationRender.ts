import type {
  PageImageHandle,
  PageNetworkRenderFormat,
  PageRaster,
  PageRenderViewport,
} from './PageRender';
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
 * Options for batch-rendering a page's annotation appearance streams.
 * Narrower than `PageRenderOptions`: each bitmap is sized to its
 * annotation's own `/Rect`, so there is no target.
 */
export interface AnnotationAppearanceRenderOptions {
  /**
   * The size, as for a page render: the appearances come out at the scale
   * the page would have at this viewport, so passing a page image's
   * viewport makes them match it. `{ kind: 'width' }` is the width of the
   * whole (turned) page. Default `{ kind: 'scale', scale: 1 }`.
   */
  viewport?: PageRenderViewport;
  /** Page rotation in degrees clockwise. Default `0`. */
  rotation?: PdfRotation;
  /**
   * Appearance modes to render per annotation. Only modes that actually
   * exist on the annotation's `/AP` are emitted. Default `['normal']`.
   */
  modes?: AnnotationAppearanceMode[];
  /**
   * Output-pixel budget per appearance — same semantics as
   * `PageRenderOptions.maxOutputPixels`: appearances are sized by
   * `rect × scale` (the viewport's scale), and a page-sized stamp at a high scale is the same
   * memory bomb a full-page render is. Server requests carry the
   * deployment policy's budget; local callers omit it unless configured.
   */
  maxOutputPixels?: number;
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
 * HTTP/token shape: encoded options plus the version field that makes the
 * response content-addressed and CDN-cacheable.
 *
 * Only `annotationVersion` matters here: an appearance bitmap is rendered
 * purely from the annotation's own `/AP` stream, so it changes iff the
 * annotation changes. Page base content (`contentVersion`/`docVersion`) does
 * not affect appearances and is deliberately not part of the cache key —
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
 * `/Matrix` — box-family kinds (square/circle/free-text/stamp/caret) whose
 * DTO carries both `rotation` and `unrotatedRect` — the raster renders
 * rotation-stripped and `rect` is the logical `unrotatedRect`; the consumer
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
 * what both the local engine's `renderAppearances()` and the cloud
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
