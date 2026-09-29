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
import {
  DEG2RAD,
  MIN_SIZE,
  OPPOSITE_HANDLE,
  RECT_CURSOR,
  RECT_HANDLES,
  type RectHandle,
  expandRect,
  normalizeDeg,
  pointInPoly,
  rectCenter,
  rectContains,
  rectCornerPoints,
  rectHandlePoint,
  resizeRect,
  rotatePoint,
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
import {
  textBoxDrag,
  textBoxDrawnBounds,
  textBoxHandles,
  textBoxHit,
  textBoxRotateAbout,
  textBoxScaleAbout,
  textBoxScene,
  textBoxSelectionBounds,
  textBoxTranslate,
  textBoxUpright,
} from './shapes/text-box';
import {
  drawnStrokesOf,
  pointsBounds,
  pointsCorners,
  pointsDrag,
  pointsDrawnBounds,
  pointsHandles,
  pointsHit,
  pointsMiddleOf,
  pointsRotateAbout,
  pointsScaleAbout,
  pointsScene,
  pointsTranslate,
  pointsUpright,
  type PointsShape,
} from './shapes/points';
import type {
  Border,
  ModelGeometry,
  Handle,
  QuadRing,
  Rect,
  RenderNode,
  TextEndAnchor,
  Point,
} from './types';

/** Is the geometry of the points family: a line, polyline, polygon or ink? */
const isPoints = (geometry: ModelGeometry): geometry is PointsShape =>
  geometry.kind === 'line' || geometry.kind === 'poly' || geometry.kind === 'ink';

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
  if (geometry.kind === 'box' || geometry.kind === 'text-box' || isPoints(geometry))
    return geometry.rotation;
  if (geometry.kind === 'caret') return geometry.rot ?? 0;
  return 0;
}

/** A box's centre, or the mean of a shape's points. */
export function centroidOf(geometry: ModelGeometry): Point {
  if (geometry.kind === 'box' || geometry.kind === 'text-box') return rectCenter(geometry.box);
  if (geometry.kind === 'caret') return rectCenter(geometry.rect);
  const points = isPoints(geometry)
    ? drawnStrokesOf(geometry).flat()
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
  return isPoints(geometry) ? pointsMiddleOf(geometry) : centroidOf(geometry);
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
    (geometry.kind === 'text-box' && !geometry.calloutLine)
  );
}

/**
 * Rotate a geom by `deltaDeg` (clockwise) about `pivot`.
 *  - box (`box`/plain `text-box`): orbit the box centre about the pivot (a rigid
 *    translation of the unrotated box) and add the angle to its turn. When the
 *    pivot is the box centre this is a pure turn.
 *  - points (`line`/`poly`/`ink`): the middle of the upright points orbits the
 *    pivot and the turn grows, as for a box.
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
  if (geometry.kind === 'text-box') return textBoxRotateAbout(geometry, pivot, deltaDeg);
  if (isPoints(geometry)) return pointsRotateAbout(geometry, pivot, deltaDeg);
  return geometry;
}

/**
 * The size of the frame an engine-baked `/AP` is authored into: the unrotated
 * box for box kinds (rotation is stripped to `apRot` and re-applied at the
 * blit), the point bounds for vertex kinds (their points are the visual).
 * Position is deliberately absent — a translation never invalidates a raster.
 */
function apFrameSize(geometry: ModelGeometry): Size {
  if (geometry.kind === 'box' || geometry.kind === 'text-box')
    return { width: geometry.box.width, height: geometry.box.height };
  if (geometry.kind === 'caret')
    return { width: geometry.rect.width, height: geometry.rect.height };
  const rect = isPoints(geometry)
    ? pointsBounds(geometry)
    : unionRect(geometry.quads.flatMap(quadCorners));
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
 *  Points: turn back about `pivot` (the middle of the upright points by
 *  default, which only clears the turn). */
export function geomResetRotation(geometry: ModelGeometry, pivot?: Point): ModelGeometry {
  const rot = geomRotation(geometry);
  if (!rot) return geometry;
  if (geometry.kind === 'box') return { ...geometry, rotation: 0 };
  if (geometry.kind === 'text-box') return textBoxUpright(geometry);
  if (geometry.kind === 'caret') return { ...geometry, rot: 0 };
  if (isPoints(geometry)) return pointsUpright(geometry, pivot);
  return geometry;
}

/**
 * The oriented selection box (OBB) of a rotatable geom: four corners (in order
 * nw, ne, se, sw of the local box, transformed) + the angle. For a box this is
 * the box rotated about its centre; for a points shape it is the drawn bounds
 * of its upright points, turned about their middle — the snug tilted
 * rectangle. Returns null for non-rotatable kinds.
 */
export function obbFromGeom(
  geometry: ModelGeometry,
  strokeWidth: number,
  border?: Border,
): { corners: [Point, Point, Point, Point]; angle: number } | null {
  if (!isRotatableGeom(geometry)) return null;
  const rot = geomRotation(geometry);
  if (geometry.kind === 'box' || geometry.kind === 'text-box')
    return { corners: boxCorners(geometry), angle: rot };
  if (geometry.kind === 'caret') {
    const point = rectCenter(geometry.rect);
    const corners = rectCornerPoints(geometry.rect).map((corner) =>
      rotatePoint(corner, point, rot),
    );
    return { corners: corners as [Point, Point, Point, Point], angle: rot };
  }
  if (isPoints(geometry))
    return { corners: pointsCorners(geometry, strokeWidth, border), angle: rot };
  return null;
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
  if (geometry.kind === 'text-box') return textBoxScaleAbout(geometry, anchor, sx, sy);
  if (isPoints(geometry)) return pointsScaleAbout(geometry, anchor, sx, sy);
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
  if (geometry.kind === 'box') return boxDrawnBounds(geometry, strokeWidth, border);
  if (isPoints(geometry)) return pointsDrawnBounds(geometry, strokeWidth, border);
  if (geometry.kind === 'text-box') return textBoxDrawnBounds(geometry, strokeWidth);
  if (geometry.kind === 'caret') return geometry.rect;
  return expandRect(unionRect(geometry.quads.flatMap(quadCorners)), strokeWidth / 2);
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
  if (isPoints(geometry)) return pointsDrawnBounds(geometry, strokeWidth, border);
  if (geometry.kind === 'text-box') return textBoxSelectionBounds(geometry);
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

/* ── geom ops ─────────────────────────────────────────────────────────────── */

export function geomBounds(geometry: ModelGeometry): Rect {
  if (geometry.kind === 'box' || geometry.kind === 'text-box') return geometry.box;
  if (geometry.kind === 'caret') return geometry.rect;
  if (isPoints(geometry)) return pointsBounds(geometry);
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
  if (geometry.kind === 'text-box') return textBoxHit(geometry, point, margin, strokeWidth);
  if (isPoints(geometry)) return pointsHit(geometry, point, margin, filled, strokeWidth);
  // A caret is a solid hit target anywhere in its box (+ the click margin),
  // tested in the box's own frame.
  if (geometry.kind === 'caret') {
    const local = geometry.rot
      ? rotatePoint(point, rectCenter(geometry.rect), -geometry.rot)
      : point;
    return rectContains(expandRect(geometry.rect, margin), local);
  }
  // quads (markup): oriented per-line cells — hit anywhere inside any quad.
  // Quad rings are simple (non-self-intersecting) by construction, so the
  // generic point-in-poly test is exact for rotated text too.
  return geometry.quads.some((quad) => pointInQuad(point, quadRing(quad)));
}

export function geomHandles(geometry: ModelGeometry): Handle[] {
  if (geometry.kind === 'box') return boxHandles(geometry);
  if (geometry.kind === 'text-box') return textBoxHandles(geometry);
  if (isPoints(geometry)) return pointsHandles(geometry);
  return []; // markup: move only
}

export function geomTranslate(geometry: ModelGeometry, delta: Point): ModelGeometry {
  const mv = (vertex: Point): Point => ({ x: vertex.x + delta.x, y: vertex.y + delta.y });
  if (geometry.kind === 'box') return boxTranslate(geometry, delta);
  if (geometry.kind === 'text-box') return textBoxTranslate(geometry, delta);
  if (geometry.kind === 'caret')
    return {
      ...geometry,
      rect: { ...geometry.rect, x: geometry.rect.x + delta.x, y: geometry.rect.y + delta.y },
    };
  if (isPoints(geometry)) return pointsTranslate(geometry, delta);
  return { ...geometry, quads: geometry.quads.map((quad) => mapQuad(quad, mv)) };
}

export function geomDragHandle(geometry: ModelGeometry, handle: string, to: Point): ModelGeometry {
  if (geometry.kind === 'box') return boxResize(geometry, handle, to);
  if (geometry.kind === 'text-box') return textBoxDrag(geometry, handle, to);
  if (isPoints(geometry)) return pointsDrag(geometry, handle, to);
  return geometry;
}

export function geomScene(geometry: ModelGeometry, strokeWidth = 0, border?: Border): RenderNode[] {
  // A text box's box — its fill and its border — is the scene's, plain box and
  // callout alike, so the live view paints exactly what the AP generator
  // bakes. The framework's editable element owns only the text.
  if (geometry.kind === 'text-box') return textBoxScene(geometry, strokeWidth);
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
  if (isPoints(geometry)) return pointsScene(geometry, strokeWidth, border);
  // markup fallback: a closed ring per quad (upper-left round to lower-left). The scene
  // painter renders these per-subtype; this keeps the generic scene correct
  // regardless, rotated text included.
  return geometry.quads.map((quad) => ({ kind: 'poly', points: quadRing(quad), closed: true }));
}
