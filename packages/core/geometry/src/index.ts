/**
 * @embedpdf/core-geometry — the viewer's pure 2D coordinate primitives.
 *
 * The bottom of the pyramid: stage-core (layout), plugin-stage (`pageToWorld`),
 * and every framework adapter (`toPagePoint` hit-testing) all sit on these.
 * Zero dependencies, DOM-free, serializable — Rust-portable.
 *
 * The page-rotation transforms are the reason this package exists: the same
 * quarter-turn maps content↔box in BOTH directions, and that one rule must not
 * be hand-written (and drift, or be bug-fixed in only one of four adapters).
 */

export interface Point {
  x: number;
  y: number;
}
export interface Size {
  width: number;
  height: number;
}
/** Viewer-side rect: top-left origin, y-down (view/page-point convention — NOT the
 *  engine's bottom-left PDF rect). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The bounding box of a set of rects (null for the empty set). Space-
 * agnostic: works on any y-down `{x,y,width,height}` rects — search hit
 * bounds, selection line-merge unions, multi-quad annotation extents.
 */
export function boundsOfRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.width);
    y2 = Math.max(y2, r.y + r.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/**
 * Intersection of two y-down rects — zero-sized (width/height 0, origin at
 * the would-be corner) when disjoint, so callers can test `width > 0`
 * without a null branch. Space-agnostic like {@link boundsOfRects}: view-px
 * viewport ∩ footprint, page-point visibility ∩ tile footprints, ….
 */
export function intersectRects(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

/**
 * Quarter-turn display rotation, degrees clockwise. The viewer-side notion of a
 * page's on-screen rotation — the TOTAL = (document /Rotate + any view
 * rotation), resolved by the shell. Structurally identical to the engine's
 * `PageRotation`, so the two interoperate without this package depending on the
 * engine.
 */
export type PageRotation = 0 | 90 | 180 | 270;

/**
 * Reserved chrome real estate around a page, one thickness per side (screen px
 * in the shell; world units in the pure layout). The page content sits inset
 * by these; the bands hold box-space chrome (labels, buttons, rails) that does
 * not rotate. The layout reserves the matching space so nothing overlaps.
 */
export interface PageFrame {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
export const NO_FRAME: PageFrame = { top: 0, right: 0, bottom: 0, left: 0 };

/** True for the quarter-turns that swap a page's width and height. */
export function isQuarterTurn(rotation: PageRotation): boolean {
  return rotation === 90 || rotation === 270;
}

/**
 * Compose two quarter-turn rotations (mod 360). THE way the shell resolves a
 * page's TOTAL display rotation — `addRotations(page /Rotate, view rotation)`
 * — so the wrap arithmetic is never hand-written (and drift) per call site.
 */
export function addRotations(a: PageRotation, b: PageRotation): PageRotation {
  return ((a + b) % 360) as PageRotation;
}

/**
 * Snap a view-px value to the device pixel grid: round to a whole device pixel,
 * back to view px. Used for a page's screen POSITION so a CSS-rotated page lands
 * on the grid (no sub-pixel anti-aliased fringe). The shell never hand-rounds.
 */
export function snapToDevice(value: number, dpr: number): number {
  return Math.round(value * dpr) / dpr;
}

/** A page's on-screen footprint: width and height swapped for quarter-turns. */
export function displaySize(content: Size, rotation: PageRotation): Size {
  return isQuarterTurn(rotation)
    ? { width: content.height, height: content.width }
    : { width: content.width, height: content.height };
}

/**
 * The engine's `kind:'width'` height rule, replicated EXACTLY so the viewer can
 * predict the rendered bitmap's height up front — the page box is sized to it,
 * so the box matches the bitmap with no reflow and no 1px seam.
 *
 * Mirrors `PageRenderReader.resolveDeviceSize` (engine-services): we render the
 * page UN-rotated (CSS applies the rotation), so there is no width/height swap
 * here — `pageSize` is the page's own points. MUST stay in lockstep with that
 * function; the round-trip test in the render plugin asserts they agree.
 */
export function deviceHeightForWidth(pageSize: Size, deviceWidth: number): number {
  return Math.max(1, Math.round((deviceWidth * pageSize.height) / pageSize.width));
}

/**
 * The single per-page bridge between the viewer's three coordinate spaces. NB:
 * these are all VIEWER spaces — top-left origin, y-down. They are NOT the
 * engine's PDF user space (`Pdf*`, bottom-left origin, y-up); the engine→content
 * hop (the y-flip + crop offset) is a separate matrix (`pageGeometry`).
 *
 *   content space  page-local points, top-left, y-down — un-rotated page frame
 *   view space     platform logical px (web: CSS px) — layout, DOM, pointer events
 *   device space   physical pixels — the rendered bitmap
 *
 * PAGE-LOCAL by design: it knows this page's own box, NOT where the page sits in
 * the scene. Placement (camera/layout) stays on `VisiblePage.{x,y}` and positions
 * the page container; the transform converts everything INSIDE that container. So
 * it is camera/pan-invariant — it only changes on zoom / rotation / contentScale
 * / dpr, which makes it cheap to memoize.
 *
 * Every plugin and framework adapter consumes THIS — never `x * scale`, never
 * `pageToWorld()∘toScreen()`, never `* dpr`. New plugins (annotations, search,
 * forms) do no coordinate math; new platforms (iOS/Android) inject a different
 * `scale` and reuse all of it.
 */
export interface PageTransform {
  /**
   * The page's TOTAL display rotation (document /Rotate + any view rotation) —
   * the same value the transform's matrices were built from, exposed so
   * consumers that need the quarter-turn itself (an upright-placement rule, a
   * pointer sample) read it HERE instead of re-deriving it from the matrix.
   */
  readonly rotation: PageRotation;
  /** Display footprint in VIEW px (device-snapped) — the page container's size.
   *  Width↔height already swapped for quarter-turns. */
  readonly viewWidth: number;
  readonly viewHeight: number;
  /** The UN-rotated content box in VIEW px — the size of the wrapper the bitmap
   *  and content-space overlays live in (before the wrapper's CSS rotation). */
  readonly contentWidth: number;
  readonly contentHeight: number;
  /** Render the (un-rotated) bitmap at EXACTLY this — `viewport: {kind:'width', width: deviceWidth}`.
   *  Integer device px; `deviceHeight` is the engine's exact derived height. */
  readonly deviceWidth: number;
  readonly deviceHeight: number;
  /** Device px per PDF point (uniform). */
  readonly renderScale: number;
  /** VIEW px per PDF point (uniform, device-snapped) — the one factor for
   *  screen-constant chrome: content units = CSS px ÷ `viewScale`. */
  readonly viewScale: number;
  /**
   * View px per PDF point at 100% ZOOM — the page's physical baseline:
   * `viewUnitsPerPoint × userUnit` (web: 96/72 × `/UserUnit`, so 100% maps to
   * inches on screen, Acrobat-style). What "100%" MEANS for this page.
   */
  readonly baseScale: number;
  /**
   * The page's zoom RELATIVE to its 100% baseline (`viewScale / baseScale`,
   * dimensionless; exactly 1 at 100% for any `userUnit`). THE number
   * zoom-relative policies consume — e.g. the `/F` NoZoom exemption clamps
   * its body to `zoom ≤ 1`. Distinct from `viewScale` (a units conversion).
   */
  readonly zoom: number;
  /** Content point → UN-rotated content view px. For overlays INSIDE the rotated
   *  content wrapper (markers, annotations) — they ride the wrapper's rotation,
   *  so they place in content space and only scale here. */
  pageToContent(p: Point): Point;
  /** Content point → page-local view px in the DISPLAY box (rotation applied). For
   *  footprint-space layers (outside the wrapper). */
  pageToView(p: Point): Point;
  /** Content rect → its axis-aligned view-px rect (exact for quarter-turns). */
  pageToViewRect(r: Rect): Rect;
  /** Inverse — display-box view px (box-local) → content point. Hit-testing. */
  viewToPage(p: Point): Point;
  /** Inverse of {@link pageToViewRect}: display-box view-px rect → its content
   *  AABB (exact for quarter-turns). The visibility primitive — projecting a
   *  viewport rect into page points is THIS, never per-adapter corner math. */
  viewToPageRect(r: Rect): Rect;
  /** CSS `matrix()` mapping content space → this page's display box. Drop it on
   *  a footprint-space layer (`transform`, `transform-origin: 0 0`) and place
   *  children in content points — rotation + scale handled for free. */
  readonly cssMatrix: string;
}

/**
 * Build a page's transform from its intrinsic size + the platform/view scale.
 * `scale` is VIEW px per PDF point (the shell composes it: `viewUnitsPerPoint ×
 * contentScale × zoom`); `dpr` is device px per view px. Device dimensions snap
 * to the grid (crisp, no rotation fringe) and follow the engine's width rule
 * (box == bitmap, no reflow).
 */
export function pageTransform(input: {
  /** Un-rotated page size in PDF points. */
  pageSize: Size;
  rotation: PageRotation;
  /** View px per PDF point = viewUnitsPerPoint × contentScale × zoom. */
  scale: number;
  /**
   * View px per PDF point at 100% zoom (`viewUnitsPerPoint × userUnit`) — the
   * page's physical baseline, so `zoom = viewScale / baseScale` reads as
   * "percent of Acrobat's 100%". Default = `scale`, i.e. zoom ≈ 1: headless /
   * standalone callers stay neutral unless they declare a baseline.
   */
  baseScale?: number;
  /** Device px per view px (web: devicePixelRatio). */
  dpr: number;
}): PageTransform {
  const { pageSize, rotation, scale, dpr } = input;

  // Raster: pin the width (snapped to the device grid), derive the height with
  // the engine's exact rule → uniform scale, integer device px, box == bitmap.
  const deviceWidth = Math.max(1, Math.round(pageSize.width * scale * dpr));
  const deviceHeight = deviceHeightForWidth(pageSize, deviceWidth);
  const renderScale = deviceWidth / pageSize.width;

  // The un-rotated content box in VIEW px, taken from the snapped device dims so
  // every edge lands on a whole device pixel. The effective view scale is derived
  // from it (not the raw `scale`) so `pageToView(pageWidth) === content edge`.
  const content: Size = { width: deviceWidth / dpr, height: deviceHeight / dpr };
  const viewScale = content.width / pageSize.width;
  const baseScale = input.baseScale ?? scale;
  const zoom = baseScale > 0 ? viewScale / baseScale : 1;

  const footprint = displaySize(content, rotation);

  // The two affines this page needs, as Mat2D — the matrix is the source of
  // truth; the methods and `cssMatrix` below are sugar over it (so they can
  // never drift).
  // content point (top-left, y-down) → content view px: pure isotropic scale.
  const contentMat = [viewScale, 0, 0, viewScale, 0, 0] as Mat2D;
  // content point → display-box view px: scale + the page's quarter-turn, from
  // the shared builder (the one quarter-turn encoding).
  const viewMat = rotateScaleMatrix(viewScale, content.width, content.height, rotation);
  const invMat = invert(viewMat);

  const pageToContent = (p: Point): Point => applyPoint(contentMat, p);
  const pageToView = (p: Point): Point => applyPoint(viewMat, p);
  const viewToPage = (p: Point): Point => applyPoint(invMat, p);
  const pageToViewRect = (r: Rect): Rect => applyRect(viewMat, r);
  const viewToPageRect = (r: Rect): Rect => applyRect(invMat, r);
  const cssMatrix = matrixToCss(viewMat);

  return {
    rotation,
    viewWidth: footprint.width,
    viewHeight: footprint.height,
    contentWidth: content.width,
    contentHeight: content.height,
    deviceWidth,
    deviceHeight,
    renderScale,
    viewScale,
    baseScale,
    zoom,
    pageToContent,
    pageToView,
    pageToViewRect,
    viewToPage,
    viewToPageRect,
    cssMatrix,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Matrix-native geometry — the composable primitive under every space hop.
 *
 * A coordinate-space conversion is a 2D affine `Mat2D = [a,b,c,d,e,f]` (the same
 * six numbers as CSS `matrix()`, `CGAffineTransform`, and Android `Matrix`):
 *
 *     x' = a·x + c·y + e
 *     y' = b·x + d·y + f
 *
 * Three generic appliers + `compose` + `invert` are the ENTIRE runtime — they
 * never grow as spaces/shapes/directions multiply, and they port 1:1 to Rust /
 * Swift / Kotlin (every target has a native affine). Inverses (hit-testing) and
 * screen composition fall out for free; there is no per-space hand-rolled y-flip
 * to drift between adapters.
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The coordinate spaces a viewer touches. `pdf` is the engine's PDF user space
 * (y-up, origin at the crop box bottom-left); the rest are viewer-local, y-down.
 */
export type Space = 'pdf' | 'content' | 'view' | 'screen';

/**
 * Phantom space brand. It is OPTIONAL so plain `{ x, y }` / `{ x, y, w, h }`
 * literals stay assignable day-to-day (terse), but a value EXPLICITLY tagged
 * with the wrong space is rejected — and `Mat2D<From, To>` enforces the hop at
 * the matrix, so you cannot `applyRect` a `pdf` rect with a `content→view`
 * matrix. The brand is type-only; it carries no runtime field.
 */
interface SpaceBrand<S extends Space> {
  readonly __space?: S;
}

/** A point tagged with its coordinate space. */
export type PointIn<S extends Space> = Point & SpaceBrand<S>;
/**
 * An axis-aligned rect tagged with its space, as min-corner + positive extent:
 * `(x, y)` is the corner with the smallest coordinates and `(x+width, y+height)`
 * the largest. In `pdf` space (y-up) that corner is bottom-left (`x=left`,
 * `y=bottom`); in the y-down viewer spaces it is top-left.
 */
export type RectIn<S extends Space> = Rect & SpaceBrand<S>;

/**
 * Four POSITIONAL points (no corner semantics) — the viewer twin of the engine's
 * `PdfQuad`. Use this (via {@link applyQuad}) for rotatable/skewed content where
 * an axis-aligned rect would lie.
 */
export interface Quad {
  p1: Point;
  p2: Point;
  p3: Point;
  p4: Point;
}
/** A quad tagged with its coordinate space. */
export type QuadIn<S extends Space> = Quad & SpaceBrand<S>;

/**
 * A 2D affine transform from space `From` to space `To`, stored as the six
 * numbers `[a, b, c, d, e, f]`. The phantom `From`/`To` make the compiler track
 * which spaces a matrix bridges, so composition and application can only be
 * wired up in the one correct order.
 */
export type Mat2D<From extends Space = Space, To extends Space = Space> = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
] & {
  readonly __from?: From;
  readonly __to?: To;
};

/** The identity transform within a single space. */
export function identity<S extends Space>(): Mat2D<S, S> {
  return [1, 0, 0, 1, 0, 0] as Mat2D<S, S>;
}

/**
 * Compose two matrices: `compose(m, n)` applies `n` first, then `m` (matrix
 * product `m · n`). The shared middle space `B` must line up, so the type system
 * rejects composing mismatched hops.
 */
export function compose<A extends Space, B extends Space, C extends Space>(
  m: Mat2D<B, C>,
  n: Mat2D<A, B>,
): Mat2D<A, C> {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ] as Mat2D<A, C>;
}

/** Invert a transform — `invert(pdfToView)` is `viewToPdf`, i.e. hit-testing for free. */
export function invert<F extends Space, T extends Space>(m: Mat2D<F, T>): Mat2D<T, F> {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (det === 0) throw new Error('Mat2D.invert: non-invertible matrix (det = 0)');
  const ia = d / det;
  const ib = -b / det;
  const ic = -c / det;
  const id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)] as Mat2D<T, F>;
}

/** Apply a transform to a point. */
export function applyPoint<F extends Space, T extends Space>(
  m: Mat2D<F, T>,
  p: PointIn<F>,
): PointIn<T> {
  const [a, b, c, d, e, f] = m;
  return { x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f } as PointIn<T>;
}

/**
 * Apply a transform to a rect, returning the axis-aligned bounding box of the
 * four transformed corners. EXACT for translate/scale/quarter-turn (every page
 * transform `pageGeometry` produces); lossy under skew — use {@link applyQuad}
 * for content that can be rotated off-axis.
 */
export function applyRect<F extends Space, T extends Space>(
  m: Mat2D<F, T>,
  r: RectIn<F>,
): RectIn<T> {
  const c0 = applyPoint(m, { x: r.x, y: r.y } as PointIn<F>);
  const c1 = applyPoint(m, { x: r.x + r.width, y: r.y } as PointIn<F>);
  const c2 = applyPoint(m, { x: r.x, y: r.y + r.height } as PointIn<F>);
  const c3 = applyPoint(m, { x: r.x + r.width, y: r.y + r.height } as PointIn<F>);
  const xs = [c0.x, c1.x, c2.x, c3.x];
  const ys = [c0.y, c1.y, c2.y, c3.y];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  } as RectIn<T>;
}

/** Apply a transform to a quad, preserving orientation (maps the four points). */
export function applyQuad<F extends Space, T extends Space>(
  m: Mat2D<F, T>,
  q: QuadIn<F>,
): QuadIn<T> {
  return {
    p1: applyPoint(m, q.p1 as PointIn<F>),
    p2: applyPoint(m, q.p2 as PointIn<F>),
    p3: applyPoint(m, q.p3 as PointIn<F>),
    p4: applyPoint(m, q.p4 as PointIn<F>),
  } as QuadIn<T>;
}

/**
 * A `Mat2D` IS a CSS `matrix()` — the six numbers are identical. Drop the result
 * on a footprint-space layer (`transform`, `transform-origin: 0 0`) and place
 * children in the source space; the rotation + scale are handled for free.
 */
export function matrixToCss(m: Mat2D): string {
  const [a, b, c, d, e, f] = m;
  return `matrix(${a}, ${b}, ${c}, ${d}, ${e}, ${f})`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Same-space affine builders — generic, free-angle transforms WITHIN one space
 * (`Mat2D<S, S>`). The `rotateScaleMatrix` above is a quarter-turn, cross-space
 * builder for page layout; these are the arbitrary-angle primitives content
 * editing (annotation rotation/scale, future stamps/skew) composes from. They
 * never know about annotations — they are the bottom-of-the-pyramid matrix math,
 * so it isn't hand-rolled (and drift) in every plugin.
 *
 * Convention: a viewer content space is y-DOWN, so `rotate(rad)` —
 * `[cos, sin, -sin, cos, 0, 0]` — turns CLOCKWISE on screen (matching the
 * viewer's page-rotation direction). The PDF (y-up) flip, when one is needed,
 * is a separate hop applied once at the engine boundary.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Translate within a space. */
export function translate<S extends Space>(tx: number, ty: number): Mat2D<S, S> {
  return [1, 0, 0, 1, tx, ty] as Mat2D<S, S>;
}

/** Scale about the space origin. */
export function scale<S extends Space>(sx: number, sy: number): Mat2D<S, S> {
  return [sx, 0, 0, sy, 0, 0] as Mat2D<S, S>;
}

/** Rotate about the space origin (radians; clockwise in y-down content space). */
export function rotate<S extends Space>(rad: number): Mat2D<S, S> {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [c, s, -s, c, 0, 0] as Mat2D<S, S>;
}

/** Rotate about an arbitrary pivot: `T(c) · R(rad) · T(-c)`. */
export function rotateAbout<S extends Space>(c: PointIn<S>, rad: number): Mat2D<S, S> {
  return compose(translate<S>(c.x, c.y), compose(rotate<S>(rad), translate<S>(-c.x, -c.y)));
}

/** Scale about an arbitrary anchor: `T(a) · S(sx, sy) · T(-a)`. */
export function scaleAbout<S extends Space>(a: PointIn<S>, sx: number, sy: number): Mat2D<S, S> {
  return compose(translate<S>(a.x, a.y), compose(scale<S>(sx, sy), translate<S>(-a.x, -a.y)));
}

/** The rotation angle (radians) encoded in a matrix — `atan2(b, a)`. Positive is
 *  clockwise in y-down content space (the inverse of {@link rotate}). */
export function angleOf(m: Mat2D): number {
  return Math.atan2(m[1], m[0]);
}

/**
 * The page's scale + integer quarter-turn as a `Mat2D`: a content point maps to
 * its place in the rotated DISPLAY box. `scale` is output units per content
 * point; `boxW`/`boxH` are the UN-rotated content's extents in those same output
 * units, and the offsets keep the footprint in the box's positive quadrant
 * (origin at the box top-left).
 *
 * THE single encoding of the quarter-turn — `pageTransform` (view px),
 * `pageGeometry` (the `content→view` hop), and `pageToWorld` (world units) all
 * build on this one function, so the rotation can never drift between them.
 */
export function rotateScaleMatrix(
  scale: number,
  boxW: number,
  boxH: number,
  rotation: PageRotation,
): Mat2D {
  switch (rotation) {
    case 90:
      return [0, scale, -scale, 0, boxH, 0] as Mat2D;
    case 180:
      return [-scale, 0, 0, -scale, boxW, boxH] as Mat2D;
    case 270:
      return [0, -scale, scale, 0, 0, boxW] as Mat2D;
    default:
      return [scale, 0, 0, scale, 0, 0] as Mat2D;
  }
}

/**
 * The per-page geometry input. Structurally a subset of the engine's
 * `PageLayout` (so a layout can be passed straight in), but defined here to keep
 * this package dependency-free — the same reason {@link PageRotation} is a
 * structural twin of the engine's rotation.
 */
export interface PageGeometryInput {
  /** Effective crop box in PDF user space (y-up edges); origin preserved, so
   *  `left`/`bottom` may be non-zero or negative. */
  crop: { left: number; bottom: number; right: number; top: number };
  /** Persistent page rotation (the document's `/Rotate`). */
  rotation: PageRotation;
  /** PDF `userUnit` (§14.11.6): scales PDF points into the layout. 1 for most docs. */
  userUnit: number;
}

/** The matrices bridging one page's spaces — every other matrix composes from these. */
export interface PageGeometry {
  /** PDF user space (y-up, crop-relative) → content space (y-down, crop top-left, unscaled points). */
  readonly pdfToContent: Mat2D<'pdf', 'content'>;
  /** Content → view: scale (zoom × userUnit) + the page's quarter-turn rotation. */
  readonly contentToView: Mat2D<'content', 'view'>;
  /** PDF → view, precomposed. */
  readonly pdfToView: Mat2D<'pdf', 'view'>;
  /** View → PDF, the inverse — hit-testing for free. */
  readonly viewToPdf: Mat2D<'view', 'pdf'>;
}

/**
 * PDF user space (y-up, origin = crop bottom-left) → content space (y-down,
 * origin = crop top-left, unscaled points). THE single encoding of the engine→
 * content y-flip + crop offset: `pageGeometry` composes its `pdfToContent` from
 * this, and pure annotation geometry (content-space editing) reuses it too, so
 * the rule can never be hand-written twice and drift.
 */
export function pdfToContentMatrix(crop: { left: number; top: number }): Mat2D<'pdf', 'content'> {
  return [1, 0, 0, -1, -crop.left, crop.top] as Mat2D<'pdf', 'content'>;
}

/**
 * Build a page's space matrices from its crop box, rotation, and `userUnit` plus
 * the viewer `zoom`. This is the ONE function that knows the y-flip, crop origin,
 * `userUnit`, and rotation; everything else composes from its output. The engine
 * never emits these — they bake in viewer state (zoom, later scroll/dpr) — so the
 * boundary stays clean: engine owns `Pdf*` truth, the viewer composes the rest.
 */
export function pageGeometry(input: PageGeometryInput, zoom: number): PageGeometry {
  const { crop, rotation, userUnit } = input;
  const s = zoom * userUnit; // view px per PDF point — userUnit folded in HERE, once

  // PDF user space (y-up, origin = crop bottom-left) → content (y-down, origin = crop top-left).
  const pdfToContent = pdfToContentMatrix(crop);

  // Content → view: scale + integer quarter-turn, from the shared builder (the
  // one quarter-turn encoding). `Wc`/`Hc` are the unrotated content's view-px
  // extents (the builder places the footprint in the box's positive quadrant).
  const Wc = (crop.right - crop.left) * s;
  const Hc = (crop.top - crop.bottom) * s;
  const contentToView = rotateScaleMatrix(s, Wc, Hc, rotation) as Mat2D<'content', 'view'>;

  const pdfToView = compose(contentToView, pdfToContent);
  return { pdfToContent, contentToView, pdfToView, viewToPdf: invert(pdfToView) };
}
