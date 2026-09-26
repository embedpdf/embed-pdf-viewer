/**
 * @embedpdf/core-stage — the pure spatial model.
 *
 * Scene (a layout strategy turns pages into positioned items + a spatial index),
 * Camera ({x,y,zoom}: the world point at the viewport origin + scale), and Anchor
 * (a focal point relative to a page — what survives layout/zoom changes & reloads).
 *
 * Navigation is pure camera math. Bounds/home/margin are three separate functions.
 * No DOM, no framework; plain-data model plus derived spatial queries (the data
 * is serializable — `Scene` also carries query methods derived from it).
 */

// The pure coordinate primitives live in the dependency-free geometry base
// (shared with the framework adapters); stage-core re-exports them so consumers
// can import them from `@embedpdf/core-stage`.
import {
  displaySize,
  NO_FRAME,
  type PageFrame,
  type PageRotation,
  type Point,
  type Size,
} from '@embedpdf/core-geometry';
export type { Point, Size, PageRotation, PageFrame } from '@embedpdf/core-geometry';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface PageGeom {
  /** Un-rotated (intrinsic) page size — the content's own dimensions before rotation. */
  size: Size;
  /** Total display rotation. Layout swaps w↔h for 90/270 so the box is the
   *  on-screen footprint; the renderer rotates the content into it. */
  rotation?: PageRotation;
  /**
   * PDF `/UserUnit` (§14.11.6): how many 1/72" units one point of this page
   * spans — the page is physically `userUnit ×` larger than its point size
   * says. Folded into the layout (a userUnit-5 page lays out 5× bigger, like
   * Acrobat) and into its `contentScale`, so "world per content point" stays
   * true per page. Default 1 (virtually every document).
   */
  userUnit?: number;
}
export interface PageBox {
  pageIndex: number;
  x: number;
  y: number;
  /** Display width — swapped to the page's height for 90/270 rotations. */
  width: number;
  /** Display height — swapped to the page's width for 90/270 rotations. */
  height: number;
  /** The page's total display rotation; the renderer rotates the (normalized,
   *  un-rotated) content bitmap by this to fill the display box. */
  rotation: PageRotation;
  /**
   * World size ÷ intrinsic size for this page (1 for `intrinsic` sizing). The shell
   * multiplies it by the camera zoom to get device-px-per-PDF-point, so render
   * resolution and point↔screen mapping stay correct under `uniform` sizing.
   * Isotropic, so it is unaffected by rotation.
   */
  contentScale: number;
}

/** The page's on-screen footprint: w↔h swapped for quarter-turns (via the shared
 *  geometry primitive), scaled by its `/UserUnit` (the page's physical size — a
 *  userUnit-5 page measures 5× its point size). Everything the layout packs uses
 *  these display dims; the content scale (isotropic) and the renderer's
 *  transform recover the content. */
function displayDims(pg: PageGeom): Size {
  const userUnit = pg.userUnit ?? 1;
  const size = displaySize(pg.size, pg.rotation ?? 0);
  return userUnit === 1 ? size : { width: size.width * userUnit, height: size.height * userUnit };
}
export interface SceneItem {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndexes: number[];
  pages: PageBox[];
}
export type Axis = 'x' | 'y' | 'grid';
export interface Scene {
  size: Size;
  items: SceneItem[];
  itemCount: number;
  axis: Axis;
  /**
   * The largest item width & height in the document. Fit-modes resolve against this
   * (not the current page) so the zoom is stable across the whole document and no
   * page ever overflows — matching a conventional PDF viewer's "fit width".
   */
  maxItemSize: Size;
  query(rect: Rect): SceneItem[];
  nearestItem(pt: Point): SceneItem;
  itemOfPage(pageIndex: number): number;
}
export interface CameraConstraint {
  bounded: boolean;
  /**
   * Breathing room (screen px) around the content — the one spacing concept.
   * Fit-modes inset by it, placement leaves it as gutter, and the clamp lets the
   * camera reveal exactly this much beyond each content edge.
   */
  padding: number;
  /** Where content rests on an axis it fits (locked — there is nowhere else to
   *  be). Default center/center. x is logical against `direction`. */
  fitAlign?: Alignment;
  direction?: Direction;
}
/**
 * The zoom intent — an equation about the fit-box, each resolved by `resolveZoom`:
 *   { mode }       — viewport-relative: fit-width / fit-page / automatic / fit-all
 *   { level }      — document-relative: a fixed scale factor
 *   { pageWidth }  — absolute: the page unit renders N **screen px** wide. The only
 *                    intent stable across both viewport and document differences —
 *                    e.g. thumbnails at 200px for any document. Targets the page
 *                    unit (a spread counts as one, exactly as in fit-page/fit-width);
 *                    combine with sizing 'uniform' to make every page exactly N px.
 *   { pageHeight } — absolute, vertical twin (horizontal filmstrip thumbnails).
 */
export type ZoomSpec =
  | { mode: ZoomModeValue }
  | { level: number }
  | { pageWidth: number }
  | { pageHeight: number };
export interface Anchor {
  pageIndex: number;
  fx: number;
  fy: number;
}
export type SpreadMode = 'none' | 'odd' | 'even';
/**
 * Reading direction — a layout property, not a navigation one. Navigation steps by
 * index (reading order); direction only decides where reading-order puts pages in
 * space: horizontal items advance leftward, spreads bind on the right, grid rows
 * fill right→left. The camera, cursor, fit and clamp never learn about it.
 */
export type Direction = 'ltr' | 'rtl';
/**
 * Page sizing policy (per-item world scale, set in the layout):
 *   'intrinsic' — true PDF sizes; relative proportions preserved.
 *   'uniform'   — every item scaled to the same cross-axis size (vertical → equal
 *                 widths, horizontal → equal heights, grid → equal widths), so pages
 *                 sit flush with no left/right gaps. Camera/zoom are untouched.
 */
export type SizingMode = 'intrinsic' | 'uniform';

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 64;
export const ZoomMode = {
  Automatic: 'automatic',
  FitPage: 'fit-page',
  FitWidth: 'fit-width',
  /** Fit the whole scene (every page) in view — the construction overview. */
  FitAll: 'fit-all',
} as const;
export type ZoomModeValue = (typeof ZoomMode)[keyof typeof ZoomMode];

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

// ── Projection ──────────────────────────────────────────────────────────────
export const toScreen = (camera: Camera, point: Point): Point => ({
  x: (point.x - camera.x) * camera.zoom,
  y: (point.y - camera.y) * camera.zoom,
});
export const toWorld = (camera: Camera, point: Point): Point => ({
  x: camera.x + point.x / camera.zoom,
  y: camera.y + point.y / camera.zoom,
});
export const cameraWorldRect = (camera: Camera, vp: Size): Rect => ({
  x: camera.x,
  y: camera.y,
  width: vp.width / camera.zoom,
  height: vp.height / camera.zoom,
});

// ── Camera operations ────────────────────────────────────────────────────────
/** Focal zoom: keep the world point under `screenPt` fixed (no bounce). */
export const zoomAround = (camera: Camera, screenPt: Point, factor: number): Camera => {
  const zoom = clamp(camera.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  return {
    x: camera.x + screenPt.x / camera.zoom - screenPt.x / zoom,
    y: camera.y + screenPt.y / camera.zoom - screenPt.y / zoom,
    zoom,
  };
};
export const panByScreen = (camera: Camera, dxScreen: number, dyScreen: number): Camera => ({
  x: camera.x - dxScreen / camera.zoom,
  y: camera.y - dyScreen / camera.zoom,
  zoom: camera.zoom,
});
export const centerOnWorld = (worldPt: Point, vp: Size, zoom: number): Camera => ({
  zoom,
  x: worldPt.x - vp.width / 2 / zoom,
  y: worldPt.y - vp.height / 2 / zoom,
});

/**
 * One axis of camera travel against content bounds — the scroll geometry.
 * `near`/`far` are the two flush camera positions (content start edge at the
 * padded viewport start / content end edge at the padded viewport end); the
 * camera travels in [near, far] while the padded content overflows the view.
 * When it fits the interval inverts and `fits` is true — there is nowhere to
 * travel, and the clamp locks the camera to its fitAlign rest instead. Shared
 * by `clampCamera` and `scrollMetrics`, so the pan clamp and a scrollbar can
 * never disagree about where travel ends.
 */
export interface AxisTravel {
  near: number;
  far: number;
  fits: boolean;
}
export const travelRange = (
  origin: number,
  content: number,
  view: number,
  zoom: number,
  padding: number,
): AxisTravel => ({
  near: origin - padding / zoom,
  far: origin + content - (view - padding) / zoom,
  fits: content * zoom <= view - 2 * padding,
});

/**
 * Bounds — the one place travel limits live. Clamps the camera into an arbitrary
 * world `Rect` (the whole document in continuous flow, one item in paged flow),
 * with a `padding` gutter the camera may reveal beyond each content edge.
 *
 * Per axis the travel interval is `travelRange`'s [near, far]. If the padded
 * content overflows the viewport, the camera travels freely in it. If it fits,
 * the camera is locked to the `fitAlign` rest point — start = near, end = far,
 * center = midpoint (x resolved logically against `direction`).
 */
export const clampCamera = (
  camera: Camera,
  bounds: Rect,
  vp: Size,
  constraint: CameraConstraint,
): Camera => {
  if (!constraint.bounded) return camera;
  const padding = constraint.padding;
  const fit = constraint.fitAlign ?? { x: 'center', y: 'center' };
  const axis = (
    pos: number,
    origin: number,
    content: number,
    view: number,
    align: Align,
  ): number => {
    const travel = travelRange(origin, content, view, camera.zoom, padding);
    if (travel.fits)
      return align === 'start'
        ? travel.near
        : align === 'end'
          ? travel.far
          : (travel.near + travel.far) / 2; // fits: rest & lock
    return clamp(pos, travel.near, travel.far);
  };
  // logical x: under RTL the reading start is the right edge
  const ax =
    constraint.direction === 'rtl' && fit.x !== 'center'
      ? fit.x === 'start'
        ? 'end'
        : 'start'
      : fit.x;
  return {
    zoom: camera.zoom,
    x: axis(camera.x, bounds.x, bounds.width, vp.width, ax),
    y: axis(camera.y, bounds.y, bounds.height, vp.height, fit.y),
  };
};

/**
 * The camera as a native scroller — the DOM scroll vocabulary, in screen px:
 * every field means exactly what it means on a DOM element. Per axis the scroll
 * range is the union of the padded content extent and the current camera window:
 *   • bounded — the clamp already keeps the window inside the padded content
 *     (or rests it when the axis fits), so the union is the padded content and
 *     the numbers degenerate to the classic scroller (scrollLeft ∈
 *     [0, scrollWidth − clientWidth], aligned with `travelRange`'s [near, far]).
 *   • unbounded — pan beyond the content and the union grows (the Figma
 *     scrollbar): the thumb shrinks toward the edge but always remains a road
 *     back over the content.
 * `scrollableX/Y` false ⇔ the window covers the whole range (native: no bar).
 * One formula, no mode branching — the clamp did the branching already.
 * Coordinates are physical on both axes (RTL included), deliberately sidestepping
 * the DOM's negative-scrollLeft-under-RTL behavior.
 */
export interface ScrollMetrics {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
  scrollableX: boolean;
  scrollableY: boolean;
}
export const scrollMetrics = (
  camera: Camera,
  bounds: Rect,
  vp: Size,
  padding: number,
): ScrollMetrics => {
  const axis = (pos: number, origin: number, content: number, view: number) => {
    const lo = Math.min(origin - padding / camera.zoom, pos);
    const hi = Math.max(origin + content + padding / camera.zoom, pos + view / camera.zoom);
    const total = (hi - lo) * camera.zoom;
    // half-px slack, like the fits-predicate: sub-pixel overflow must not flash a bar
    return { offset: (pos - lo) * camera.zoom, total, scrollable: total > view + 0.5 };
  };
  const horizontal = axis(camera.x, bounds.x, bounds.width, vp.width);
  const vertical = axis(camera.y, bounds.y, bounds.height, vp.height);
  return {
    scrollLeft: horizontal.offset,
    scrollTop: vertical.offset,
    scrollWidth: horizontal.total,
    scrollHeight: vertical.total,
    clientWidth: vp.width,
    clientHeight: vp.height,
    scrollableX: horizontal.scrollable,
    scrollableY: vertical.scrollable,
  };
};

/**
 * The inverse write — `Element.scrollTo` semantics: absolute offsets into the
 * current range (the same union `scrollMetrics` reports), clamped into
 * [0, total − view]; an omitted axis does not move. Zoom is untouched: scrolling
 * is a pan in scroller clothing.
 */
export const cameraFromScroll = (
  camera: Camera,
  bounds: Rect,
  vp: Size,
  padding: number,
  target: { left?: number; top?: number },
): Camera => {
  const axis = (
    want: number | undefined,
    pos: number,
    origin: number,
    content: number,
    view: number,
  ): number => {
    if (want === undefined) return pos;
    const lo = Math.min(origin - padding / camera.zoom, pos);
    const hi = Math.max(origin + content + padding / camera.zoom, pos + view / camera.zoom);
    const max = Math.max(0, (hi - lo) * camera.zoom - view);
    return lo + clamp(want, 0, max) / camera.zoom;
  };
  return {
    zoom: camera.zoom,
    x: axis(target.left, camera.x, bounds.x, bounds.width, vp.width),
    y: axis(target.top, camera.y, bounds.y, bounds.height, vp.height),
  };
};

/**
 * Per-axis alignment value. Used by the rest constraint (fitAlign — where
 * content settles on an axis the camera cannot travel) and, extended with
 * fractions (see {@link AlignValue}), by the arrival/zoom/anchor policies.
 * On the x-axis the named values are logical (CSS-style): 'start' = where
 * reading begins (left in LTR, right in RTL), 'end' = where it ends. On the
 * y-axis they are physical (start = top). So a 'start' default is
 * automatically correct in both directions — no 'auto' value needed.
 */
export type Align = 'start' | 'center' | 'end';
export interface Alignment {
  x: Align;
  y: Align;
}
/**
 * One axis of an alignment policy: a named stop, or a viewport fraction 0–1
 * that positions the subject's center at that fraction of the viewport
 * ('center' ≡ 0.5; 0.35 = the browser find-bar line). Named stops are logical
 * on x; fractions are physical, like every screen coordinate.
 */
export type AlignValue = Align | number;
export interface AlignmentValue {
  x: AlignValue;
  y: AlignValue;
}

/**
 * The placement algorithm — every arrival (goToPage, next/prev, reset) lands
 * through it. Pure alignment: put the subject at `align` in the viewport —
 * per axis 'start' (reading edge at the padded viewport edge), 'end' (far
 * edge), 'center', or a fraction — with x resolved logically against the
 * reading direction. The same rule at every zoom: whether the subject fits or
 * overflows never changes where it lands. Landing is policy, not a side
 * effect of magnification.
 *
 * Deliberately clamp-free: the caller clamps the result against the true
 * travel bounds (the scene in continuous flow, the item slice in paged). On
 * an axis with no real freedom that clamp collapses the landing to the
 * `fitAlign` rest point — "rests where it must" comes out of the clamp's
 * geometry, never out of a branch here.
 */
export function placeCamera(
  subject: Rect,
  vp: Size,
  zoom: number,
  padding = 0,
  align: AlignmentValue = { x: 'start', y: 'start' },
  direction: Direction = 'ltr',
): Camera {
  const axis = (alignValue: AlignValue, pos: number, extent: number, view: number): number => {
    if (alignValue === 'start') return pos - padding / zoom;
    if (alignValue === 'end') return pos + extent - (view - padding) / zoom;
    const fraction = alignValue === 'center' ? 0.5 : clamp(alignValue, 0, 1);
    return pos + extent / 2 - (view * fraction) / zoom;
  };
  const ax =
    direction === 'rtl' && align.x === 'start'
      ? 'end'
      : direction === 'rtl' && align.x === 'end'
        ? 'start'
        : align.x;
  return {
    zoom,
    x: axis(ax, subject.x, subject.width, vp.width),
    y: axis(align.y, subject.y, subject.height, vp.height),
  };
}

/**
 * The minimal camera move that makes `rect` fully visible (with a `padding` gutter)
 * — DOM scrollIntoView({ block: 'nearest' }) as camera math. Per axis, the cameras
 * that show the rect form an interval; the answer is the current camera clamped
 * into it: already inside → unchanged (the no-op case, by construction, not by
 * condition). An oversized rect (interval inverted) aligns to its start.
 *
 * This is deliberately not placement: `placeCamera` answers "I am navigating here"
 * (canonical); `revealCamera` answers "make sure this is seeable" (minimal).
 */
export function revealCamera(cam: Camera, rect: Rect, vp: Size, padding = 0): Camera {
  const axis = (pos: number, start: number, size: number, view: number): number => {
    const lo = start + size - (view - padding) / cam.zoom; // far edge just inside
    const hi = start - padding / cam.zoom; // near edge just inside
    if (lo > hi) return hi; // rect larger than the viewport: align its start
    return clamp(pos, lo, hi);
  };
  return {
    zoom: cam.zoom,
    x: axis(cam.x, rect.x, rect.width, vp.width),
    y: axis(cam.y, rect.y, rect.height, vp.height),
  };
}

// ── Zoom intent — resolved against a fit-box chosen by the caller: the document's
//    max item (continuous), the current item (paged), or the whole scene (fit-all). ─
export function resolveZoom(spec: ZoomSpec, box: Size, vp: Size, padding = 0): number {
  if ('level' in spec) return clamp(spec.level, ZOOM_MIN, ZOOM_MAX);
  // absolute pixel targets: box dimension = N screen px (document-independent)
  if ('pageWidth' in spec) return clamp(spec.pageWidth / box.width, ZOOM_MIN, ZOOM_MAX);
  if ('pageHeight' in spec) return clamp(spec.pageHeight / box.height, ZOOM_MIN, ZOOM_MAX);
  const fitW = Math.max(1, vp.width - 2 * padding) / box.width;
  const fitH = Math.max(1, vp.height - 2 * padding) / box.height;
  switch (spec.mode) {
    case ZoomMode.FitWidth:
      return clamp(fitW, ZOOM_MIN, ZOOM_MAX);
    case ZoomMode.FitPage:
    case ZoomMode.FitAll: // same fit math; the caller passes the whole-scene box
      return clamp(Math.min(fitW, fitH), ZOOM_MIN, ZOOM_MAX);
    case ZoomMode.Automatic:
    default:
      // fit width, but never upscale past 100% (Adobe's "Automatic"). Height-
      // independent: a portrait page fills the width and you scroll within it.
      return clamp(Math.min(fitW, 1), ZOOM_MIN, ZOOM_MAX);
  }
}

// ── Anchor — a page-relative point, the durable "what am I looking at". The world
//    point under a screen position is meaningless across a re-layout (pages move);
//    the page-point survives. Point-generalized: Which viewport point the anchor
//    lives at is the caller's policy (anchorAlign for reframes, zoomAlign for
//    zoom-intent changes); the wrappers default to the classic center. ──────────
/** The anchor at an arbitrary world point: its nearest page + the point, page-relative. */
export function anchorAtPoint(scene: Scene, worldPt: Point): Anchor {
  const item = scene.nearestItem(worldPt);
  let page = item.pages[0];
  let best = Infinity;
  for (const candidate of item.pages) {
    const distance = Math.abs(candidate.x + candidate.width / 2 - worldPt.x);
    if (distance < best) {
      best = distance;
      page = candidate;
    }
  }
  return {
    pageIndex: page.pageIndex,
    fx: (worldPt.x - page.x) / page.width,
    fy: (worldPt.y - page.y) / page.height,
  };
}

/** The camera that puts the anchor's world point at a given screen point. */
export function cameraForAnchorAtScreen(
  anchor: Anchor,
  scene: Scene,
  screenPt: Point,
  zoom: number,
): Camera {
  const item = scene.items[scene.itemOfPage(anchor.pageIndex)];
  let page = item.pages[0];
  for (const candidate of item.pages)
    if (candidate.pageIndex === anchor.pageIndex) page = candidate;
  const world = { x: page.x + anchor.fx * page.width, y: page.y + anchor.fy * page.height };
  return { zoom, x: world.x - screenPt.x / zoom, y: world.y - screenPt.y / zoom };
}

/** The anchor under a viewport point — `at` is the policy point (anchorAlign /
 *  zoomAlign resolved to px); it defaults to the classic viewport center. */
export function anchorFromCamera(cam: Camera, scene: Scene, vp: Size, at?: Point): Anchor {
  return anchorAtPoint(scene, toWorld(cam, at ?? { x: vp.width / 2, y: vp.height / 2 }));
}
/** The camera that restores an anchor to the same viewport point it was
 *  captured at — capture and restore must agree on `at` for exact round-trips. */
export function cameraFromAnchor(
  anchor: Anchor,
  scene: Scene,
  vp: Size,
  zoom: number,
  at?: Point,
): Camera {
  return cameraForAnchorAtScreen(anchor, scene, at ?? { x: vp.width / 2, y: vp.height / 2 }, zoom);
}

// ── Spatial-index helpers ──────────────────────────────────────────────────────
function lowerBound(arr: number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function upperBound(arr: number[], value: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
const OVERSCAN = 2;

/**
 * Reserved chrome space around each page — the `PageFrame` primitive (world
 * units in this pure layer; the shell derives them from screen px). The frame
 * belongs to pages, not items — in a spread every page keeps its own flanks,
 * so left/right chrome works everywhere.
 */

interface LocalBox {
  pageIndex: number;
  lx: number;
  ly: number;
  w: number;
  h: number;
  rotation: PageRotation;
  /** The page's `/UserUnit` — folded into its `contentScale` at placement, so
   *  "world units per content point" stays true for every page of a spread. */
  userUnit: number;
}

/** Intrinsic item dimensions (pages only, no margins) — the `uniform` reference.
 *  Uses display dims, so `uniform` equalizes the rotated footprint and a rotated
 *  page sizes to match its neighbours as it actually appears. */
function measureItem(
  pages: readonly PageGeom[],
  group: number[],
  gap: number,
): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (let j = 0; j < group.length; j++) {
    const size = displayDims(pages[group[j]]);
    width += size.width + (j > 0 ? gap : 0);
    if (size.height > height) height = size.height;
  }
  return { width, height };
}

/**
 * Pack one item from scaled pages plus constant per-page margins. The page boxes
 * (and the spread's inner gap) scale with the sizing factor; the margins do not —
 * they are screen-px-derived chrome bands and stay constant in world space.
 */
function packScaledItem(
  pages: readonly PageGeom[],
  group: number[],
  scale: number,
  gap: number,
  frame: PageFrame,
  direction: Direction,
): { local: LocalBox[]; width: number; height: number } {
  let maxH = 0;
  for (let j = 0; j < group.length; j++)
    maxH = Math.max(maxH, displayDims(pages[group[j]]).height * scale);
  const local: LocalBox[] = [];
  let lx = 0;
  for (let j = 0; j < group.length; j++) {
    const size = displayDims(pages[group[j]]);
    const scaledWidth = size.width * scale;
    const scaledHeight = size.height * scale;
    local.push({
      pageIndex: group[j],
      lx: lx + frame.left,
      ly: frame.top + (maxH - scaledHeight) / 2, // page centers within the inner band
      w: scaledWidth,
      h: scaledHeight,
      rotation: pages[group[j]].rotation ?? 0,
      userUnit: pages[group[j]].userUnit ?? 1,
    });
    lx += frame.left + scaledWidth + frame.right + gap * scale;
  }
  const width = Math.max(0, lx - gap * scale);
  const height = frame.top + maxH + frame.bottom;
  if (direction === 'rtl') {
    // reading-first page takes the rightmost slot (the spread binds on the right);
    // slots mirror, but each page keeps its physical margins (left room stays left)
    for (const box of local) box.lx = width - box.lx - box.w + (frame.left - frame.right);
  }
  return { local, width, height };
}

function placePages(item: SceneItem, local: LocalBox[], contentScale: number): PageBox[] {
  return local.map((box) => ({
    pageIndex: box.pageIndex,
    x: item.x + box.lx,
    y: item.y + box.ly,
    width: box.w,
    height: box.h,
    rotation: box.rotation,
    // Per page, not per item: the box was measured at `size × userUnit`, so
    // the world-per-content-point factor must carry the same userUnit — every
    // content→world mapping downstream divides/multiplies by exactly this.
    contentScale: contentScale * box.userUnit,
  }));
}

/** Per-item world scale = sizing factor (1 intrinsic, else cross-equalize for
 *  uniform) × `viewUnitsPerPoint` (the platform's points→view-px factor). The
 *  result becomes the page's `contentScale`, so world units are view px and 100%
 *  is physically accurate. `viewUnitsPerPoint` defaults to 1 (neutral). */
const itemScale = (
  crossIntrinsic: number,
  refCross: number,
  sizing: SizingMode,
  viewUnitsPerPoint = 1,
): number =>
  (sizing === 'uniform' && crossIntrinsic > 0 ? refCross / crossIntrinsic : 1) * viewUnitsPerPoint;

// ── Layout strategies ─────────────────────────────────────────────────────────
export interface LinearOptions {
  gap?: number;
  axis?: 'x' | 'y';
  align?: 'center' | 'start';
  sizing?: SizingMode;
  direction?: Direction;
  /** Reserved chrome space around each page (world units; constant, never scaled). */
  pageFrame?: PageFrame;
  /** Points→view-px factor folded into each page's scale (default 1). */
  viewUnitsPerPoint?: number;
}
export function linearLayout(
  pages: readonly PageGeom[],
  grouping: number[][],
  options: LinearOptions = {},
): Scene {
  const gap = options.gap ?? 16;
  const vertical = (options.axis ?? 'y') === 'y';
  const align = options.align ?? 'center';
  const sizing = options.sizing ?? 'intrinsic';
  const direction = options.direction ?? 'ltr';
  // RTL mirrors the main axis only when it's horizontal; vertical scroll is
  // direction-agnostic (RTL books still scroll down) — only spreads swap.
  const mirrored = !vertical && direction === 'rtl';

  const frame = options.pageFrame ?? NO_FRAME;

  // Pass 1: measure every item at intrinsic page size (no margins) — the cross axis
  // (width when vertical) gives the reference for `uniform` sizing, so uniform
  // equalizes the pages themselves; constant margins then keep outer edges flush.
  const measures = grouping.map((group) => measureItem(pages, group, gap));
  const crossOf = (measure: { width: number; height: number }) =>
    vertical ? measure.width : measure.height;
  const refCross = measures.reduce((largest, measure) => Math.max(largest, crossOf(measure)), 0);

  // Pass 2: pack each item from scaled pages + constant margins, lay along the axis.
  const items: SceneItem[] = new Array(grouping.length);
  const locals: LocalBox[][] = new Array(grouping.length);
  const scales: number[] = new Array(grouping.length);
  let main = 0;
  let crossMax = 0;
  let maxW = 0;
  let maxH = 0;

  for (let i = 0; i < grouping.length; i++) {
    const scale = itemScale(crossOf(measures[i]), refCross, sizing, options.viewUnitsPerPoint);
    const packed = packScaledItem(pages, grouping[i], scale, gap, frame, direction);
    const { width, height } = packed;
    scales[i] = scale;
    locals[i] = packed.local;
    const it: SceneItem = {
      index: i,
      x: 0,
      y: 0,
      width,
      height,
      pageIndexes: grouping[i],
      pages: [],
    };
    if (vertical) {
      it.y = main;
      main += height + gap;
    } else {
      it.x = main;
      main += width + gap;
    }
    crossMax = Math.max(crossMax, vertical ? width : height);
    maxW = Math.max(maxW, width);
    maxH = Math.max(maxH, height);
    items[i] = it;
  }

  const sceneMain = Math.max(0, main - gap);
  const size: Size = vertical
    ? { width: crossMax, height: sceneMain }
    : { width: sceneMain, height: crossMax };

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (mirrored) it.x = size.width - it.x - it.width; // reading order advances leftward
    if (vertical) it.x = align === 'center' ? (size.width - it.width) / 2 : 0;
    else it.y = align === 'center' ? (size.height - it.height) / 2 : 0;
    it.pages = placePages(it, locals[i], scales[i]);
  }

  // Spatial index in position order (ascending coordinates for binary search).
  // In a mirrored layout position order is reverse index order — `posIdx` maps back.
  const posIdx = (position: number): number => (mirrored ? items.length - 1 - position : position);
  const starts = items.map((_, position) => {
    const it = items[posIdx(position)];
    return vertical ? it.y : it.x;
  });
  const ends = items.map((_, position) => {
    const it = items[posIdx(position)];
    return vertical ? it.y + it.height : it.x + it.width;
  });
  const firstPage = items.map((it) => it.pageIndexes[0]);

  return {
    size,
    items,
    itemCount: items.length,
    axis: vertical ? 'y' : 'x',
    maxItemSize: { width: maxW, height: maxH },
    query(rect) {
      const a0 = vertical ? rect.y : rect.x;
      const a1 = vertical ? rect.y + rect.height : rect.x + rect.width;
      const lo = Math.max(0, lowerBound(ends, a0) - OVERSCAN);
      const hi = Math.min(items.length, upperBound(starts, a1) + OVERSCAN);
      const out: SceneItem[] = [];
      for (let position = lo; position < hi; position++) out.push(items[posIdx(position)]);
      return out;
    },
    nearestItem(pt) {
      const position = clamp(upperBound(starts, vertical ? pt.y : pt.x) - 1, 0, items.length - 1);
      return items[posIdx(position)];
    },
    itemOfPage(pi) {
      return clamp(upperBound(firstPage, pi) - 1, 0, items.length - 1);
    },
  };
}

export interface GridOptions {
  gap?: number;
  columns?: number;
  /**
   * Wrapped mode: instead of declaring `columns`, give the available line width
   * (world units) and the grid derives how many cells fit — the responsive
   * thumbnail-sidebar behavior. Takes precedence over `columns`.
   */
  lineWidth?: number;
  sizing?: SizingMode;
  direction?: Direction;
  /** Reserved chrome space around each page (world units; constant, never scaled). */
  pageFrame?: PageFrame;
  /** Points→view-px factor folded into each page's scale (default 1). */
  viewUnitsPerPoint?: number;
}
export function gridLayout(
  pages: readonly PageGeom[],
  grouping: number[][],
  options: GridOptions = {},
): Scene {
  const gap = options.gap ?? 48;
  const itemCount = grouping.length;
  const sizing = options.sizing ?? 'intrinsic';
  const direction = options.direction ?? 'ltr';

  const frame = options.pageFrame ?? NO_FRAME;

  // Pass 1: measure at intrinsic page size; the widest item is the `uniform` reference.
  const measures = grouping.map((group) => measureItem(pages, group, gap));
  const refW = measures.reduce((widest, measure) => Math.max(widest, measure.width), 0);

  // Pass 2: pack each item from scaled pages + constant margins (uniform → equal
  // page widths; equal margins keep the outer boxes equal too, so columns line up).
  const locals: LocalBox[][] = new Array(itemCount);
  const sizes: Array<{ width: number; height: number }> = new Array(itemCount);
  const scales: number[] = new Array(itemCount);
  let cellW = 1;
  let cellH = 1;
  for (let i = 0; i < itemCount; i++) {
    const scale = itemScale(measures[i].width, refW, sizing, options.viewUnitsPerPoint);
    const packed = packScaledItem(pages, grouping[i], scale, gap, frame, direction);
    scales[i] = scale;
    locals[i] = packed.local;
    sizes[i] = { width: packed.width, height: packed.height };
    cellW = Math.max(cellW, sizes[i].width);
    cellH = Math.max(cellH, sizes[i].height);
  }

  // Column count — declared, or derived from the available line width (wrapped):
  // how many cells fit the line. Computed here because it needs cellW. Clamped to
  // the item count so a short document doesn't occupy (or mirror across) a wider
  // line than it fills.
  const wanted =
    options.lineWidth !== undefined
      ? Math.floor((options.lineWidth + gap) / (cellW + gap))
      : (options.columns ?? Math.ceil(Math.sqrt(itemCount)));
  const columns = Math.max(1, Math.min(wanted, Math.max(1, itemCount)));
  // RTL fills each row right→left (like RTL text wrap); rows stay top→bottom.
  const colAt = (col: number): number => (direction === 'rtl' ? columns - 1 - col : col);

  // Rows are as tall as their tallest item — a wrapped grid is text-wrap for pages,
  // and a wrapped line is as tall as its own tallest glyph, not the document's
  // tallest. (A single global cell height left short pages floating in huge voids
  // with mixed page sizes.) Columns keep a uniform width: that's what makes a
  // column grid a grid — and `sizing: 'uniform'` removes the horizontal voids.
  const stepX = cellW + gap;
  const rows = Math.max(1, Math.ceil(itemCount / columns));
  const rowHeight: number[] = new Array(rows).fill(1);
  for (let i = 0; i < itemCount; i++) {
    const row = Math.floor(i / columns);
    rowHeight[row] = Math.max(rowHeight[row], sizes[i].height);
  }
  const rowTop: number[] = new Array(rows);
  let yCursor = 0;
  for (let row = 0; row < rows; row++) {
    rowTop[row] = yCursor;
    yCursor += rowHeight[row] + gap;
  }
  const rowEnd = rowTop.map((top, row) => top + rowHeight[row]);

  const items: SceneItem[] = new Array(itemCount);
  for (let i = 0; i < itemCount; i++) {
    const col = colAt(i % columns);
    const row = Math.floor(i / columns);
    const it: SceneItem = {
      index: i,
      x: col * stepX + (cellW - sizes[i].width) / 2,
      y: rowTop[row] + (rowHeight[row] - sizes[i].height) / 2,
      width: sizes[i].width,
      height: sizes[i].height,
      pageIndexes: grouping[i],
      pages: [],
    };
    it.pages = placePages(it, locals[i], scales[i]);
    items[i] = it;
  }

  const size: Size = { width: columns * stepX - gap, height: Math.max(1, yCursor - gap) };
  const firstPage = items.map((it) => it.pageIndexes[0]);

  return {
    size,
    items,
    itemCount,
    axis: 'grid',
    maxItemSize: { width: cellW, height: cellH },
    query(rect) {
      const c0 = Math.max(0, Math.floor(rect.x / stepX));
      const c1 = Math.min(columns - 1, Math.floor((rect.x + rect.width) / stepX));
      // rows by binary search over the prefix-summed row extents (O(log rows))
      const r0 = Math.max(0, lowerBound(rowEnd, rect.y));
      const r1 = Math.min(rows - 1, upperBound(rowTop, rect.y + rect.height) - 1);
      const out: SceneItem[] = [];
      for (let row = r0; row <= r1; row++)
        for (let col = c0; col <= c1; col++) {
          // colAt is its own inverse: spatial column → reading-order column
          const index = row * columns + colAt(col);
          if (index < itemCount) out.push(items[index]);
        }
      return out;
    },
    nearestItem(pt) {
      const col = clamp(Math.floor(pt.x / stepX), 0, columns - 1);
      const row = clamp(upperBound(rowTop, pt.y) - 1, 0, rows - 1);
      return items[clamp(row * columns + colAt(col), 0, itemCount - 1)];
    },
    itemOfPage(pi) {
      return clamp(upperBound(firstPage, pi) - 1, 0, itemCount - 1);
    },
  };
}

/** Spread grouping — a pure input to layout (all `plugin-spread` needs to be). */
export function groupPages(pageCount: number, mode: SpreadMode = 'none'): number[][] {
  const out: number[][] = [];
  if (mode === 'none') {
    for (let i = 0; i < pageCount; i++) out.push([i]);
    return out;
  }
  let i = 0;
  if (mode === 'even' && pageCount > 0) out.push([i++]);
  for (; i < pageCount; i += 2) out.push(i + 1 < pageCount ? [i, i + 1] : [i]);
  return out;
}
