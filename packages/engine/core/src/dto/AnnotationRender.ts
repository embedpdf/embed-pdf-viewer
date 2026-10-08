import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type {
  PageImageHandle,
  PageNetworkRenderFormat,
  PageRaster,
  PageRenderViewport,
} from './PageRender';
import type { PdfRotation } from '../geometry/primitives';
import { annotationKey } from '../identity/annotationKey';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageRef } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Which `/AP` entry an appearance is: Normal (`/N`), shown at rest;
 * Rollover (`/R`), while the pointer is over the annotation; Down (`/D`),
 * while it is pressed (ISO 32000-2 §12.5.5).
 */
export type AnnotationAppearanceMode = 'normal' | 'rollover' | 'down';

/** Every appearance mode, in the one order the engine renders and names them. */
export const ANNOTATION_APPEARANCE_MODES: readonly AnnotationAppearanceMode[] = [
  'normal',
  'rollover',
  'down',
];

/**
 * The modes a request asks for, each once and in
 * {@link ANNOTATION_APPEARANCE_MODES} order; `undefined` when it asks for
 * every mode, whether by leaving `modes` out or by naming all three, so both
 * are one request (and one cached image set). An empty list asks for nothing
 * and is refused with `InvalidArg`.
 */
export function appearanceModesOf(
  modes: readonly AnnotationAppearanceMode[] | undefined,
): readonly AnnotationAppearanceMode[] | undefined {
  if (modes === undefined) return undefined;
  if (modes.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'modes must name at least one mode', {
      details: { field: 'modes' },
    });
  }
  const wanted = ANNOTATION_APPEARANCE_MODES.filter((mode) => modes.includes(mode));
  return wanted.length === ANNOTATION_APPEARANCE_MODES.length ? undefined : wanted;
}

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
   * Which appearance modes to render, of those each annotation stores.
   * Default: every mode it stores, so one call gives the look at rest, under
   * the pointer and pressed. A mode an annotation doesn't store gives no
   * image for it. Pass `['normal']` for the look at rest only. An empty list
   * is refused with `InvalidArg`.
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
  /** WebP quality from 0 (smallest) to 1 (best); PNG ignores it. */
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
 * same as the annotation list endpoint. Which state an annotation shows
 * (`/AS`) is not part of it either: every state is rendered, so switching a
 * check box changes no image.
 */
export interface AnnotationAppearancesQuery {
  options: AnnotationAppearanceImageOptions;
  annotationVersion?: number;
}

/**
 * The widget twin of {@link AnnotationAppearancesQuery}: a page's widget
 * images change exactly when its widgets do, so `widgetVersion` keys them.
 */
export interface WidgetAppearancesQuery {
  options: AnnotationAppearanceImageOptions;
  widgetVersion?: number;
}

/**
 * One rendered appearance: the raw RGBA raster plus the metadata needed to
 * position and identify it. `rect` is the placement box in page space, so
 * the consumer can place the bitmap without a second read.
 *
 * Rotation convention (`appearanceTurnOf`): a box kind (square, circle,
 * free text, stamp, caret) drawn turned, whose drawing stays inside the
 * turned box, renders turned back upright and `rect` is its `box`; the
 * consumer re-applies the DTO's `rotation`, degrees clockwise, as a view
 * transform about the box centre (CSS `rotate()` turns the same way), which
 * makes the raster rotation-invariant (rotating never re-renders).
 * Everything else — lines, polygons and ink, drawn with their points turned,
 * a free-text callout, a turned drawing that reaches past its box,
 * and appearances with any other matrix — renders as-is with `rect` =
 * `/Rect` and needs no transform.
 *
 * An annotation with no normal appearance in the file (`hasAppearance`
 * false) renders as the engine draws it in memory, never written: `rect` is
 * the box that drawing takes, which can reach past `/Rect` (a line's
 * arrowhead on a `/Rect` with no height). One the engine can't draw without
 * writing an appearance has no raster.
 */
export interface AnnotationAppearanceRaster<C extends Coordinates = PageCoordinates> {
  /** The annotation's name, for every annotation with an appearance. */
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  /**
   * The state this image draws, when the mode stores several (a check box's
   * `Off` and its on state): every state comes back, whatever `/AS` says,
   * and the annotation's `appearanceState` (or its form field's value) says
   * which one shows. `null` when the mode is a single appearance.
   */
  state: string | null;
  rect: C['box'];
  raster: PageRaster;
}

/**
 * Batch result for one page: the page, and every rendered appearance, keyed
 * implicitly by `ref` on each entry.
 */
export interface AnnotationAppearancesResult<C extends Coordinates = PageCoordinates> {
  page: PageRef;
  appearances: AnnotationAppearanceRaster<C>[];
}

/**
 * Encoded counterpart of {@link AnnotationAppearanceRaster}: the same
 * identity/placement metadata, but the RGBA raster has been run through an
 * image encoder into a lazily-fetched `PageImageHandle` (PNG/WebP). This is
 * what both the local engine's `renderAppearances()` and the cloud
 * client (decoding the multipart parts) produce.
 */
export interface AnnotationAppearanceImage<C extends Coordinates = PageCoordinates> {
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  /** The state this image draws — see {@link AnnotationAppearanceRaster}. */
  state: string | null;
  /** Placement box (unrotated for rotation-stripped renders) — see
   *  {@link AnnotationAppearanceRaster}. */
  rect: C['box'];
  image: PageImageHandle;
}

/**
 * Batch encoded result for one page — image-handle analogue of
 * {@link AnnotationAppearancesResult}.
 */
export interface AnnotationAppearanceImagesResult<C extends Coordinates = PageCoordinates> {
  page: PageRef;
  appearances: AnnotationAppearanceImage<C>[];
}

/**
 * One entry in the `multipart/form-data` manifest the cloud appearance
 * endpoint returns. Identifies which multipart part (`part`) carries the
 * encoded bitmap for this annotation, plus the metadata the client needs to
 * place and identify it without a second round-trip. The client addresses the
 * image by `part` and identifies the annotation by `ref`, so every annotation
 * with an appearance stream is emitted.
 */
export interface AnnotationAppearanceManifestEntry<C extends Coordinates = PageCoordinates> {
  /** `name` of the multipart part carrying this appearance's image bytes. */
  part: string;
  ref: AnnotationRef;
  mode: AnnotationAppearanceMode;
  state: string | null;
  rect: C['box'];
  width: number;
  height: number;
  format: PageNetworkRenderFormat;
  contentType: string;
}

/**
 * The JSON part (`name="manifest"`) of the appearance multipart response. The
 * remaining parts are the encoded images, one per `appearances[i].part`.
 */
export interface AnnotationAppearanceManifest<C extends Coordinates = PageCoordinates> {
  page: PageRef;
  appearances: AnnotationAppearanceManifestEntry<C>[];
}

/**
 * The pictures that show the page as it is now: each annotation's look at
 * rest (`normal`), in the state it shows. An appearance batch holds every
 * look and state an annotation stores; this picks, for each annotation, the
 * one a page shows: the state its `appearanceState` names, or `Off` when it
 * names none, as PDFium draws it. A state with no picture shows nothing.
 */
export function shownAppearances<
  Appearance extends {
    readonly ref: AnnotationRef;
    readonly mode: AnnotationAppearanceMode;
    readonly state: string | null;
  },
>(
  appearances: readonly Appearance[],
  annotations: readonly { readonly ref: AnnotationRef; readonly appearanceState: string | null }[],
): Appearance[] {
  const shownState = new Map<string, string>();
  for (const annotation of annotations) {
    shownState.set(annotationKey(annotation.ref), annotation.appearanceState ?? 'Off');
  }
  return appearances.filter(
    (appearance) =>
      appearance.mode === 'normal' &&
      (appearance.state === null ||
        appearance.state === (shownState.get(annotationKey(appearance.ref)) ?? 'Off')),
  );
}
