/**
 * Pure page-space geometry for any shape. What one shape does — its bounds,
 * hit test, handles, moves and drawing — its family answers (`shapes/`,
 * found by `familyOf`); these functions ask it. What spans families lives
 * here: the selection outline, the rotate knob, a multi-selection's resize,
 * and upright placement. The engine speaks page space too: the same
 * numbers, nothing to convert.
 */
import { isQuarterTurn, type PageRotation, type Size } from '@embedpdf/core-geometry';
import {
  DEG2RAD,
  MIN_SIZE,
  OPPOSITE_HANDLE,
  RECT_CURSOR,
  RECT_HANDLES,
  type RectHandle,
  normalizeDeg,
  pointInPoly,
  rectCenter,
  rectCornerPoints,
  rectHandlePoint,
  resizeRect,
} from './rect';
import { familyOf } from './shapes';
import type { Shape, Handle, Rect, RenderNode, Point, Stroke } from './types';

/* ── rotation ──────────────────────────────────────────────────────────────
 * Annotation rotation, layered on the generic `@embedpdf/core-geometry` affine
 * primitives (`rotateAbout`). Box kinds carry an unrotated `rect` + a `rot`
 * angle; vertex kinds carry already-rotated points + an advisory `rot`. These
 * helpers know that split and compose the matrix builders — they never hand-roll
 * a rotation matrix. See `Shape` in types.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

/** How far (content units) the rotate knob hangs off the top edge of the box. */
export const ROTATE_KNOB_OFFSET = 24;

/** Fallback chrome geometry (content units) when the caller supplies none —
 *  the pre-settings behavior, so bare-core callers and tests stay stable. */
export const DEFAULT_CHROME_GEOMETRY = {
  handleTol: 6,
  knobTol: 6,
  knobOffset: ROTATE_KNOB_OFFSET,
} as const;

/** A geom's applied rotation (deg), or 0 for text markup. A caret's turn is
 *  its text's baseline tilt: reported here so the renderer and selection
 *  chrome follow it, while the caret's caps (not movable/resizable) keep
 *  every rotate gesture away from it. */
export function geomRotation(geometry: Shape): number {
  return geometry.kind === 'quads' ? 0 : geometry.rotation;
}

/**
 * Where a turn of a single shape pivots, as the engine turns it: a box about
 * its own `rect` centre; a line, polygon, polyline or ink about the middle of
 * the box around its points upright. A turn then changes only the angle, never
 * where the upright points are, and a caption or an arrowhead never moves the
 * pivot.
 */
export const turnPivotOf = (geometry: Shape): Point => familyOf(geometry).pivot(geometry);

/** Does the geometry carry a meaningful `rot` (an oriented local box exists)?
 *  Orientation is a geometry fact; whether the user may rotate is the separate
 *  `caps.rotatable` gate — a caret is oriented (it rides its text's tilt) yet
 *  offers no rotate gesture. */
export const isRotatableGeom = (geometry: Shape): boolean => familyOf(geometry).oriented(geometry);

/**
 * Rotate a geom by `deltaDeg` (clockwise) about `pivot`: a box's middle
 * orbits the pivot and its turn grows, and so does a points shape's. A shape
 * without a rotate verb comes back unchanged: quads, a callout, and the
 * caret (oriented, but it follows its text; `geomResetRotation` still clears
 * its turn).
 */
export function geomRotateAbout(geometry: Shape, pivot: Point, deltaDeg: number): Shape {
  return deltaDeg === 0 ? geometry : familyOf(geometry).rotateAbout(geometry, pivot, deltaDeg);
}

/* ── upright placement (counter-rotating against the display rotation) ────────
 * An `upright` tool commits `rot = -displayRotation` so the annotation reads
 * horizontally on the rotated page. These two helpers are the only placement
 * math that rule needs; both are exact for quarter-turns and pure page-space
 * (they never know about the view).
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The counter-rotation (CW content degrees) that makes an annotation read
 * upright at `displayRotation`: on screen the two compose to 0.
 */
export const uprightRotation = (displayRotation: number): number => normalizeDeg(-displayRotation);

/**
 * The unrotated content rect for a default-size upright box "placed at" a
 * point: positioned so that, after the upright counter-rotation, the box shows
 * `width`×`height` with its top-left at `anchor` in the rotated view — the
 * same on-screen feel as the rotation-0 `{ x: anchor.x, y: anchor.y }` box at
 * every quarter-turn (a click-created free-text box always opens down-right of
 * the cursor as the author sees it). Derived by placing the box in the display
 * frame and pulling its AABB back through the quarter-turn; the page dims
 * cancel, so no page box is needed.
 */
export function uprightAnchoredRect(
  anchor: Point,
  width: number,
  height: number,
  displayRotation: number,
): Rect {
  const rotation = normalizeDeg(displayRotation);
  const point: Point =
    rotation === 90
      ? { x: anchor.x + height / 2, y: anchor.y - width / 2 }
      : rotation === 180
        ? { x: anchor.x - width / 2, y: anchor.y - height / 2 }
        : rotation === 270
          ? { x: anchor.x - height / 2, y: anchor.y + width / 2 }
          : { x: anchor.x + width / 2, y: anchor.y + height / 2 };
  return { x: point.x - width / 2, y: point.y - height / 2, width, height };
}

const clampScalar = (value: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, value));

/**
 * The logical (unrotated) page-space box for a stamp placed at `center`,
 * sized `desired` (points), fit onto the page and clamped fully within it —
 * the rubber-stamp rule: keep the image's own size unless it would overflow
 * the page, then scale down (aspect preserved, never up) so it just fits.
 *
 * Under an upright quarter-turn the on-page footprint is the box transposed
 * (w↔h), so both the fit and the edge clamp use that footprint — a landscape
 * stamp uprighted onto a portrait page fits by its rotated silhouette, not its
 * logical box. The box centre and its footprint AABB centre coincide (rotation
 * is about the centre), so clamping one clamps the other.
 */
export function fitStampBox(center: Point, desired: Size, page: Size, rotCW: number): Rect {
  const quarter = isQuarterTurn((normalizeDeg(rotCW) as PageRotation) ?? 0);
  // Footprint (AABB) dims for the desired size, before fitting.
  const fw0 = quarter ? desired.height : desired.width;
  const fh0 = quarter ? desired.width : desired.height;
  const fitScale = Math.min(1, fw0 > 0 ? page.width / fw0 : 1, fh0 > 0 ? page.height / fh0 : 1);
  const width = desired.width * fitScale;
  const height = desired.height * fitScale;
  const fw = quarter ? height : width;
  const fh = quarter ? width : height;
  // Clamp the centre so the footprint stays fully on the page (the fit above
  // guarantees fw ≤ page.width and fh ≤ page.height, so the range is valid).
  const cx = clampScalar(center.x, fw / 2, page.width - fw / 2);
  const cy = clampScalar(center.y, fh / 2, page.height - fh / 2);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Reset a geom to its as-authored orientation (turn → 0). Box: drop the turn.
 *  Points: turn back about `pivot` (the middle of the upright points by
 *  default, which only clears the turn). */
export function geomResetRotation(geometry: Shape, pivot?: Point): Shape {
  return geomRotation(geometry) ? familyOf(geometry).upright(geometry, pivot) : geometry;
}

/**
 * The oriented selection box (OBB) of a rotatable geom: four corners (in order
 * nw, ne, se, sw of the local box, transformed) + the angle. For a box this is
 * the box rotated about its centre; for a points shape it is the drawn bounds
 * of its upright points, turned about their middle — the snug tilted
 * rectangle. Returns null for non-rotatable kinds.
 */
export function obbFromGeom(
  geometry: Shape,
  stroke: Stroke,
): { corners: [Point, Point, Point, Point]; angle: number } | null {
  const corners = familyOf(geometry).turnedCorners(geometry, stroke);
  return corners ? { corners, angle: geomRotation(geometry) } : null;
}

/* ── group (multi-target) scaling ─────────────────────────────────────────────
 * A multi-selection scales as one box about a fixed anchor (the opposite handle
 * corner/edge). Resize is anisotropic only when every member has `rot == 0`
 * (otherwise an off-axis scale would shear a rotated shape it can't represent —
 * so we fall back to a uniform scale). The iso/aniso choice is decided by the
 * caller (it needs the live selection); these helpers take the resolved factors.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The 8 box resize handles (corner + edge, with cursors) of a plain rect — used
 *  for the multi-target group box. */
export function rectHandlesFor(rect: Rect): Handle[] {
  return RECT_HANDLES.map((handle) => ({
    id: handle,
    at: rectHandlePoint(rect, handle),
    cursor: RECT_CURSOR[handle],
  }));
}

/** The fixed point of a group resize: the opposite handle's point on the box. */
export function groupResizeAnchor(base: Rect, handle: string): Point {
  return rectHandlePoint(base, OPPOSITE_HANDLE[handle as RectHandle] ?? 'nw');
}

/**
 * The live group resize box for a drag. Anisotropic = the plain axis-aligned
 * `resizeRect`; isotropic = a uniform scale of `base` about the anchor by the
 * larger of the two drag ratios (so the preview matches the committed scale and
 * never shears a rotated member).
 */
export function groupResizeBox(base: Rect, handle: string, to: Point, isotropic: boolean): Rect {
  const raw = resizeRect(base, handle as RectHandle, to);
  if (!isotropic) return raw;
  const sx = base.width > 0 ? raw.width / base.width : 1;
  const sy = base.height > 0 ? raw.height / base.height : 1;
  const scale = Math.max(MIN_SIZE / Math.max(base.width, base.height, 1), Math.max(sx, sy));
  const anchor = groupResizeAnchor(base, handle);
  return {
    x: anchor.x + (base.x - anchor.x) * scale,
    y: anchor.y + (base.y - anchor.y) * scale,
    width: base.width * scale,
    height: base.height * scale,
  };
}

/** The (sx, sy) factors a `base`→`cur` group resize applied about its anchor. */
export function groupResizeFactors(base: Rect, current: Rect): { sx: number; sy: number } {
  return {
    sx: base.width > 0 ? current.width / base.width : 1,
    sy: base.height > 0 ? current.height / base.height : 1,
  };
}

/**
 * Scale a geom about `anchor` by `(sx, sy)`. For a rotated box (iso scale, so
 * `sx === sy`) the unrotated box is scaled about the anchor and its turn is
 * preserved (a uniform scale commutes with rotation). For unrotated members
 * (the anisotropic case) every point/extent scales directly.
 */
export function geomScaleAbout(geometry: Shape, anchor: Point, sx: number, sy: number): Shape {
  return familyOf(geometry).scaleAbout(geometry, anchor, sx, sy);
}

/** Where the rotate knob sits, given the OBB corners (nw, ne, se, sw) and the
 *  outward offset (content units). `from` is the top-edge midpoint the connector
 *  stalk anchors to; `at` is the grab dot, offset along the outward normal. */
export function rotateKnob(
  corners: [Point, Point, Point, Point],
  offset: number,
): { at: Point; from: Point } {
  const [nw, ne, , sw] = corners;
  const from = { x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 };
  // outward normal = from the bottom edge toward the top edge (away from shape).
  const down = { x: sw.x - nw.x, y: sw.y - nw.y };
  const len = Math.hypot(down.x, down.y) || 1;
  const up = { x: -down.x / len, y: -down.y / len };
  return { at: { x: from.x + up.x * offset, y: from.y + up.y * offset }, from };
}

const insideRect = (rect: Rect, point: Point): boolean =>
  point.x >= rect.x &&
  point.x <= rect.x + rect.width &&
  point.y >= rect.y &&
  point.y <= rect.y + rect.height;

/**
 * The chord of `box` cut by the infinite line through `point` at `angleDeg` (CW,
 * y-down) — the full-bleed rotation guide: no magic lengths, the line simply
 * spans the page. Slab-clipped (Liang–Barsky); null when the line misses the
 * box entirely (a far-off-page pivot).
 */
export function chordThrough(
  box: Rect,
  point: Point,
  angleDeg: number,
): { a: Point; b: Point } | null {
  const direction = { x: Math.cos(angleDeg * DEG2RAD), y: Math.sin(angleDeg * DEG2RAD) };
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const [dc, pc, lo, hi] of [
    [direction.x, point.x, box.x, box.x + box.width],
    [direction.y, point.y, box.y, box.y + box.height],
  ] as const) {
    if (Math.abs(dc) < 1e-12) {
      if (pc < lo || pc > hi) return null; // parallel outside the slab
      continue;
    }
    const t1 = (lo - pc) / dc;
    const t2 = (hi - pc) / dc;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (tMin >= tMax || !Number.isFinite(tMin) || !Number.isFinite(tMax)) return null;
  return {
    a: { x: point.x + direction.x * tMin, y: point.y + direction.y * tMin },
    b: { x: point.x + direction.x * tMax, y: point.y + direction.y * tMax },
  };
}

/**
 * `rotateKnob` with a total page-bound placement policy: annotations, gestures
 * and chrome are all page-bound, so the grab dot must land inside `pageBox` —
 * off-page it is unreachable (the pointer dispatch resolves pages by
 * containment). Policy: top edge (the default) → flip to the bottom edge when
 * the stalk exits the page → clamp the top candidate inside (degenerate: the
 * selection spans ~the whole page; the knob may then overlap the shape, and
 * hit-testing checks it first so it stays grabbable). Both render (`chrome`)
 * and hit-test (`hitTest`) place the knob through this function, so what you
 * see is what you can grab — by construction. No `pageBox` → the raw knob.
 */
export function placeRotateKnob(
  corners: [Point, Point, Point, Point],
  offset: number,
  pageBox?: Rect,
): { at: Point; from: Point } {
  const top = rotateKnob(corners, offset);
  if (!pageBox || insideRect(pageBox, top.at)) return top;
  // Flip: the same outward-normal math off the opposite (bottom) edge. On a
  // rotated OBB this exits through whichever page edge the stalk crossed.
  const [nw, , se, sw] = corners;
  const from = { x: (sw.x + se.x) / 2, y: (sw.y + se.y) / 2 };
  const down = { x: sw.x - nw.x, y: sw.y - nw.y };
  const len = Math.hypot(down.x, down.y) || 1;
  const at = {
    x: from.x + (down.x / len) * offset,
    y: from.y + (down.y / len) * offset,
  };
  if (insideRect(pageBox, at)) return { at, from };
  return {
    at: {
      x: Math.min(Math.max(top.at.x, pageBox.x), pageBox.x + pageBox.width),
      y: Math.min(Math.max(top.at.y, pageBox.y), pageBox.y + pageBox.height),
    },
    from: top.from,
  };
}

/**
 * A geom's visual bounds: the rect that encloses the drawn appearance, so the
 * baked /AP is never clipped.
 *
 * A box's strokes draw inside it; a cloudy border's bumps reach out from it,
 * so its bounds grow by the cloud's reach (`boxDrawnBounds`), before its
 * turn. Lines / polylines / ink have no box, so they expand by the stroke
 * (+ endings) — the same math feeds `geomScene`, so the visual box and what's
 * drawn always agree.
 *
 * The stroke's cloud matters too: a box's, and a closed poly's, whose curls
 * are centred on the vertex path and reach outward — the bounds grow by the
 * cloud extent, and the engine's `rect` grows with them so the baked scallops
 * are never clipped.
 */
export const geomVisualBounds = (geometry: Shape, stroke: Stroke): Rect =>
  familyOf(geometry).drawnBounds(geometry, stroke);

/**
 * The rect the selection wraps — and the region a selected annotation can be grabbed
 * from. Centre-line geometries (line / polyline / polygon / ink) straddle their path,
 * so this is their visual bounds (the join-aware stroke outline + endings) — a
 * polygon's outline wraps its stroke exactly like a polyline. Box kinds (square /
 * circle / free-text) sit tight on their box (a stroke draws inside it, and a
 * cloud's bumps reach past it), so the 8 resize handles land on its corners. The chrome outline and the selected
 * hit-test both call this, so what you see highlighted is exactly what you can grab —
 * they can never drift.
 */
export const selectionBounds = (geometry: Shape, stroke: Stroke): Rect =>
  familyOf(geometry).selectionBounds(geometry, stroke);

/**
 * The four corners of the oriented selection box — the same quad `chrome` draws.
 * For a rotatable kind this is the OBB (the tilted box, from `obbFromGeom`); at
 * `rot == 0` those are just the axis-aligned corners of `selectionBounds`, and
 * for non-rotatable kinds (markup quads, callouts) it falls back to the rect
 * corners. The grab region, the floating-menu anchor and the multi/group union
 * all consume this, so what you can grab / where the menu sits never drifts from
 * the outline you see.
 */
export function selectionQuad(geometry: Shape, stroke: Stroke): [Point, Point, Point, Point] {
  const obb = obbFromGeom(geometry, stroke);
  if (obb) return obb.corners;
  return rectCornerPoints(selectionBounds(geometry, stroke)) as [Point, Point, Point, Point];
}

/** Is the point inside the (convex) selection quad? Even-odd ring test. */
export const pointInQuad = (point: Point, quad: [Point, Point, Point, Point]): boolean =>
  pointInPoly(point, quad);

/**
 * Does the (convex) selection quad intersect an axis-aligned rect? Separating
 * axis test on the only four candidate axes — the rect's x/y plus the quad's
 * two edge normals; a gap on any axis proves disjoint, otherwise they overlap
 * (touching counts). This is the marquee's predicate: it must catch a tilted
 * shape by the oriented box that is actually drawn — the AABB of that quad has
 * empty corners covering most of the unrotated footprint, so testing it selects
 * shapes the marquee never touched. At `rot 0` the quad is axis-aligned and
 * this degenerates to exactly `rectsIntersect`.
 */
export function quadIntersectsRect(quad: [Point, Point, Point, Point], rect: Rect): boolean {
  const rectPts = rectCornerPoints(rect);
  const axes: Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -(quad[1].y - quad[0].y), y: quad[1].x - quad[0].x },
    { x: -(quad[3].y - quad[0].y), y: quad[3].x - quad[0].x },
  ];
  for (const ax of axes) {
    if (Math.abs(ax.x) < 1e-12 && Math.abs(ax.y) < 1e-12) continue; // degenerate edge
    let qLo = Infinity;
    let qHi = -Infinity;
    for (const point of quad) {
      const projection = point.x * ax.x + point.y * ax.y;
      qLo = Math.min(qLo, projection);
      qHi = Math.max(qHi, projection);
    }
    let rLo = Infinity;
    let rHi = -Infinity;
    for (const point of rectPts) {
      const projection = point.x * ax.x + point.y * ax.y;
      rLo = Math.min(rLo, projection);
      rHi = Math.max(rHi, projection);
    }
    if (qHi < rLo || rHi < qLo) return false; // separated on this axis
  }
  return true;
}

/* ── geom ops ─────────────────────────────────────────────────────────────── */

/** The box around the shape's own box or points, the stroke left out. */
export const geomBounds = (geometry: Shape): Rect => familyOf(geometry).bounds(geometry);

/**
 * Is the page point on the annotation: within `margin` of the stroke, or
 * inside the fill (when `filled`). The stroke band widens with the stroke
 * width; a cloud's bumps are what a cloudy box is hit on.
 */
export function geomHit(
  geometry: Shape,
  point: Point,
  margin: number,
  filled: boolean,
  stroke: Stroke,
): boolean {
  return familyOf(geometry).hit(geometry, point, margin, filled, stroke);
}

/** The shape's handles: resize corners and sides, a callout's tip and knee, or vertices. */
export const geomHandles = (geometry: Shape): Handle[] => familyOf(geometry).handles(geometry);

export const geomTranslate = (geometry: Shape, delta: Point): Shape =>
  familyOf(geometry).translate(geometry, delta);

export const geomDragHandle = (geometry: Shape, handle: string, to: Point): Shape =>
  familyOf(geometry).drag(geometry, handle, to);

/**
 * What the shape draws for the live view. A text box's box — its fill and
 * its border — is the scene's, plain box and callout alike, so the live view
 * paints exactly what the AP generator bakes; the framework's editable
 * element owns only the text.
 */
export const geomScene = (geometry: Shape, stroke: Stroke): RenderNode[] =>
  familyOf(geometry).scene(geometry, stroke);
