/**
 * Pure page-space geometry, dispatched on the `ModelGeometry` union: bounds,
 * hit-testing (stroke + fill, with a configurable margin), handles (with
 * cursors), translate, handle-drag, and the dumb scene. A family that has its
 * own module (`shapes/`) answers for its arm; the rest are answered here.
 * The engine speaks page space too: the same numbers, nothing to convert.
 */
import {
  isQuarterTurn,
  quadCorners,
  quadRing,
  type PageRotation,
  type Size,
  type Quad,
} from '@embedpdf/core-geometry';
import { cloudyBorderExtent, cloudyPolyPath } from './cloudy';
import { endingNodes, endingPoints } from './endings';
import {
  DEG2RAD,
  MIN_SIZE,
  OPPOSITE_HANDLE,
  RECT_CURSOR,
  RECT_HANDLES,
  type RectHandle,
  expandRect,
  insetRect,
  normalizeDeg,
  rectCenter,
  rectContains,
  rectCornerPoints,
  rectFromPoints,
  rectHandlePoint,
  resizeRect,
  resizeRotatedRect,
  rotatePoint,
  rotatedAabb,
  rotatedHandleCursor,
  segDist,
  unionRect,
} from './rect';
import {
  boxCorners,
  boxDrawnBounds,
  boxHandles,
  boxHit,
  boxResize,
  boxRotateAbout,
  boxScaleAbout,
  boxScene,
  boxTranslate,
} from './shapes/box';
import type {
  Border,
  ModelGeometry,
  Handle,
  LineEnding,
  QuadRing,
  Rect,
  RenderNode,
  TextEndAnchor,
  Point,
} from './types';

/** Even-odd point-in-polygon. */
export function pointInPoly(point: Point, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const vertex = points[i];
    const previousVertex = points[j];
    if (
      vertex.y > point.y !== previousVertex.y > point.y &&
      point.x <
        ((previousVertex.x - vertex.x) * (point.y - vertex.y)) / (previousVertex.y - vertex.y) +
          vertex.x
    )
      inside = !inside;
  }
  return inside;
}
const polyPoints = (geometry: Extract<ModelGeometry, { kind: 'poly' }>): Point[] => geometry.points;

/* ── rotation ──────────────────────────────────────────────────────────────
 * Annotation rotation, layered on the generic `@embedpdf/core-geometry` affine
 * primitives (`rotateAbout`). Box kinds carry an unrotated `rect` + a `rot`
 * angle; vertex kinds carry already-rotated points + an advisory `rot`. These
 * helpers know that split and compose the matrix builders — they never hand-roll
 * a rotation matrix. See `ModelGeometry` in types.ts.
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

/** A geom's applied rotation (deg), or 0 for the non-rotatable kinds. A
 *  caret's `rot` is authoring metadata (its text's baseline tilt): reported
 *  here so the renderer and selection chrome follow it, while the caret's
 *  caps (not movable/resizable) keep every rotate gesture away from it. */
export function geomRotation(geometry: ModelGeometry): number {
  if (geometry.kind === 'box') return geometry.rotation;
  if (
    geometry.kind === 'line' ||
    geometry.kind === 'poly' ||
    geometry.kind === 'ink' ||
    geometry.kind === 'text' ||
    geometry.kind === 'caret'
  )
    return geometry.rot ?? 0;
  return 0;
}

/** A box's centre, or the mean of a shape's points. */
export function centroidOf(geometry: ModelGeometry): Point {
  if (geometry.kind === 'box') return rectCenter(geometry.box);
  if (geometry.kind === 'text' || geometry.kind === 'caret') return rectCenter(geometry.rect);
  if (geometry.kind === 'line')
    return { x: (geometry.a.x + geometry.b.x) / 2, y: (geometry.a.y + geometry.b.y) / 2 };
  const points =
    geometry.kind === 'poly'
      ? geometry.points
      : geometry.kind === 'ink'
        ? geometry.strokes.flat()
        : geometry.quads.flatMap(quadCorners);
  let sx = 0;
  let sy = 0;
  for (const point of points) {
    sx += point.x;
    sy += point.y;
  }
  const count = points.length || 1;
  return { x: sx / count, y: sy / count };
}

/**
 * Where a turn of a single shape pivots, as the engine turns it: a box about
 * its own `rect` centre; a line, polygon, polyline or ink about the middle of
 * the box around its points upright. A turn then changes only the angle, never
 * where the upright points are, and a caption or an arrowhead never moves the
 * pivot.
 */
export function turnPivotOf(geometry: ModelGeometry): Point {
  const points =
    geometry.kind === 'line'
      ? [geometry.a, geometry.b]
      : geometry.kind === 'poly'
        ? geometry.points
        : geometry.kind === 'ink'
          ? geometry.strokes.flat()
          : [];
  if (points.length === 0) return centroidOf(geometry);
  const rot = geomRotation(geometry);
  const origin = { x: 0, y: 0 };
  const upright = unionRect(points.map((point) => rotatePoint(point, origin, -rot)));
  return rotatePoint(rectCenter(upright), origin, rot);
}

/** Does the geometry carry a meaningful `rot` (an oriented local box exists)?
 *  Orientation is a geometry fact; whether the user may rotate is the separate
 *  `caps.rotatable` gate — a caret is oriented (it rides its text's tilt) yet
 *  offers no rotate gesture. */
export function isRotatableGeom(geometry: ModelGeometry): boolean {
  return (
    geometry.kind === 'box' ||
    geometry.kind === 'line' ||
    geometry.kind === 'poly' ||
    geometry.kind === 'ink' ||
    geometry.kind === 'caret' ||
    (geometry.kind === 'text' && !geometry.callout)
  );
}

/**
 * Rotate a geom by `deltaDeg` (clockwise) about `pivot`.
 *  - box (`box`/plain `text`): orbit the box centre about the pivot (a rigid
 *    translation of the unrotated box) and add the angle to its turn. When the
 *    pivot is the box centre this is a pure turn.
 *  - vertex (`line`/`poly`/`ink`): map every point through the rotation and bump
 *    the advisory `rot` (the points stay the authoritative visual).
 * Kinds without a rotate verb are returned unchanged: quads and callouts, and
 * also the caret — oriented (`isRotatableGeom`) but text-anchored, so its tilt
 * is authoring metadata that no gesture edits (`geomResetRotation` still
 * clears it).
 */
export function geomRotateAbout(
  geometry: ModelGeometry,
  pivot: Point,
  deltaDeg: number,
): ModelGeometry {
  if (deltaDeg === 0) return geometry;
  if (geometry.kind === 'box') return boxRotateAbout(geometry, pivot, deltaDeg);
  const nextRot = normalizeDeg(geomRotation(geometry) + deltaDeg);
  if (geometry.kind === 'text') {
    // The rotate gesture stays out of scope for callouts (no knob/orbit); the
    // box may still carry a creation-time `rot` from the upright policy.
    if (geometry.callout) return geometry;
    const point = rotatePoint(rectCenter(geometry.rect), pivot, deltaDeg);
    return {
      ...geometry,
      rect: {
        ...geometry.rect,
        x: point.x - geometry.rect.width / 2,
        y: point.y - geometry.rect.height / 2,
      },
      rot: nextRot,
    };
  }
  const rp = (point: Point) => rotatePoint(point, pivot, deltaDeg);
  if (geometry.kind === 'line')
    return { ...geometry, a: rp(geometry.a), b: rp(geometry.b), rot: nextRot };
  if (geometry.kind === 'poly')
    return { ...geometry, points: geometry.points.map(rp), rot: nextRot };
  if (geometry.kind === 'ink')
    return { ...geometry, strokes: geometry.strokes.map((stroke) => stroke.map(rp)), rot: nextRot };
  return geometry;
}

/**
 * The size of the frame an engine-baked `/AP` is authored into: the unrotated
 * box for box kinds (rotation is stripped to `apRot` and re-applied at the
 * blit), the point bounds for vertex kinds (their points are the visual).
 * Position is deliberately absent — a translation never invalidates a raster.
 */
function apFrameSize(geometry: ModelGeometry): Size {
  if (geometry.kind === 'box') return { width: geometry.box.width, height: geometry.box.height };
  if (geometry.kind === 'text' || geometry.kind === 'caret')
    return { width: geometry.rect.width, height: geometry.rect.height };
  const points =
    geometry.kind === 'line'
      ? [geometry.a, geometry.b]
      : geometry.kind === 'poly'
        ? geometry.points
        : geometry.kind === 'ink'
          ? geometry.strokes.flat()
          : geometry.quads.flatMap(quadCorners);
  const rect = unionRect(points);
  return { width: rect.width, height: rect.height };
}

/**
 * Did an edit change the size of the geometry's `/AP` authoring frame — i.e.
 * will the engine's re-bake produce new raster content? One rule for every
 * gesture, so the commit sites never enumerate kinds: a move/rotate preserves
 * the frame (false), a resize/scale changes it (true). The 0.01pt tolerance
 * absorbs float noise from the gesture math.
 */
export function apSizeChanged(before: ModelGeometry, after: ModelGeometry): boolean {
  const size = apFrameSize(before);
  const afterSize = apFrameSize(after);
  return (
    Math.abs(size.width - afterSize.width) > 0.01 || Math.abs(size.height - afterSize.height) > 0.01
  );
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

/** `rect` with width↔height swapped about its own centre — the unrotated box
 *  whose quarter-turn AABB is exactly `rect` again. */
export function transposedAboutCenter(rect: Rect): Rect {
  const point = rectCenter(rect);
  return {
    x: point.x - rect.height / 2,
    y: point.y - rect.width / 2,
    width: rect.height,
    height: rect.width,
  };
}

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
 *  Vertex: spin the points by `-rot` about the supplied selection center.
 *  Geometry-only callers retain the centroid default. */
export function geomResetRotation(geometry: ModelGeometry, pivot?: Point): ModelGeometry {
  const rot = geomRotation(geometry);
  if (!rot) return geometry;
  if (geometry.kind === 'box') return { ...geometry, rotation: 0 };
  if (geometry.kind === 'text' || geometry.kind === 'caret') return { ...geometry, rot: 0 };
  const point = pivot ?? turnPivotOf(geometry);
  const rotated = geomRotateAbout(geometry, point, -rot);
  // geomRotateAbout already set rot = normalize(rot - rot) = 0.
  return rotated;
}

/**
 * The oriented selection box (OBB) of a rotatable geom: four corners (in order
 * nw, ne, se, sw of the local box, transformed) + the angle. For a box this is
 * the `rect` rotated about its centre; for a vertex shape it is reconstructed
 * from the advisory `rot` — un-rotate the points to recover the as-authored
 * shape, take that tight local box, then rotate it back — giving the snug tilted
 * rectangle. Returns null for non-rotatable kinds.
 */
export function obbFromGeom(
  geometry: ModelGeometry,
  strokeWidth: number,
  border?: Border,
): { corners: [Point, Point, Point, Point]; angle: number } | null {
  if (!isRotatableGeom(geometry)) return null;
  const rot = geomRotation(geometry);
  if (geometry.kind === 'box') return { corners: boxCorners(geometry), angle: rot };
  if (geometry.kind === 'text' || geometry.kind === 'caret') {
    const point = rectCenter(geometry.rect);
    const corners = rectCornerPoints(geometry.rect).map((corner) =>
      rotatePoint(corner, point, rot),
    );
    return { corners: corners as [Point, Point, Point, Point], angle: rot };
  }
  // vertex: reconstruct the local (as-authored) box from rot about the centroid.
  const centroid = centroidOf(geometry);
  const unrotated = rot ? geomRotateAbout(geometry, centroid, -rot) : geometry;
  const localBox = selectionBounds(unrotated, strokeWidth, border);
  const corners = rectCornerPoints(localBox).map((point) => rotatePoint(point, centroid, rot));
  return { corners: corners as [Point, Point, Point, Point], angle: rot };
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
export function geomScaleAbout(
  geometry: ModelGeometry,
  anchor: Point,
  sx: number,
  sy: number,
): ModelGeometry {
  const sp = (point: Point): Point => ({
    x: anchor.x + (point.x - anchor.x) * sx,
    y: anchor.y + (point.y - anchor.y) * sy,
  });
  if (geometry.kind === 'box') return boxScaleAbout(geometry, anchor, sx, sy);
  if (geometry.kind === 'text') {
    if (geometry.callout) return geometry;
    const point = sp(rectCenter(geometry.rect));
    const width = Math.max(MIN_SIZE, geometry.rect.width * Math.abs(sx));
    const height = Math.max(MIN_SIZE, geometry.rect.height * Math.abs(sy));
    return {
      ...geometry,
      rect: { x: point.x - width / 2, y: point.y - height / 2, width, height },
    };
  }
  if (geometry.kind === 'line') return { ...geometry, a: sp(geometry.a), b: sp(geometry.b) };
  if (geometry.kind === 'poly') return { ...geometry, points: geometry.points.map(sp) };
  if (geometry.kind === 'ink')
    return { ...geometry, strokes: geometry.strokes.map((stroke) => stroke.map(sp)) };
  if (geometry.kind === 'caret') {
    const point = sp(rectCenter(geometry.rect));
    const width = Math.max(MIN_SIZE, geometry.rect.width * Math.abs(sx));
    const height = Math.max(MIN_SIZE, geometry.rect.height * Math.abs(sy));
    return {
      ...geometry,
      rect: { x: point.x - width / 2, y: point.y - height / 2, width, height },
    };
  }
  return geometry; // quads scale with their points
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

/* ── callout leader ───────────────────────────────────────────────────────────
 * A free-text callout draws a 2–3 point leader (`/CL`) from the called-out `tip`
 * to the text box, with an arrow (`/LE`) at the tip. The point where the leader
 * meets the box is derived — never stored — so it tracks the box and knee.
 */

/** The box-edge midpoint the leader connects to: the side `ref` (the knee, else
 *  the tip) points toward, by horizontal/vertical dominance vs the box centre.
 *  With `rot` (a callout box tilted by the upright policy) the decision runs in
 *  the box's local frame and the midpoint lands back on the rotated edge — the
 *  edge the user actually sees. */
export function calloutConnection(box: Rect, ref: Point, rot = 0): Point {
  if (rot) {
    const point = rectCenter(box);
    return rotatePoint(calloutConnection(box, rotatePoint(ref, point, -rot)), point, rot);
  }
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = ref.x - cx;
  const dy = ref.y - cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { x: box.x + box.width, y: cy } : { x: box.x, y: cy };
  }
  return dy >= 0 ? { x: cx, y: box.y + box.height } : { x: cx, y: box.y };
}

/** The leader polyline `[tip, knee?, conn]`, with `conn` derived from the box
 *  (its rotated footprint when the box carries `rot`). */
export function calloutLinePoints(geometry: Extract<ModelGeometry, { kind: 'text' }>): Point[] {
  const callout = geometry.callout;
  if (!callout) return [];
  const conn = calloutConnection(geometry.rect, callout.knee ?? callout.tip, geometry.rot ?? 0);
  return callout.knee ? [callout.tip, callout.knee, conn] : [callout.tip, conn];
}

/** The leader's single ending segment (arrow at the tip), pointing out of the
 *  body into the tip — so the arrowhead opens back along the leader. */
function calloutEndingSeg(points: Point[], ending: LineEnding): EndingSeg | null {
  if (points.length < 2) return null;
  return {
    tip: points[0],
    angle: Math.atan2(points[0].y - points[1].y, points[0].x - points[1].x),
    ending,
  };
}

export function caretRectFromTextEnd(lineRect: Rect): Rect {
  const height = lineRect.height / 2;
  const width = height;
  const lineEndX = lineRect.x + lineRect.width;
  return {
    x: lineEndX - width / 2,
    y: lineRect.y + lineRect.height / 2,
    width,
    height,
  };
}

/**
 * Caret box for a text-edit anchor: half the glyph's ink height, centered on
 * the trailing baseline corner in reading direction (`advance` decides which
 * end — RTL carets land on the visual left), sitting on the baseline. The box
 * stays axis-aligned; use {@link caretGeomFromAnchor} for the tilt-carrying
 * geometry.
 */
export function caretRectFromAnchor(anchor: TextEndAnchor): Rect {
  const quad = anchor.glyphQuad;
  const ink = Math.hypot(quad.lowerLeft.x - quad.upperLeft.x, quad.lowerLeft.y - quad.upperLeft.y);
  const size = Math.max(ink / 2, 1);
  const corner = anchor.advance > 0 ? quad.lowerRight : quad.lowerLeft;
  return { x: corner.x - size / 2, y: corner.y - size, width: size, height: size };
}

/** Rotations closer than ~0.05° to upright stay upright (float noise guard). */
const CARET_ROT_EPSILON = 0.05;

/**
 * Caret geometry for a text-edit anchor: the box-family pair — an unrotated
 * box whose centre sits half a caret-size ascent-ward of the trailing
 * baseline corner, plus `rot` = the text's baseline tilt (deg, CW in y-down
 * page space). Rotating the box about its centre by `rot` lands it
 * hugging the rotated baseline, symbol pointing at its text. For upright
 * anchors this degenerates exactly to {@link caretRectFromAnchor} with no
 * `rot` key — the dominant case is byte-identical.
 */
export function caretGeomFromAnchor(
  anchor: TextEndAnchor,
): Extract<ModelGeometry, { kind: 'caret' }> {
  const quad = anchor.glyphQuad;
  const ink = Math.hypot(quad.lowerLeft.x - quad.upperLeft.x, quad.lowerLeft.y - quad.upperLeft.y);
  const size = Math.max(ink / 2, 1);
  const corner = anchor.advance > 0 ? quad.lowerRight : quad.lowerLeft;
  // The caret's own orientation follows the text (the symbol points at its
  // line regardless of reading direction), so the tilt comes from the
  // baseline edge, not from `advance`.
  const bx = quad.lowerRight.x - quad.lowerLeft.x;
  const by = quad.lowerRight.y - quad.lowerLeft.y;
  const rot = Math.hypot(bx, by) > 0 ? normalizeDeg((Math.atan2(by, bx) * 180) / Math.PI) : 0;
  const upright = rot < CARET_ROT_EPSILON || rot > 360 - CARET_ROT_EPSILON;
  if (upright) {
    return {
      kind: 'caret',
      rect: { x: corner.x - size / 2, y: corner.y - size, width: size, height: size },
    };
  }
  // Centre = trailing corner + (size/2) toward the ascent side.
  const ux = (quad.upperLeft.x - quad.lowerLeft.x) / ink;
  const uy = (quad.upperLeft.y - quad.lowerLeft.y) / ink;
  const cx = corner.x + (ux * size) / 2;
  const cy = corner.y + (uy * size) / 2;
  return {
    kind: 'caret',
    rect: { x: cx - size / 2, y: cy - size / 2, width: size, height: size },
    rot,
  };
}

/** Map a Quad's corners through a point function (names ride along). */
function mapQuad(quad: Quad, mapPoint: (point: Point) => Point): Quad {
  return {
    upperLeft: mapPoint(quad.upperLeft),
    upperRight: mapPoint(quad.upperRight),
    lowerLeft: mapPoint(quad.lowerLeft),
    lowerRight: mapPoint(quad.lowerRight),
  };
}

/* ── line endings ─────────────────────────────────────────────────────────────
 * The breathing room a stroked line/poly needs beyond its vertices, as a factor
 * of the stroke width: the half-stroke under the centre-line plus a
 * little extra so caps/joins are never clipped by the engine `/Rect`.
 */
/** Miter limit shared by the bounds math and the SVG renderer (`stroke-miterlimit`),
 *  so the computed box and the drawn stroke always agree on where a sharp join
 *  bevels instead of spiking. 10 = the PDF default (also what the baked /AP uses). */
export const MITER_LIMIT = 10;

/**
 * The outline points of a mitred, butt-capped polyline (open or closed) stroked
 * at `strokeWidth`: each segment's two side offsets (the straight extents + both
 * bevel corners) plus each interior join's outer miter tip — added only while the
 * join is within `MITER_LIMIT` (past that the renderer bevels it, and the segment
 * offsets already bound it). `unionRect` of these is the tight, asymmetric visual
 * box: a pointy join grows the box only on the side it actually spikes.
 *
 * Miter kinds only (line / polyline / polygon). Ink is round-capped/round-joined,
 * never spikes, and is bounded elsewhere by a plain half-width grow.
 */
function strokeOutlinePoints(points: Point[], closed: boolean, strokeWidth: number): Point[] {
  const halfWidth = strokeWidth / 2;
  const pointCount = points.length;
  if (pointCount === 0) return [];
  if (pointCount === 1 || halfWidth === 0) return [...points];

  const segCount = closed ? pointCount : pointCount - 1;
  const dir: Point[] = [];
  const nrm: Point[] = [];
  for (let i = 0; i < segCount; i++) {
    const start = points[i];
    const end = points[(i + 1) % pointCount];
    const len = Math.hypot(end.x - start.x, end.y - start.y) || 1;
    const ux = (end.x - start.x) / len;
    const uy = (end.y - start.y) / len;
    dir.push({ x: ux, y: uy });
    nrm.push({ x: -uy, y: ux }); // a unit normal (either side; sign is re-picked below)
  }

  const out: Point[] = [];
  // Segment side offsets at both ends — covers the straight extents, the butt
  // caps at open ends, and the bevel corners of any beveled join.
  for (let i = 0; i < segCount; i++) {
    const start = points[i];
    const end = points[(i + 1) % pointCount];
    const nx = nrm[i].x * halfWidth;
    const ny = nrm[i].y * halfWidth;
    out.push({ x: start.x + nx, y: start.y + ny }, { x: start.x - nx, y: start.y - ny });
    out.push({ x: end.x + nx, y: end.y + ny }, { x: end.x - nx, y: end.y - ny });
  }

  // Interior joins: the outer miter tip, gated by the miter limit.
  const joinStart = closed ? 0 : 1;
  const joinEnd = closed ? pointCount : pointCount - 1; // vertices [joinStart, joinEnd)
  for (let vertexIndex = joinStart; vertexIndex < joinEnd; vertexIndex++) {
    const inIdx = closed ? (vertexIndex - 1 + pointCount) % pointCount : vertexIndex - 1;
    const outIdx = vertexIndex; // the segment starting at vertexIndex, open or closed
    const incoming = dir[inIdx]; // previous -> vertexIndex
    const outgoing = dir[outIdx]; // vertexIndex -> next
    const n1 = nrm[inIdx];
    const n2 = nrm[outIdx];
    // Outer bisector direction: opposite the interior bisector `outgoing - incoming`.
    const bx = incoming.x - outgoing.x;
    const by = incoming.y - outgoing.y;
    if (Math.hypot(bx, by) < 1e-9) continue; // straight run: no spike beyond the offsets
    let mhx = n1.x + n2.x;
    let mhy = n1.y + n2.y;
    const ml = Math.hypot(mhx, mhy);
    if (ml < 1e-9) continue; // exact hairpin: renderer bevels
    mhx /= ml;
    mhy /= ml;
    if (mhx * bx + mhy * by < 0) {
      mhx = -mhx; // point the miter unit vector to the outer side
      mhy = -mhy;
    }
    const cosHalf = Math.abs(mhx * n1.x + mhy * n1.y); // cos(deviation/2)
    if (cosHalf < 1e-9) continue;
    const miterLen = halfWidth / cosHalf;
    if (miterLen > MITER_LIMIT * halfWidth) continue; // too sharp: renderer bevels → offsets bound it
    const vertex = points[vertexIndex];
    out.push({ x: vertex.x + mhx * miterLen, y: vertex.y + mhy * miterLen });
  }
  return out;
}

type EndingSeg = { tip: Point; angle: number; ending: LineEnding | undefined };

/** The start/end tips of a line / open poly, each with the segment angle pointing
 *  Out of the body into the tip (so an arrowhead opens back toward the line). */
function endingSegs(geometry: ModelGeometry): EndingSeg[] {
  if (geometry.kind === 'line' && geometry.ends) {
    return [
      {
        tip: geometry.a,
        angle: Math.atan2(geometry.a.y - geometry.b.y, geometry.a.x - geometry.b.x),
        ending: geometry.ends.start,
      },
      {
        tip: geometry.b,
        angle: Math.atan2(geometry.b.y - geometry.a.y, geometry.b.x - geometry.a.x),
        ending: geometry.ends.end,
      },
    ];
  }
  if (
    geometry.kind === 'poly' &&
    !geometry.closed &&
    geometry.ends &&
    geometry.points.length >= 2
  ) {
    const points = geometry.points;
    const count = points.length;
    return [
      {
        tip: points[0],
        angle: Math.atan2(points[0].y - points[1].y, points[0].x - points[1].x),
        ending: geometry.ends.start,
      },
      {
        tip: points[count - 1],
        angle: Math.atan2(
          points[count - 1].y - points[count - 2].y,
          points[count - 1].x - points[count - 2].x,
        ),
        ending: geometry.ends.end,
      },
    ];
  }
  return [];
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
 * `border` matters for the clouds: a box's, and a closed poly's, whose curls
 * are centred on the vertex path and reach outward — the bounds grow by the
 * cloud extent, and the engine's `rect` grows with them so the baked scallops
 * are never clipped.
 */
export function geomVisualBounds(
  geometry: ModelGeometry,
  strokeWidth: number,
  border?: Border,
): Rect {
  if (geometry.kind === 'poly' && geometry.closed && border?.kind === 'cloudy') {
    // Corner curls are arcs of the cloud radius centred at the vertices, and the
    // stroke straddles them — so ink reaches radius + strokeWidth/2 beyond the
    // vertex hull on every side: exactly `cloudyBorderExtent`.
    return expandRect(
      unionRect(geometry.points),
      cloudyBorderExtent(border.intensity, strokeWidth, false),
    );
  }
  if (geometry.kind === 'text' && geometry.callout) {
    // The overall /Rect: the union of the text box (its rotated corners when the
    // box carries an upright tilt), the leader points, and the arrow-ending
    // polygon at the tip (same ending math as line/poly).
    const points = calloutLinePoints(geometry);
    const seg = calloutEndingSeg(points, geometry.callout.ending);
    const rot = geometry.rot ?? 0;
    const point = rectCenter(geometry.rect);
    const corners = rectCornerPoints(geometry.rect).map((corner) =>
      rot ? rotatePoint(corner, point, rot) : corner,
    );
    const all = [...corners, ...points];
    if (seg) all.push(...endingPoints(seg.tip, seg.angle, seg.ending, strokeWidth));
    return expandRect(unionRect(all), strokeWidth / 2);
  }
  if (geometry.kind === 'box') return boxDrawnBounds(geometry, strokeWidth, border);
  if (geometry.kind === 'text' || geometry.kind === 'caret') return geometry.rect;
  if (geometry.kind === 'quads')
    return expandRect(unionRect(geometry.quads.flatMap(quadCorners)), strokeWidth / 2);
  // Ink is round-capped/round-joined: it never spikes, so a plain half-width grow of the
  // freehand hull is exact — left as-is (the freehand look must not change).
  if (geometry.kind === 'ink')
    return expandRect(unionRect(geometry.strokes.flat()), strokeWidth / 2);
  // Line / polyline / polygon: the miter kinds. Wrap the actual stroke outline
  // (per-join, asymmetric) instead of a flat pad — for the body and each ending,
  // so a mitred arrowhead tip is enclosed exactly (not under-covered by a flat h).
  const raw = geometry.kind === 'line' ? [geometry.a, geometry.b] : geometry.points;
  const closed = geometry.kind === 'poly' && geometry.closed;
  const outline = strokeOutlinePoints(raw, closed, strokeWidth);
  for (const seg of endingSegs(geometry)) {
    for (const node of endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth)) {
      if (node.kind === 'poly') {
        // arrowheads / diamonds / squares are stroked polys: their sharp corners
        // miter exactly like the body, so wrap the real outline (tip included).
        outline.push(...strokeOutlinePoints(node.points, node.closed, strokeWidth));
      } else if (node.kind === 'ellipse') {
        // a stroked ellipse (circle ending) grows uniformly by h — no miters.
        outline.push(...rectCornerPoints(expandRect(node.rect, strokeWidth / 2)));
      }
    }
  }
  return unionRect(outline);
}

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
export function selectionBounds(
  geometry: ModelGeometry,
  strokeWidth: number,
  border?: Border,
): Rect {
  if (geometry.kind === 'line' || geometry.kind === 'ink' || geometry.kind === 'poly')
    return geomVisualBounds(geometry, strokeWidth, border);
  // A callout's tilted text box (the upright policy): the selection wraps the box
  // the user sees — its rotated footprint. Exact for the quarter-turns upright
  // produces (the footprint stays axis-aligned), so outline and handles agree.
  if (geometry.kind === 'text' && geometry.callout && (geometry.rot ?? 0) !== 0)
    return rotatedAabb(geometry.rect, geometry.rot!);
  return geomBounds(geometry);
}

/**
 * The four corners of the oriented selection box — the same quad `chrome` draws.
 * For a rotatable kind this is the OBB (the tilted box, from `obbFromGeom`); at
 * `rot == 0` those are just the axis-aligned corners of `selectionBounds`, and
 * for non-rotatable kinds (markup quads, callouts) it falls back to the rect
 * corners. The grab region, the floating-menu anchor and the multi/group union
 * all consume this, so what you can grab / where the menu sits never drifts from
 * the outline you see.
 */
export function selectionQuad(
  geometry: ModelGeometry,
  strokeWidth: number,
  border?: Border,
): [Point, Point, Point, Point] {
  const obb = obbFromGeom(geometry, strokeWidth, border);
  if (obb) return obb.corners;
  return rectCornerPoints(selectionBounds(geometry, strokeWidth, border)) as [
    Point,
    Point,
    Point,
    Point,
  ];
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

/**
 * Is the page point on a line/poly's drawn endings — so an arrowhead is as
 * clickable as the stroke. Uses the same ending nodes the renderer draws: a closed
 * shape (closed arrow, circle, square, diamond) hits inside or near its edge; an
 * open one (open arrow, butt, slash) hits near its stroke. `tol` is the stroke
 * band already widened by the hit margin.
 */
function endingNodesHit(nodes: RenderNode[], point: Point, tol: number): boolean {
  for (const node of nodes) {
    if (node.kind === 'ellipse') {
      const rect = node.rect;
      const rx = rect.width / 2;
      const ry = rect.height / 2;
      if (rx <= 0 || ry <= 0) continue;
      const nx = (point.x - (rect.x + rx)) / rx;
      const ny = (point.y - (rect.y + ry)) / ry;
      if (Math.hypot(nx, ny) <= 1 + tol / Math.min(rx, ry)) return true; // filled disc + band
    } else if (node.kind === 'poly') {
      const points = node.points;
      for (let i = 0; i < points.length - 1; i++)
        if (segDist(point, points[i], points[i + 1]) <= tol) return true;
      if (node.closed) {
        if (points.length > 2 && segDist(point, points[points.length - 1], points[0]) <= tol)
          return true;
        if (pointInPoly(point, points)) return true; // filled head interior
      }
    }
  }
  return false;
}

function endingHit(
  geometry: ModelGeometry,
  point: Point,
  tol: number,
  strokeWidth: number,
): boolean {
  for (const seg of endingSegs(geometry))
    if (endingNodesHit(endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth), point, tol))
      return true;
  return false;
}

/* ── geom ops ─────────────────────────────────────────────────────────────── */

export function geomBounds(geometry: ModelGeometry): Rect {
  if (geometry.kind === 'box') return geometry.box;
  if (geometry.kind === 'text' || geometry.kind === 'caret') return geometry.rect;
  if (geometry.kind === 'line') return rectFromPoints(geometry.a, geometry.b);
  if (geometry.kind === 'poly') return unionRect(geometry.points);
  if (geometry.kind === 'ink') return unionRect(geometry.strokes.flat());
  return unionRect(geometry.quads.flatMap(quadCorners));
}

/**
 * Is the page point on the annotation: within `margin` of the stroke, or
 * inside the fill (when `filled`). The stroke band widens with the stroke
 * width; a box's `border` says whether its cloud's bumps are what to hit.
 */
export function geomHit(
  geometry: ModelGeometry,
  point: Point,
  margin: number,
  filled: boolean,
  strokeWidth: number,
  border?: Border,
): boolean {
  if (geometry.kind === 'box') return boxHit(geometry, point, margin, filled, strokeWidth, border);
  const tol = margin + strokeWidth / 2;
  // A rotated box stores its unrotated `rect`; inverse-rotate the pointer into
  // that local frame and run the normal axis-aligned tests. Vertex kinds carry
  // already-rotated points, so they hit-test directly (rot is advisory). A
  // callout is compound: only its box rotates (the leader is page-space), so the
  // inverse rotation applies to the box test alone — see the text branch below.
  if (
    (geometry.kind === 'caret' || (geometry.kind === 'text' && !geometry.callout)) &&
    (geometry.rot ?? 0) !== 0
  ) {
    point = rotatePoint(point, rectCenter(geometry.rect), -(geometry.rot ?? 0));
  }
  // A text box is a solid hit target anywhere inside it (+ the click margin).
  if (geometry.kind === 'caret') return rectContains(expandRect(geometry.rect, margin), point);
  if (geometry.kind === 'text') {
    // Box test in the box's local frame (a tilted callout box); leader/arrow
    // tests in the page frame (their points are already where they're drawn).
    const rot = geometry.callout ? (geometry.rot ?? 0) : 0;
    const pBox = rot ? rotatePoint(point, rectCenter(geometry.rect), -rot) : point;
    if (rectContains(expandRect(geometry.rect, margin), pBox)) return true;
    if (geometry.callout) {
      const points = calloutLinePoints(geometry);
      for (let i = 0; i < points.length - 1; i++)
        if (segDist(point, points[i], points[i + 1]) <= tol) return true;
      const seg = calloutEndingSeg(points, geometry.callout.ending);
      if (
        seg &&
        endingNodesHit(endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth), point, tol)
      )
        return true;
    }
    return false;
  }
  if (geometry.kind === 'line')
    return (
      segDist(point, geometry.a, geometry.b) <= tol || endingHit(geometry, point, tol, strokeWidth)
    );
  if (geometry.kind === 'poly') {
    if (filled && geometry.closed && pointInPoly(point, geometry.points)) return true;
    const points = geometry.points;
    const count = points.length;
    for (let i = 0; i < count - 1; i++)
      if (segDist(point, points[i], points[i + 1]) <= tol) return true;
    if (geometry.closed && count > 2 && segDist(point, points[count - 1], points[0]) <= tol)
      return true;
    return endingHit(geometry, point, tol, strokeWidth);
  }
  if (geometry.kind === 'ink') {
    // near any segment of any stroke (ink is stroke-only, never filled)
    for (const stroke of geometry.strokes)
      for (let i = 0; i < stroke.length - 1; i++)
        if (segDist(point, stroke[i], stroke[i + 1]) <= tol) return true;
    return false;
  }
  // quads (markup): oriented per-line cells — hit anywhere inside any quad.
  // Quad rings are simple (non-self-intersecting) by construction, so the
  // generic point-in-poly test is exact for rotated text too.
  return geometry.quads.some((quad) => pointInQuad(point, quadRing(quad)));
}

export function geomHandles(geometry: ModelGeometry): Handle[] {
  if (geometry.kind === 'box') return boxHandles(geometry);
  if (geometry.kind === 'text') {
    const rot = geometry.rot ?? 0;
    const point = rectCenter(geometry.rect);
    const handles: Handle[] = RECT_HANDLES.map((handle) => ({
      id: handle,
      // box handles sit on the unrotated rect; rotate each into place so they
      // ride the tilted box. The cursor rotates with the handle (the visually
      // right-edge handle of a 90°-tilted box resizes horizontally).
      at: rot
        ? rotatePoint(rectHandlePoint(geometry.rect, handle), point, rot)
        : rectHandlePoint(geometry.rect, handle),
      cursor: rotatedHandleCursor(handle, rot),
    }));
    // A callout adds vertex handles for the leader tip and (if present) knee, so
    // the called-out point and the elbow can be dragged independently of the box.
    if (geometry.callout) {
      handles.push({ id: 'callout-tip', at: geometry.callout.tip, cursor: 'crosshair' });
      if (geometry.callout.knee)
        handles.push({ id: 'callout-knee', at: geometry.callout.knee, cursor: 'crosshair' });
    }
    return handles;
  }
  if (geometry.kind === 'line') {
    return [
      { id: 'v0', at: geometry.a, cursor: 'crosshair' },
      { id: 'v1', at: geometry.b, cursor: 'crosshair' },
    ];
  }
  if (geometry.kind === 'poly') {
    return geometry.points.map((at, i) => ({ id: `v${i}`, at, cursor: 'crosshair' }));
  }
  return []; // markup: move only
}

export function geomTranslate(geometry: ModelGeometry, delta: Point): ModelGeometry {
  const mv = (vertex: Point): Point => ({ x: vertex.x + delta.x, y: vertex.y + delta.y });
  if (geometry.kind === 'text') {
    const rect = { ...geometry.rect, x: geometry.rect.x + delta.x, y: geometry.rect.y + delta.y };
    if (!geometry.callout) return { ...geometry, rect };
    return {
      ...geometry,
      rect,
      callout: {
        ...geometry.callout,
        tip: mv(geometry.callout.tip),
        knee: geometry.callout.knee ? mv(geometry.callout.knee) : undefined,
      },
    };
  }
  if (geometry.kind === 'box') return boxTranslate(geometry, delta);
  if (geometry.kind === 'caret')
    return {
      ...geometry,
      rect: { ...geometry.rect, x: geometry.rect.x + delta.x, y: geometry.rect.y + delta.y },
    };
  if (geometry.kind === 'line') return { ...geometry, a: mv(geometry.a), b: mv(geometry.b) };
  if (geometry.kind === 'poly') return { ...geometry, points: geometry.points.map(mv) };
  if (geometry.kind === 'ink')
    return { ...geometry, strokes: geometry.strokes.map((stroke) => stroke.map(mv)) };
  return { ...geometry, quads: geometry.quads.map((quad) => mapQuad(quad, mv)) };
}

export function geomDragHandle(geometry: ModelGeometry, handle: string, to: Point): ModelGeometry {
  if (geometry.kind === 'text') {
    if (handle === 'callout-tip' && geometry.callout)
      return { ...geometry, callout: { ...geometry.callout, tip: to } };
    if (handle === 'callout-knee' && geometry.callout)
      return { ...geometry, callout: { ...geometry.callout, knee: to } };
    return {
      ...geometry,
      rect: resizeRotatedRect(geometry.rect, geometry.rot ?? 0, handle as RectHandle, to),
    };
  }
  if (geometry.kind === 'box') return boxResize(geometry, handle, to);
  if (geometry.kind === 'line')
    return handle === 'v0' ? { ...geometry, a: to } : { ...geometry, b: to };
  if (geometry.kind === 'poly') {
    const vertexIndex = Number(handle.slice(1));
    if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= geometry.points.length)
      return geometry;
    const points = geometry.points.slice();
    points[vertexIndex] = to;
    return { ...geometry, points };
  }
  return geometry;
}

/**
 * The text plate inset of a free-text box: twice the border width. The plate
 * — where text lays out, clips and scrolls — is the box deflated by this on
 * every side: the ink band and an equal breathing band, so the text never
 * touches the stroke. Acrobat's rule, measured 1–12 pt on plain boxes and
 * 1–7 pt on callouts; the engine's `FreeTextPlate` is the same formula, so
 * the live editor sits exactly where the baked text lands. Acrobat's thinnest
 * border is 1 pt; a width of 0 is ours alone and gives no inset (the plate is
 * the box).
 */
export function textPlateInset(strokeWidth: number): number {
  return 2 * Math.max(0, strokeWidth);
}

/** A callout's leader (open polyline, its connection point extended under
 *  the box border by half the stroke — the AP generator's `adjusted_conn` —
 *  so the leader meets the border ink without an angular gap) + the arrow at
 *  its tip. */
function calloutLeaderNodes(
  geometry: Extract<ModelGeometry, { kind: 'text' }>,
  callout: NonNullable<Extract<ModelGeometry, { kind: 'text' }>['callout']>,
  strokeWidth: number,
): RenderNode[] {
  const points = [...calloutLinePoints(geometry)];
  if (strokeWidth > 0 && points.length >= 2) {
    const last = points[points.length - 1];
    const previous = points[points.length - 2];
    const dx = last.x - previous.x;
    const dy = last.y - previous.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      points[points.length - 1] = {
        x: last.x + (dx / len) * (strokeWidth / 2),
        y: last.y + (dy / len) * (strokeWidth / 2),
      };
    }
  }
  const nodes: RenderNode[] = [{ kind: 'poly', points, closed: false }];
  const seg = calloutEndingSeg(points, callout.ending);
  if (seg) nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth));
  return nodes;
}

export function geomScene(geometry: ModelGeometry, strokeWidth = 0, border?: Border): RenderNode[] {
  // A text box's box — its fill and its border — is the scene's, plain box and
  // callout alike, so the live view paints exactly what the AP generator
  // bakes (`GenerateBorderAP`: the `/DA` colour at the `/BS` width, inset by
  // half the stroke). The framework's editable element owns only the text: it
  // sits on the plate inside the border band and paints no background. A
  // callout adds its leader (open polyline) + arrow at the tip.
  if (geometry.kind === 'text') {
    const nodes: RenderNode[] = [];
    if (geometry.callout)
      nodes.push(...calloutLeaderNodes(geometry, geometry.callout, strokeWidth));
    // The drawn path insets by half the stroke so the ink sits inside
    // `geometry.rect` with its outer edge on the rect — never straddling the
    // selection outline (the square/circle convention below). A tilted box
    // (the upright policy) draws as its rotated corner ring — the scene stays
    // plane-agnostic, so every framework painter gets the tilt for free (the
    // leader is page-space and never rotates).
    const rect = insetRect(geometry.rect, strokeWidth / 2);
    const rot = geometry.rot ?? 0;
    const point = rectCenter(geometry.rect);
    nodes.push(
      rot
        ? {
            kind: 'poly',
            points: rectCornerPoints(rect).map((corner) => rotatePoint(corner, point, rot)),
            closed: true,
          }
        : { kind: 'rect', rect },
    );
    return nodes;
  }
  if (geometry.kind === 'caret') {
    const rect = geometry.rect;
    const midX = rect.x + rect.width / 2;
    const bottom = rect.y + rect.height;
    const pathData = [
      `M ${rect.x} ${bottom}`,
      `C ${rect.x + rect.width * 0.27} ${bottom} ${midX} ${rect.y + rect.height * 0.56} ${midX} ${rect.y}`,
      `C ${midX} ${rect.y + rect.height * 0.56} ${rect.x + rect.width * 0.73} ${bottom} ${rect.x + rect.width} ${bottom}`,
      'Z',
    ].join(' ');
    return [{ kind: 'path', d: pathData }];
  }
  if (geometry.kind === 'box') return boxScene(geometry, strokeWidth, border);
  if (geometry.kind === 'line') {
    const nodes: RenderNode[] = [{ kind: 'line', a: geometry.a, b: geometry.b }];
    for (const seg of endingSegs(geometry))
      nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth));
    return nodes;
  }
  if (geometry.kind === 'poly') {
    // A closed poly takes a cloudy border: curls centred on the vertex path,
    // reaching outward — the same geometry PDFium bakes (no /RD, unlike boxes).
    if (geometry.closed && border?.kind === 'cloudy' && geometry.points.length >= 3) {
      return [{ kind: 'path', d: cloudyPolyPath(geometry.points, border.intensity, strokeWidth) }];
    }
    const nodes: RenderNode[] = [
      { kind: 'poly', points: geometry.points, closed: geometry.closed },
    ];
    for (const seg of endingSegs(geometry))
      nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth));
    return nodes;
  }
  if (geometry.kind === 'ink') {
    // each pen stroke is an open polyline (stroke-only; `scene` paints it)
    return geometry.strokes.map((stroke) => ({ kind: 'poly', points: stroke, closed: false }));
  }
  // markup fallback: a closed ring per quad (upper-left round to lower-left). The scene
  // painter renders these per-subtype; this keeps the generic scene correct
  // regardless, rotated text included.
  return geometry.quads.map((quad) => ({ kind: 'poly', points: quadRing(quad), closed: true }));
}
