/**
 * A page surface's geometry, the same on a Stage page and in a `PageView`, in every framework.
 *
 * Every number comes from the page transform: the display footprint (`viewWidth`/`viewHeight`,
 * already swapped for a quarter turn and snapped to device pixels) and the unturned content box
 * (`contentWidth`/`contentHeight`). The outer box is the footprint plus the bands reserved for
 * page chrome; the drop shadow sits at the footprint, axis-aligned, so it stays put when the page
 * turns; the content box is centred on the footprint and turned about its centre, with no
 * translate, so an upright page carries no transform and snaps to pixels like its shadow.
 */
import type { PageFrameShape } from './page-context';

/** A box in its parent's pixels. */
export interface SurfaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The transform members a surface is laid out from; `PageTransform` satisfies it. */
export interface SurfaceTransform {
  readonly rotation: 0 | 90 | 180 | 270;
  readonly viewWidth: number;
  readonly viewHeight: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
}

/** The three boxes of a page surface. */
export interface PageSurfaceLayout {
  /** The footprint and the reserved bands, in the surface's parent; the page chrome fills it. */
  outer: SurfaceBox;
  /** The drop shadow at the footprint, in the outer box. */
  shadow: SurfaceBox;
  /** The page's content box in the outer box, before it turns; its layers draw in it. */
  content: SurfaceBox;
  /** The CSS transform that turns the content box about its centre, or null when it's upright. */
  turn: string | null;
}

/**
 * Lay out a page surface. `footprint` is where the page's footprint sits in the surface's
 * parent (a Stage page's device-snapped `screenX`/`screenY`); the outer box sits one band further
 * out, so the content keeps its place. Without it the outer box is at 0, 0 (a `PageView`, placed
 * by the page around it).
 */
export function pageSurfaceLayout(
  transform: SurfaceTransform,
  frame: PageFrameShape,
  footprint?: { x: number; y: number },
): PageSurfaceLayout {
  const { viewWidth, viewHeight, contentWidth, contentHeight, rotation } = transform;
  return {
    outer: {
      left: footprint ? footprint.x - frame.left : 0,
      top: footprint ? footprint.y - frame.top : 0,
      width: viewWidth + frame.left + frame.right,
      height: viewHeight + frame.top + frame.bottom,
    },
    shadow: { left: frame.left, top: frame.top, width: viewWidth, height: viewHeight },
    content: {
      left: frame.left + (viewWidth - contentWidth) / 2,
      top: frame.top + (viewHeight - contentHeight) / 2,
      width: contentWidth,
      height: contentHeight,
    },
    turn: rotation ? `rotate(${rotation}deg)` : null,
  };
}

/** What {@link stagePageDemand} reads from the Stage; `StageCapability` satisfies it. */
export interface StageDemandSource {
  listVisiblePages(): readonly {
    readonly ref: { readonly objectNumber: number };
    readonly transform: { readonly deviceWidth: number };
    readonly visibleRect: { x: number; y: number; width: number; height: number };
  }[];
}

/** What a page's view wants rendered; the render plugin's `PageViewDemand` takes it. */
export interface StagePageDemand {
  desiredDeviceWidth: number;
  visibleRect: { x: number; y: number; width: number; height: number };
}

/**
 * What a Stage page's view wants rendered, read live from the Stage when the render layer asks:
 * the page's visible part at its device width, or a zero box (want nothing) while the page is
 * off screen, at `offScreenDeviceWidth`. Visibility is the Stage's data, so no adapter derives
 * camera math or keeps a copy of it.
 */
export function stagePageDemand(
  stage: StageDemandSource,
  pageObjectNumber: number,
  offScreenDeviceWidth: number,
): StagePageDemand {
  const visible = stage
    .listVisiblePages()
    .find((visiblePage) => visiblePage.ref.objectNumber === pageObjectNumber);
  return visible
    ? { desiredDeviceWidth: visible.transform.deviceWidth, visibleRect: visible.visibleRect }
    : {
        desiredDeviceWidth: offScreenDeviceWidth,
        visibleRect: { x: 0, y: 0, width: 0, height: 0 },
      };
}

/** One CSS pixel per 1/96 inch, one PDF point per 1/72 inch. */
const CSS_PIXELS_PER_POINT = 96 / 72;

/** The page a `PageView` shows, as its document's page list has it. */
export interface PageViewPage {
  readonly size: { readonly width: number; readonly height: number };
  readonly rotation: 0 | 90 | 180 | 270;
  readonly userUnit: number;
}

/** The input of `pageTransform()` (`@embedpdf/core-geometry`) for a `PageView`. */
export interface PageViewTransformInput {
  pageSize: { width: number; height: number };
  rotation: 0 | 90 | 180 | 270;
  scale: number;
  baseScale: number;
  dpr: number;
}

/**
 * What a `PageView` builds its page transform from: no camera, so the scale (view pixels per
 * point) is `width` over the page's width. The base scale is physical 100% on the web, a point
 * at 96/72 CSS pixels times the page's /UserUnit, so `transform.zoom` still means something: a
 * thumbnail-sized page reads as zoomed out. Without a page yet, a 1 × 1 placeholder.
 */
export function pageViewTransformInput(
  page: PageViewPage | null,
  width: number,
  dpr: number,
): PageViewTransformInput {
  return {
    pageSize: page ? { width: page.size.width, height: page.size.height } : { width: 1, height: 1 },
    rotation: page?.rotation ?? 0,
    scale: page ? width / page.size.width : 1,
    baseScale: CSS_PIXELS_PER_POINT * (page?.userUnit ?? 1),
    dpr,
  };
}
