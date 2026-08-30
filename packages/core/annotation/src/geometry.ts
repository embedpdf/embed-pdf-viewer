/**
 * Pure content-space geometry, dispatched on the `Geom` union. This is the whole
 * per-kind surface: bounds, hit-testing (stroke + fill, with a configurable
 * margin), handles (with cursors), translate, handle-drag, and the dumb scene.
 * The PDF↔content bridge (crop-relative y-flip) is the only engine seam.
 */
import type { PdfPoint, PdfRect } from '@embedpdf/engine-core/runtime';
import {
  applyPoint,
  applyRect,
  invert,
  isQuarterTurn,
  pdfToContentMatrix,
  rotateAbout,
  textQuadPoints,
  textQuadRing,
  type Mat2D,
  type PageRotation,
  type PointIn,
  type RectIn,
  type Size,
  type TextQuad,
} from '@embedpdf/core-geometry';
import { cloudyBorderExtent, cloudyPath, cloudyPolyPath } from './cloudy';
import { endingNodes, endingPoints } from './endings';
import type {
  Border,
  Cursor,
  Geom,
  Handle,
  LineEnding,
  Quad,
  Rect,
  RenderNode,
  Style,
  TextEndAnchor,
  Vec,
} from './types';

const MIN_SIZE = 4;

/* ── rect handles ─────────────────────────────────────────────────────────── */

export type RectHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const RECT_HANDLES: RectHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const RECT_CURSOR: Record<RectHandle, Cursor> = {
  nw: 'nwse-resize',
  se: 'nwse-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
};
/** Each handle's compass direction (deg CW from north) on the unrotated box. */
const HANDLE_BASE_ANGLE: Record<RectHandle, number> = {
  n: 0,
  ne: 45,
  e: 90,
  se: 135,
  s: 180,
  sw: 225,
  w: 270,
  nw: 315,
};
/** The resize cursor per 45° compass sector (index = sector, 0 = north). */
const SECTOR_CURSORS: Cursor[] = [
  'ns-resize',
  'nesw-resize',
  'ew-resize',
  'nwse-resize',
  'ns-resize',
  'nesw-resize',
  'ew-resize',
  'nwse-resize',
];
/** The resize cursor for a handle on a box tilted by `rot` deg: rotate the
 *  handle's compass direction with the box and pick the nearest 45° sector.
 *  At `rot = 0` this reproduces {@link RECT_CURSOR} exactly. */
export const rotatedHandleCursor = (h: RectHandle, rot: number): Cursor =>
  SECTOR_CURSORS[Math.round(normalizeDeg(HANDLE_BASE_ANGLE[h] + rot) / 45) % 8];
const rectEdges = (h: RectHandle) => ({
  w: h === 'nw' || h === 'w' || h === 'sw',
  e: h === 'ne' || h === 'e' || h === 'se',
  n: h === 'nw' || h === 'n' || h === 'ne',
  s: h === 'sw' || h === 's' || h === 'se',
});
const rectHandlePoint = (r: Rect, h: RectHandle): Vec => {
  const e = rectEdges(h);
  return {
    x: e.w ? r.x : e.e ? r.x + r.width : r.x + r.width / 2,
    y: e.n ? r.y : e.s ? r.y + r.height : r.y + r.height / 2,
  };
};
function resizeRect(base: Rect, h: RectHandle, to: Vec): Rect {
  const e = rectEdges(h);
  let l = base.x;
  let r = base.x + base.width;
  let t = base.y;
  let b = base.y + base.height;
  if (e.w) l = to.x;
  if (e.e) r = to.x;
  if (e.n) t = to.y;
  if (e.s) b = to.y;
  return {
    x: Math.min(l, r),
    y: Math.min(t, b),
    width: Math.max(MIN_SIZE, Math.abs(r - l)),
    height: Math.max(MIN_SIZE, Math.abs(b - t)),
  };
}

/* ── small math ───────────────────────────────────────────────────────────── */

export const rectFromPoints = (a: Vec, b: Vec): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});
export const rectsIntersect = (a: Rect, b: Rect): boolean =>
  a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
const rectContains = (r: Rect, p: Vec): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Distance from point p to segment ab. */
function segDist(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
/** Even-odd point-in-polygon. */
function pointInPoly(p: Vec, pts: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}
const polyPoints = (geom: Extract<Geom, { t: 'poly' }>): Vec[] => geom.points;

export function unionRect(pts: Vec[]): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

const expandRect = (r: Rect, pad: number): Rect => ({
  x: r.x - pad,
  y: r.y - pad,
  width: r.width + 2 * pad,
  height: r.height + 2 * pad,
});

const rectCornerPoints = (r: Rect): Vec[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];

/* ── rotation ──────────────────────────────────────────────────────────────
 * Annotation rotation, layered on the generic `@embedpdf/core-geometry` affine
 * primitives (`rotateAbout`). Box kinds carry an UNROTATED `rect` + a `rot`
 * angle; vertex kinds carry already-rotated points + an ADVISORY `rot`. These
 * helpers know that split and compose the matrix builders — they never hand-roll
 * a rotation matrix. See `Geom` in types.ts.
 * ──────────────────────────────────────────────────────────────────────────── */

const DEG2RAD = Math.PI / 180;

/** How far (content units) the rotate knob hangs off the top edge of the box. */
export const ROTATE_KNOB_OFFSET = 24;

/** Fallback chrome geometry (content units) when the caller supplies none —
 *  the pre-settings behavior, so bare-core callers and tests stay stable. */
export const DEFAULT_CHROME_GEOM = {
  handleTol: 6,
  knobTol: 6,
  knobOffset: ROTATE_KNOB_OFFSET,
} as const;

/** Normalize degrees into `[0, 360)`. */
export const normalizeDeg = (d: number): number => ((d % 360) + 360) % 360;

/** A geom's applied rotation (deg), or 0 for the non-rotatable kinds. A
 *  caret's `rot` is AUTHORING metadata (its text's baseline tilt): reported
 *  here so the renderer and selection chrome follow it, while the caret's
 *  caps (not movable/resizable) keep every rotate gesture away from it. */
export function geomRotation(g: Geom): number {
  if (
    g.t === 'rect' ||
    g.t === 'line' ||
    g.t === 'poly' ||
    g.t === 'ink' ||
    g.t === 'text' ||
    g.t === 'caret'
  )
    return g.rot ?? 0;
  return 0;
}

const rectCenter = (r: Rect): Vec => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

const rotateAboutM = (pivot: Vec, deg: number): Mat2D<'content', 'content'> =>
  rotateAbout(pivot as PointIn<'content'>, deg * DEG2RAD);

/** Rotate one point about a pivot by `deg` (CW, content space). */
export const rotatePoint = (p: Vec, pivot: Vec, deg: number): Vec =>
  applyPoint(rotateAboutM(pivot, deg), p as PointIn<'content'>);

/**
 * The rotation PIVOT for a single shape: a box turns about its own `rect`
 * centre; a vertex shape about the CENTROID of its points (the mean). Rotating a
 * point set about its centroid leaves the centroid fixed, so the advisory `rot`
 * stays cleanly additive across gestures and reset is exact.
 */
export function centroidOf(g: Geom): Vec {
  if (g.t === 'rect' || g.t === 'text' || g.t === 'caret') return rectCenter(g.rect);
  if (g.t === 'line') return { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
  const pts = g.t === 'poly' ? g.points : g.t === 'ink' ? g.strokes.flat() : g.quads.flatMap(textQuadPoints);
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  const n = pts.length || 1;
  return { x: sx / n, y: sy / n };
}

/** Does the geometry carry a meaningful `rot` (an oriented local box exists)?
 *  ORIENTATION is a geometry fact; whether the USER may rotate is the separate
 *  `caps.rotatable` gate — a caret is oriented (it rides its text's tilt) yet
 *  offers no rotate gesture. */
export function isRotatableGeom(g: Geom): boolean {
  return (
    g.t === 'rect' ||
    g.t === 'line' ||
    g.t === 'poly' ||
    g.t === 'ink' ||
    g.t === 'caret' ||
    (g.t === 'text' && !g.callout)
  );
}

/**
 * Rotate a geom by `deltaDeg` (clockwise) about `pivot`.
 *  - BOX (`rect`/plain `text`): orbit the box centre about the pivot (a rigid
 *    translation of the unrotated `rect`) and add the angle to `rot`. When the
 *    pivot IS the box centre this is a pure `rot += delta`.
 *  - VERTEX (`line`/`poly`/`ink`): map every point through the rotation AND bump
 *    the advisory `rot` (the points stay the authoritative visual).
 * Kinds without a rotate VERB are returned unchanged: quads and callouts, and
 * also the caret — oriented (`isRotatableGeom`) but text-anchored, so its tilt
 * is authoring metadata that no gesture edits (`geomResetRotation` still
 * clears it).
 */
export function geomRotateAbout(g: Geom, pivot: Vec, deltaDeg: number): Geom {
  if (deltaDeg === 0) return g;
  const nextRot = normalizeDeg(geomRotation(g) + deltaDeg);
  if (g.t === 'rect') {
    const c = rotatePoint(rectCenter(g.rect), pivot, deltaDeg);
    return {
      ...g,
      rect: { ...g.rect, x: c.x - g.rect.width / 2, y: c.y - g.rect.height / 2 },
      rot: nextRot,
    };
  }
  if (g.t === 'text') {
    // The rotate GESTURE stays out of scope for callouts (no knob/orbit); the
    // box may still carry a creation-time `rot` from the upright policy.
    if (g.callout) return g;
    const c = rotatePoint(rectCenter(g.rect), pivot, deltaDeg);
    return {
      ...g,
      rect: { ...g.rect, x: c.x - g.rect.width / 2, y: c.y - g.rect.height / 2 },
      rot: nextRot,
    };
  }
  const rp = (p: Vec) => rotatePoint(p, pivot, deltaDeg);
  if (g.t === 'line') return { ...g, a: rp(g.a), b: rp(g.b), rot: nextRot };
  if (g.t === 'poly') return { ...g, points: g.points.map(rp), rot: nextRot };
  if (g.t === 'ink') return { ...g, strokes: g.strokes.map((s) => s.map(rp)), rot: nextRot };
  return g;
}

/**
 * The size of the frame an engine-baked `/AP` is authored into: the UNROTATED
 * box for box kinds (rotation is stripped to `apRot` and re-applied at the
 * blit), the point bounds for vertex kinds (their points ARE the visual).
 * Position is deliberately absent — a translation never invalidates a raster.
 */
function apFrameSize(g: Geom): Size {
  if (g.t === 'rect' || g.t === 'text' || g.t === 'caret')
    return { width: g.rect.width, height: g.rect.height };
  const pts =
    g.t === 'line'
      ? [g.a, g.b]
      : g.t === 'poly'
        ? g.points
        : g.t === 'ink'
          ? g.strokes.flat()
          : g.quads.flatMap(textQuadPoints);
  const b = unionRect(pts);
  return { width: b.width, height: b.height };
}

/**
 * Did an edit change the SIZE of the geometry's `/AP` authoring frame — i.e.
 * will the engine's re-bake produce NEW raster content? One rule for every
 * gesture, so the commit sites never enumerate kinds: a move/rotate preserves
 * the frame (false), a resize/scale changes it (true). The 0.01pt tolerance
 * absorbs float noise from the gesture math.
 */
export function apSizeChanged(before: Geom, after: Geom): boolean {
  const a = apFrameSize(before);
  const b = apFrameSize(after);
  return Math.abs(a.width - b.width) > 0.01 || Math.abs(a.height - b.height) > 0.01;
}

/** The AABB of `rect` rotated `deg` about its own centre. */
export function rotatedAabb(rect: Rect, deg: number): Rect {
  if (!deg) return rect;
  const c = rectCenter(rect);
  return unionRect(rectCornerPoints(rect).map((p) => rotatePoint(p, c, deg)));
}

/* ── upright placement (counter-rotating against the DISPLAY rotation) ────────
 * An `upright` tool commits `rot = -displayRotation` so the annotation reads
 * horizontally on the rotated page. These two helpers are the ONLY placement
 * math that rule needs; both are exact for quarter-turns and pure content-space
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
  const c = rectCenter(rect);
  return {
    x: c.x - rect.height / 2,
    y: c.y - rect.width / 2,
    width: rect.height,
    height: rect.width,
  };
}

/**
 * The unrotated content rect for a DEFAULT-SIZE upright box "placed at" a
 * point: positioned so that, after the upright counter-rotation, the box shows
 * `width`×`height` with its TOP-LEFT at `anchor` in the ROTATED view — the
 * same on-screen feel as the rotation-0 `{ x: anchor.x, y: anchor.y }` box at
 * every quarter-turn (a click-created free-text box always opens down-right of
 * the cursor as the author sees it). Derived by placing the box in the display
 * frame and pulling its AABB back through the quarter-turn; the page dims
 * cancel, so no page box is needed.
 */
export function uprightAnchoredRect(
  anchor: Vec,
  width: number,
  height: number,
  displayRotation: number,
): Rect {
  const r = normalizeDeg(displayRotation);
  const c: Vec =
    r === 90
      ? { x: anchor.x + height / 2, y: anchor.y - width / 2 }
      : r === 180
        ? { x: anchor.x - width / 2, y: anchor.y - height / 2 }
        : r === 270
          ? { x: anchor.x - height / 2, y: anchor.y + width / 2 }
          : { x: anchor.x + width / 2, y: anchor.y + height / 2 };
  return { x: c.x - width / 2, y: c.y - height / 2, width, height };
}

const clampScalar = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The LOGICAL (unrotated) content-space box for a stamp placed at `center`,
 * sized `desired` (points), fit onto the page and clamped fully within it —
 * the v2 rubber-stamp rule: keep the image's own size unless it would overflow
 * the page, then scale down (aspect preserved, never up) so it just fits.
 *
 * Under an upright quarter-turn the on-page FOOTPRINT is the box transposed
 * (w↔h), so BOTH the fit and the edge clamp use that footprint — a landscape
 * stamp uprighted onto a portrait page fits by its rotated silhouette, not its
 * logical box. The box centre and its footprint AABB centre coincide (rotation
 * is about the centre), so clamping one clamps the other.
 */
export function fitStampBox(center: Vec, desired: Size, page: Size, rotCW: number): Rect {
  const quarter = isQuarterTurn((normalizeDeg(rotCW) as PageRotation) ?? 0);
  // Footprint (AABB) dims for the desired size, before fitting.
  const fw0 = quarter ? desired.height : desired.width;
  const fh0 = quarter ? desired.width : desired.height;
  const s = Math.min(1, fw0 > 0 ? page.width / fw0 : 1, fh0 > 0 ? page.height / fh0 : 1);
  const width = desired.width * s;
  const height = desired.height * s;
  const fw = quarter ? height : width;
  const fh = quarter ? width : height;
  // Clamp the centre so the footprint stays fully on the page (the fit above
  // guarantees fw ≤ page.width and fh ≤ page.height, so the range is valid).
  const cx = clampScalar(center.x, fw / 2, page.width - fw / 2);
  const cy = clampScalar(center.y, fh / 2, page.height - fh / 2);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Reset a geom to its as-authored orientation (`rot → 0`). Box: drop `rot`.
 *  Vertex: spin the points by `-rot` about their centroid so they return to the
 *  orientation they were drawn at, in place. */
export function geomResetRotation(g: Geom): Geom {
  const rot = geomRotation(g);
  if (!rot) return g;
  if (g.t === 'rect' || g.t === 'text' || g.t === 'caret') return { ...g, rot: 0 };
  const c = centroidOf(g);
  const rotated = geomRotateAbout(g, c, -rot);
  // geomRotateAbout already set rot = normalize(rot - rot) = 0.
  return rotated;
}

/**
 * The oriented selection box (OBB) of a rotatable geom: four corners (in order
 * nw, ne, se, sw of the LOCAL box, transformed) + the angle. For a box this is
 * the `rect` rotated about its centre; for a vertex shape it is reconstructed
 * from the advisory `rot` — un-rotate the points to recover the as-authored
 * shape, take that tight local box, then rotate it back — giving the snug tilted
 * rectangle. Returns null for non-rotatable kinds.
 */
export function obbFromGeom(
  g: Geom,
  strokeWidth: number,
  border?: Border,
): { corners: [Vec, Vec, Vec, Vec]; angle: number } | null {
  if (!isRotatableGeom(g)) return null;
  const rot = geomRotation(g);
  if (g.t === 'rect' || g.t === 'text' || g.t === 'caret') {
    const c = rectCenter(g.rect);
    const corners = rectCornerPoints(g.rect).map((p) => rotatePoint(p, c, rot));
    return { corners: corners as [Vec, Vec, Vec, Vec], angle: rot };
  }
  // vertex: reconstruct the local (as-authored) box from rot about the centroid.
  const c = centroidOf(g);
  const unrotated = rot ? geomRotateAbout(g, c, -rot) : g;
  const localBox = selectionBounds(unrotated, strokeWidth, border);
  const corners = rectCornerPoints(localBox).map((p) => rotatePoint(p, c, rot));
  return { corners: corners as [Vec, Vec, Vec, Vec], angle: rot };
}

/* ── group (multi-target) scaling ─────────────────────────────────────────────
 * A multi-selection scales as one box about a fixed anchor (the opposite handle
 * corner/edge). Resize is ANISOTROPIC only when every member has `rot == 0`
 * (otherwise an off-axis scale would shear a rotated shape it can't represent —
 * so we fall back to a uniform scale). The iso/aniso choice is decided by the
 * caller (it needs the live selection); these helpers take the resolved factors.
 * ──────────────────────────────────────────────────────────────────────────── */

/** The 8 box resize handles (corner + edge, with cursors) of a plain rect — used
 *  for the multi-target group box. */
export function rectHandlesFor(r: Rect): Handle[] {
  return RECT_HANDLES.map((h) => ({ id: h, at: rectHandlePoint(r, h), cursor: RECT_CURSOR[h] }));
}

/** The fixed point of a group resize: the OPPOSITE handle's point on the box. */
export function groupResizeAnchor(base: Rect, handle: string): Vec {
  return rectHandlePoint(base, OPPOSITE_HANDLE[handle as RectHandle] ?? 'nw');
}

/**
 * The live group resize box for a drag. Anisotropic = the plain axis-aligned
 * `resizeRect`; isotropic = a uniform scale of `base` about the anchor by the
 * larger of the two drag ratios (so the preview matches the committed scale and
 * never shears a rotated member).
 */
export function groupResizeBox(base: Rect, handle: string, to: Vec, isotropic: boolean): Rect {
  const raw = resizeRect(base, handle as RectHandle, to);
  if (!isotropic) return raw;
  const sx = base.width > 0 ? raw.width / base.width : 1;
  const sy = base.height > 0 ? raw.height / base.height : 1;
  const s = Math.max(MIN_SIZE / Math.max(base.width, base.height, 1), Math.max(sx, sy));
  const anchor = groupResizeAnchor(base, handle);
  return {
    x: anchor.x + (base.x - anchor.x) * s,
    y: anchor.y + (base.y - anchor.y) * s,
    width: base.width * s,
    height: base.height * s,
  };
}

/** The (sx, sy) factors a `base`→`cur` group resize applied about its anchor. */
export function groupResizeFactors(base: Rect, cur: Rect): { sx: number; sy: number } {
  return {
    sx: base.width > 0 ? cur.width / base.width : 1,
    sy: base.height > 0 ? cur.height / base.height : 1,
  };
}

/**
 * Scale a geom about `anchor` by `(sx, sy)`. For a rotated box (iso scale, so
 * `sx === sy`) the unrotated `rect` is scaled about the anchor and `rot` is
 * preserved (a uniform scale commutes with rotation). For unrotated members
 * (the anisotropic case) every point/extent scales directly.
 */
export function geomScaleAbout(g: Geom, anchor: Vec, sx: number, sy: number): Geom {
  const sp = (p: Vec): Vec => ({
    x: anchor.x + (p.x - anchor.x) * sx,
    y: anchor.y + (p.y - anchor.y) * sy,
  });
  if (g.t === 'rect' || g.t === 'text') {
    if (g.t === 'text' && g.callout) return g;
    const c = sp(rectCenter(g.rect));
    const w = Math.max(MIN_SIZE, g.rect.width * Math.abs(sx));
    const h = Math.max(MIN_SIZE, g.rect.height * Math.abs(sy));
    return { ...g, rect: { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h } };
  }
  if (g.t === 'line') return { ...g, a: sp(g.a), b: sp(g.b) };
  if (g.t === 'poly') return { ...g, points: g.points.map(sp) };
  if (g.t === 'ink') return { ...g, strokes: g.strokes.map((s) => s.map(sp)) };
  if (g.t === 'caret') {
    const c = sp(rectCenter(g.rect));
    const w = Math.max(MIN_SIZE, g.rect.width * Math.abs(sx));
    const h = Math.max(MIN_SIZE, g.rect.height * Math.abs(sy));
    return { ...g, rect: { x: c.x - w / 2, y: c.y - h / 2, width: w, height: h } };
  }
  return g; // quads scale with their points
}

/** Where the rotate knob sits, given the OBB corners (nw, ne, se, sw) and the
 *  outward offset (content units). `from` is the top-edge midpoint the connector
 *  stalk anchors to; `at` is the grab dot, offset along the outward normal. */
export function rotateKnob(corners: [Vec, Vec, Vec, Vec], offset: number): { at: Vec; from: Vec } {
  const [nw, ne, , sw] = corners;
  const from = { x: (nw.x + ne.x) / 2, y: (nw.y + ne.y) / 2 };
  // outward normal = from the bottom edge toward the top edge (away from shape).
  const down = { x: sw.x - nw.x, y: sw.y - nw.y };
  const len = Math.hypot(down.x, down.y) || 1;
  const up = { x: -down.x / len, y: -down.y / len };
  return { at: { x: from.x + up.x * offset, y: from.y + up.y * offset }, from };
}

const insideRect = (r: Rect, p: Vec): boolean =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/**
 * The chord of `box` cut by the infinite line through `p` at `angleDeg` (CW,
 * y-down) — the full-bleed rotation guide: no magic lengths, the line simply
 * spans the page. Slab-clipped (Liang–Barsky); null when the line misses the
 * box entirely (a far-off-page pivot).
 */
export function chordThrough(box: Rect, p: Vec, angleDeg: number): { a: Vec; b: Vec } | null {
  const d = { x: Math.cos(angleDeg * DEG2RAD), y: Math.sin(angleDeg * DEG2RAD) };
  let tMin = -Infinity;
  let tMax = Infinity;
  for (const [dc, pc, lo, hi] of [
    [d.x, p.x, box.x, box.x + box.width],
    [d.y, p.y, box.y, box.y + box.height],
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
    a: { x: p.x + d.x * tMin, y: p.y + d.y * tMin },
    b: { x: p.x + d.x * tMax, y: p.y + d.y * tMax },
  };
}

/**
 * `rotateKnob` with a TOTAL page-bound placement policy: annotations, gestures
 * and chrome are all page-bound, so the grab dot must land inside `pageBox` —
 * off-page it is unreachable (the pointer dispatch resolves pages by
 * containment). Policy: top edge (the default) → FLIP to the bottom edge when
 * the stalk exits the page → CLAMP the top candidate inside (degenerate: the
 * selection spans ~the whole page; the knob may then overlap the shape, and
 * hit-testing checks it first so it stays grabbable). Both render (`chrome`)
 * and hit-test (`hitTest`) place the knob through THIS function, so what you
 * see is what you can grab — by construction. No `pageBox` → the raw knob.
 */
export function placeRotateKnob(
  corners: [Vec, Vec, Vec, Vec],
  offset: number,
  pageBox?: Rect,
): { at: Vec; from: Vec } {
  const top = rotateKnob(corners, offset);
  if (!pageBox || insideRect(pageBox, top.at)) return top;
  // FLIP: the same outward-normal math off the OPPOSITE (bottom) edge. On a
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
 * meets the box is DERIVED — never stored — so it tracks the box and knee.
 */

/** The box-edge midpoint the leader connects to: the side `ref` (the knee, else
 *  the tip) points toward, by horizontal/vertical dominance vs the box centre.
 *  With `rot` (a callout box tilted by the upright policy) the decision runs in
 *  the box's LOCAL frame and the midpoint lands back on the ROTATED edge — the
 *  edge the user actually sees. Mirror of v2's `computeCalloutConnectionPoint`. */
export function calloutConnection(box: Rect, ref: Vec, rot = 0): Vec {
  if (rot) {
    const c = rectCenter(box);
    return rotatePoint(calloutConnection(box, rotatePoint(ref, c, -rot)), c, rot);
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
 *  (its ROTATED footprint when the box carries `rot`). */
export function calloutLinePoints(g: Extract<Geom, { t: 'text' }>): Vec[] {
  const c = g.callout;
  if (!c) return [];
  const conn = calloutConnection(g.rect, c.knee ?? c.tip, g.rot ?? 0);
  return c.knee ? [c.tip, c.knee, conn] : [c.tip, conn];
}

/** The leader's single ending segment (arrow at the tip), pointing OUT of the
 *  body into the tip — so the arrowhead opens back along the leader. */
function calloutEndingSeg(pts: Vec[], ending: LineEnding): EndingSeg | null {
  if (pts.length < 2) return null;
  return {
    tip: pts[0],
    angle: Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x),
    ending,
  };
}

/** Shrink a rect inward by `pad` on every side, staying centred and never
 *  collapsing past zero (a thick stroke on a tiny shape just yields a 0-extent
 *  path rather than an inverted one). The inverse of `expandRect` for shapes. */
const insetRect = (r: Rect, pad: number): Rect => {
  const width = Math.max(0, r.width - 2 * pad);
  const height = Math.max(0, r.height - 2 * pad);
  return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height };
};

/**
 * The stored `rect` for a freshly-drawn shape, given the box the user dragged. A
 * cloudy border stores the OUTER box (dragged + cloud extent), so the dragged box
 * is its inner edge and the scallops bulge out to the stored box — just like a
 * solid shape, whose /Rect is the dragged box. So `g.rect` is ALWAYS the outer box;
 * the cloud-vs-solid difference lives only here, at creation.
 */
export function shapeRectFor(dragged: Rect, ellipse: boolean, style: Style): Rect {
  return style.border.kind === 'cloudy'
    ? expandRect(dragged, cloudyBorderExtent(style.border.intensity, style.strokeWidth, ellipse))
    : dragged;
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
 * the TRAILING baseline corner in READING direction (`advance` decides which
 * end — RTL carets land on the visual left), sitting on the baseline. The box
 * stays axis-aligned; use {@link caretGeomFromAnchor} for the tilt-carrying
 * geometry.
 */
export function caretRectFromAnchor(anchor: TextEndAnchor): Rect {
  const q = anchor.glyphQuad;
  const ink = Math.hypot(q.lowerStart.x - q.upperStart.x, q.lowerStart.y - q.upperStart.y);
  const size = Math.max(ink / 2, 1);
  const corner = anchor.advance > 0 ? q.lowerEnd : q.lowerStart;
  return { x: corner.x - size / 2, y: corner.y - size, width: size, height: size };
}

/** Rotations closer than ~0.05° to upright stay upright (float noise guard). */
const CARET_ROT_EPSILON = 0.05;

/**
 * Caret GEOMETRY for a text-edit anchor: the box-family pair — an UNROTATED
 * box whose centre sits half a caret-size ascent-ward of the trailing
 * baseline corner, plus `rot` = the text's baseline tilt (deg, CW in y-down
 * content space). Rotating the box about its centre by `rot` lands it
 * hugging the rotated baseline, symbol pointing at its text. For upright
 * anchors this degenerates EXACTLY to {@link caretRectFromAnchor} with no
 * `rot` key — the dominant case is byte-identical.
 */
export function caretGeomFromAnchor(anchor: TextEndAnchor): Extract<Geom, { t: 'caret' }> {
  const q = anchor.glyphQuad;
  const ink = Math.hypot(q.lowerStart.x - q.upperStart.x, q.lowerStart.y - q.upperStart.y);
  const size = Math.max(ink / 2, 1);
  const corner = anchor.advance > 0 ? q.lowerEnd : q.lowerStart;
  // The caret's own orientation follows the TEXT (the symbol points at its
  // line regardless of reading direction), so the tilt comes from the
  // baseline edge, not from `advance`.
  const bx = q.lowerEnd.x - q.lowerStart.x;
  const by = q.lowerEnd.y - q.lowerStart.y;
  const rot = Math.hypot(bx, by) > 0 ? normalizeDeg((Math.atan2(by, bx) * 180) / Math.PI) : 0;
  const upright = rot < CARET_ROT_EPSILON || rot > 360 - CARET_ROT_EPSILON;
  if (upright) {
    return {
      t: 'caret',
      rect: { x: corner.x - size / 2, y: corner.y - size, width: size, height: size },
    };
  }
  // Centre = trailing corner + (size/2) toward the ascent side.
  const ux = (q.upperStart.x - q.lowerStart.x) / ink;
  const uy = (q.upperStart.y - q.lowerStart.y) / ink;
  const cx = corner.x + (ux * size) / 2;
  const cy = corner.y + (uy * size) / 2;
  return {
    t: 'caret',
    rect: { x: cx - size / 2, y: cy - size / 2, width: size, height: size },
    rot,
  };
}

/** Map a TextQuad's corners through a point function (names ride along). */
function mapTextQuad(q: TextQuad, f: (p: Vec) => Vec): TextQuad {
  return {
    upperStart: f(q.upperStart),
    upperEnd: f(q.upperEnd),
    lowerStart: f(q.lowerStart),
    lowerEnd: f(q.lowerEnd),
  };
}

/* ── line endings ─────────────────────────────────────────────────────────────
 * The breathing room a stroked line/poly needs beyond its vertices, as a factor
 * of the stroke width (matches v2): the half-stroke under the centre-line plus a
 * little extra so caps/joins are never clipped by the engine `/Rect`.
 */
/** Miter limit shared by the bounds math AND the SVG renderer (`stroke-miterlimit`),
 *  so the computed box and the drawn stroke always agree on where a sharp join
 *  bevels instead of spiking. 10 = the PDF default (also what the baked /AP uses). */
export const MITER_LIMIT = 10;

/**
 * The outline points of a mitred, butt-capped polyline (open or closed) stroked
 * at `strokeWidth`: each segment's two side offsets (the straight extents + both
 * bevel corners) PLUS each interior join's OUTER miter tip — added only while the
 * join is within `MITER_LIMIT` (past that the renderer bevels it, and the segment
 * offsets already bound it). `unionRect` of these is the tight, ASYMMETRIC visual
 * box: a pointy join grows the box only on the side it actually spikes.
 *
 * Miter kinds only (line / polyline / polygon). Ink is round-capped/round-joined,
 * never spikes, and is bounded elsewhere by a plain `h` grow.
 */
function strokeOutlinePoints(pts: Vec[], closed: boolean, strokeWidth: number): Vec[] {
  const h = strokeWidth / 2;
  const n = pts.length;
  if (n === 0) return [];
  if (n === 1 || h === 0) return [...pts];

  const segCount = closed ? n : n - 1;
  const dir: Vec[] = [];
  const nrm: Vec[] = [];
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    dir.push({ x: ux, y: uy });
    nrm.push({ x: -uy, y: ux }); // a unit normal (either side; sign is re-picked below)
  }

  const out: Vec[] = [];
  // Segment side offsets at both ends — covers the straight extents, the butt
  // caps at open ends, and the bevel corners of any beveled join.
  for (let i = 0; i < segCount; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const nx = nrm[i].x * h;
    const ny = nrm[i].y * h;
    out.push({ x: a.x + nx, y: a.y + ny }, { x: a.x - nx, y: a.y - ny });
    out.push({ x: b.x + nx, y: b.y + ny }, { x: b.x - nx, y: b.y - ny });
  }

  // Interior joins: the outer miter tip, gated by the miter limit.
  const joinStart = closed ? 0 : 1;
  const joinEnd = closed ? n : n - 1; // vertices [joinStart, joinEnd)
  for (let v = joinStart; v < joinEnd; v++) {
    const inIdx = closed ? (v - 1 + n) % n : v - 1;
    const outIdx = closed ? v : v; // segment starting at v
    const a = dir[inIdx]; // prev -> v
    const b = dir[outIdx]; // v -> next
    const n1 = nrm[inIdx];
    const n2 = nrm[outIdx];
    // Outer bisector direction: opposite the interior bisector `b - a`.
    const bx = a.x - b.x;
    const by = a.y - b.y;
    if (Math.hypot(bx, by) < 1e-9) continue; // straight run: no spike beyond the offsets
    let mhx = n1.x + n2.x;
    let mhy = n1.y + n2.y;
    const ml = Math.hypot(mhx, mhy);
    if (ml < 1e-9) continue; // exact hairpin: renderer bevels
    mhx /= ml;
    mhy /= ml;
    if (mhx * bx + mhy * by < 0) {
      mhx = -mhx; // point the miter unit vector to the OUTER side
      mhy = -mhy;
    }
    const cosHalf = Math.abs(mhx * n1.x + mhy * n1.y); // cos(deviation/2)
    if (cosHalf < 1e-9) continue;
    const miterLen = h / cosHalf;
    if (miterLen > MITER_LIMIT * h) continue; // too sharp: renderer bevels → offsets bound it
    const V = pts[v];
    out.push({ x: V.x + mhx * miterLen, y: V.y + mhy * miterLen });
  }
  return out;
}

type EndingSeg = { tip: Vec; angle: number; ending: LineEnding | undefined };

/** The start/end tips of a line / open poly, each with the segment angle pointing
 *  OUT of the body into the tip (so an arrowhead opens back toward the line). */
function endingSegs(g: Geom): EndingSeg[] {
  if (g.t === 'line' && g.ends) {
    return [
      { tip: g.a, angle: Math.atan2(g.a.y - g.b.y, g.a.x - g.b.x), ending: g.ends.start },
      { tip: g.b, angle: Math.atan2(g.b.y - g.a.y, g.b.x - g.a.x), ending: g.ends.end },
    ];
  }
  if (g.t === 'poly' && !g.closed && g.ends && g.points.length >= 2) {
    const p = g.points;
    const n = p.length;
    return [
      { tip: p[0], angle: Math.atan2(p[0].y - p[1].y, p[0].x - p[1].x), ending: g.ends.start },
      {
        tip: p[n - 1],
        angle: Math.atan2(p[n - 1].y - p[n - 2].y, p[n - 1].x - p[n - 2].x),
        ending: g.ends.end,
      },
    ];
  }
  return [];
}

/**
 * A geom's VISUAL bounds: the rect that encloses the drawn appearance, so the
 * baked /AP is never clipped and the selection outline wraps exactly what's drawn.
 *
 * A shape's `rect` IS its visual box (the PDF /Rect): solid/dashed strokes draw
 * inside it, and a cloudy border's scallops also inset back into it (the dragged
 * inner edge sits `/RD` in from it — see `shapeRectFor`). So growing the stroke or
 * the cloud thickens inward, never spilling past the handles. Lines / polylines /
 * ink have no box, so they expand by the stroke (+ endings) — the SAME math feeds
 * `geomScene`, so the visual box and what's drawn always agree.
 *
 * `border` matters for ONE case: a CLOSED poly with a cloudy border, whose curls
 * are centred on the vertex path and reach OUTWARD (there is no outer box to
 * inset into) — the bounds grow by the cloud extent, and the engine `/Rect`
 * (via `geomPdfBounds`) grows with them so the baked scallops are never clipped.
 */
export function geomVisualBounds(g: Geom, strokeWidth: number, border?: Border): Rect {
  if (g.t === 'poly' && g.closed && border?.kind === 'cloudy') {
    // Corner curls are arcs of the cloud radius centred at the vertices, and the
    // stroke straddles them — so ink reaches radius + strokeWidth/2 beyond the
    // vertex hull on every side: exactly `cloudyBorderExtent`.
    return expandRect(
      unionRect(g.points),
      cloudyBorderExtent(border.intensity, strokeWidth, false),
    );
  }
  if (g.t === 'text' && g.callout) {
    // The overall /Rect: the union of the text box (its ROTATED corners when the
    // box carries an upright tilt), the leader points, and the arrow-ending
    // polygon at the tip (same ending math as line/poly).
    const pts = calloutLinePoints(g);
    const seg = calloutEndingSeg(pts, g.callout.ending);
    const rot = g.rot ?? 0;
    const c = rectCenter(g.rect);
    const corners = rectCornerPoints(g.rect).map((p) => (rot ? rotatePoint(p, c, rot) : p));
    const all = [...corners, ...pts];
    if (seg) all.push(...endingPoints(seg.tip, seg.angle, seg.ending, strokeWidth));
    return expandRect(unionRect(all), strokeWidth / 2);
  }
  if (g.t === 'rect' || g.t === 'text' || g.t === 'caret') return g.rect;
  if (g.t === 'quads') return expandRect(unionRect(g.quads.flatMap(textQuadPoints)), strokeWidth / 2);
  // Ink is round-capped/round-joined: it never spikes, so a plain `h` grow of the
  // freehand hull is exact — left as-is (the freehand look must not change).
  if (g.t === 'ink') return expandRect(unionRect(g.strokes.flat()), strokeWidth / 2);
  // Line / polyline / polygon: the miter kinds. Wrap the ACTUAL stroke outline
  // (per-join, asymmetric) instead of a flat pad — for the body AND each ending,
  // so a mitred arrowhead tip is enclosed exactly (not under-covered by a flat h).
  const raw = g.t === 'line' ? [g.a, g.b] : g.points;
  const closed = g.t === 'poly' && g.closed;
  const pts = strokeOutlinePoints(raw, closed, strokeWidth);
  for (const seg of endingSegs(g)) {
    for (const node of endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth)) {
      if (node.kind === 'poly') {
        // arrowheads / diamonds / squares are stroked polys: their sharp corners
        // miter exactly like the body, so wrap the real outline (tip included).
        pts.push(...strokeOutlinePoints(node.points, node.closed, strokeWidth));
      } else if (node.kind === 'ellipse') {
        // a stroked ellipse (circle ending) grows uniformly by h — no miters.
        pts.push(...rectCornerPoints(expandRect(node.rect, strokeWidth / 2)));
      }
    }
  }
  return unionRect(pts);
}

/**
 * The rect the SELECTION wraps — and the region a SELECTED annotation can be grabbed
 * from. Centre-line geometries (line / polyline / polygon / ink) straddle their path,
 * so this is their VISUAL bounds (the join-aware stroke outline + endings) — a
 * polygon's outline wraps its stroke exactly like a polyline. Box kinds (square /
 * circle / free-text) sit tight on their `rect` (their stroke draws INSIDE the box,
 * so the 8 resize handles land on the corners). The chrome outline AND the selected
 * hit-test both call this, so what you see highlighted is exactly what you can grab —
 * they can never drift.
 */
export function selectionBounds(g: Geom, strokeWidth: number, border?: Border): Rect {
  if (g.t === 'line' || g.t === 'ink' || g.t === 'poly')
    return geomVisualBounds(g, strokeWidth, border);
  // A callout's tilted text box (the upright policy): the selection wraps the box
  // the user SEES — its rotated footprint. Exact for the quarter-turns upright
  // produces (the footprint stays axis-aligned), so outline and handles agree.
  if (g.t === 'text' && g.callout && (g.rot ?? 0) !== 0) return rotatedAabb(g.rect, g.rot!);
  return geomBounds(g);
}

/**
 * The four corners of the ORIENTED selection box — the SAME quad `chrome` draws.
 * For a rotatable kind this is the OBB (the tilted box, from `obbFromGeom`); at
 * `rot == 0` those are just the axis-aligned corners of `selectionBounds`, and
 * for non-rotatable kinds (markup quads, callouts) it falls back to the rect
 * corners. The grab region, the floating-menu anchor and the multi/group union
 * all consume this, so what you can grab / where the menu sits never drifts from
 * the outline you see.
 */
export function selectionQuad(g: Geom, strokeWidth: number, border?: Border): [Vec, Vec, Vec, Vec] {
  const obb = obbFromGeom(g, strokeWidth, border);
  if (obb) return obb.corners;
  return rectCornerPoints(selectionBounds(g, strokeWidth, border)) as [Vec, Vec, Vec, Vec];
}

/** Is the point inside the (convex) selection quad? Even-odd ring test. */
export const pointInQuad = (p: Vec, quad: [Vec, Vec, Vec, Vec]): boolean => pointInPoly(p, quad);

/**
 * Does the (convex) selection quad intersect an axis-aligned rect? Separating
 * axis test on the only four candidate axes — the rect's x/y plus the quad's
 * two edge normals; a gap on any axis proves disjoint, otherwise they overlap
 * (touching counts). This is the marquee's predicate: it must catch a tilted
 * shape by the ORIENTED box that is actually drawn — the AABB of that quad has
 * empty corners covering most of the unrotated footprint, so testing it selects
 * shapes the marquee never touched. At `rot 0` the quad is axis-aligned and
 * this degenerates to exactly `rectsIntersect`.
 */
export function quadIntersectsRect(quad: [Vec, Vec, Vec, Vec], r: Rect): boolean {
  const rectPts = rectCornerPoints(r);
  const axes: Vec[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -(quad[1].y - quad[0].y), y: quad[1].x - quad[0].x },
    { x: -(quad[3].y - quad[0].y), y: quad[3].x - quad[0].x },
  ];
  for (const ax of axes) {
    if (Math.abs(ax.x) < 1e-12 && Math.abs(ax.y) < 1e-12) continue; // degenerate edge
    let qLo = Infinity;
    let qHi = -Infinity;
    for (const p of quad) {
      const d = p.x * ax.x + p.y * ax.y;
      qLo = Math.min(qLo, d);
      qHi = Math.max(qHi, d);
    }
    let rLo = Infinity;
    let rHi = -Infinity;
    for (const p of rectPts) {
      const d = p.x * ax.x + p.y * ax.y;
      rLo = Math.min(rLo, d);
      rHi = Math.max(rHi, d);
    }
    if (qHi < rLo || rHi < qLo) return false; // separated on this axis
  }
  return true;
}

/**
 * The centre of the ORIENTED selection box — the middle of the rect you see.
 * For box kinds this is the rect centre (so squares/circles are unchanged); for
 * vertex kinds it is the OBB centre, so rotation spins the shape in place rather
 * than swinging it about the off-centre vertex mean (`centroidOf`).
 */
export function selectionCenter(g: Geom, strokeWidth: number): Vec {
  const q = selectionQuad(g, strokeWidth);
  return {
    x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
    y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4,
  };
}

/**
 * Is the content point ON a line/poly's drawn ENDINGS — so an arrowhead is as
 * clickable as the stroke. Uses the SAME ending nodes the renderer draws: a closed
 * shape (closed arrow, circle, square, diamond) hits inside OR near its edge; an
 * open one (open arrow, butt, slash) hits near its stroke. `tol` is the stroke
 * band already widened by the hit margin.
 */
function endingNodesHit(nodes: RenderNode[], p: Vec, tol: number): boolean {
  for (const node of nodes) {
    if (node.kind === 'ellipse') {
      const r = node.rect;
      const rx = r.width / 2;
      const ry = r.height / 2;
      if (rx <= 0 || ry <= 0) continue;
      const nx = (p.x - (r.x + rx)) / rx;
      const ny = (p.y - (r.y + ry)) / ry;
      if (Math.hypot(nx, ny) <= 1 + tol / Math.min(rx, ry)) return true; // filled disc + band
    } else if (node.kind === 'poly') {
      const pts = node.points;
      for (let i = 0; i < pts.length - 1; i++)
        if (segDist(p, pts[i], pts[i + 1]) <= tol) return true;
      if (node.closed) {
        if (pts.length > 2 && segDist(p, pts[pts.length - 1], pts[0]) <= tol) return true;
        if (pointInPoly(p, pts)) return true; // filled head interior
      }
    }
  }
  return false;
}

function endingHit(g: Geom, p: Vec, tol: number, strokeWidth: number): boolean {
  for (const seg of endingSegs(g))
    if (endingNodesHit(endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth), p, tol))
      return true;
  return false;
}

/* ── geom ops ─────────────────────────────────────────────────────────────── */

export function geomBounds(g: Geom): Rect {
  if (g.t === 'rect' || g.t === 'text' || g.t === 'caret') return g.rect;
  if (g.t === 'line') return rectFromPoints(g.a, g.b);
  if (g.t === 'poly') return unionRect(g.points);
  if (g.t === 'ink') return unionRect(g.strokes.flat());
  return unionRect(g.quads.flatMap(textQuadPoints));
}

/**
 * Is the content point ON the annotation: within `margin` of the stroke, or
 * inside the fill (when `filled`). The stroke band widens with the stroke width.
 *
 * A shape's stroke is drawn INSIDE its box, centred on `insetRect(rect, sw/2)`
 * (see `geomScene`), so the clickable band follows that inset centre-line — not
 * the box edge. The fill still reaches the box. (Cloudy scallops aren't modelled
 * here; with their typically thin stroke the inset is sub-pixel, so this matches.)
 */
export function geomHit(
  g: Geom,
  p: Vec,
  margin: number,
  filled: boolean,
  strokeWidth: number,
): boolean {
  const tol = margin + strokeWidth / 2;
  // A rotated box stores its UNROTATED `rect`; inverse-rotate the pointer into
  // that local frame and run the normal axis-aligned tests. Vertex kinds carry
  // already-rotated points, so they hit-test directly (rot is advisory). A
  // callout is COMPOUND: only its box rotates (the leader is page-space), so the
  // inverse rotation applies to the box test alone — see the text branch below.
  if (
    (g.t === 'rect' || g.t === 'caret' || (g.t === 'text' && !g.callout)) &&
    (g.rot ?? 0) !== 0
  ) {
    p = rotatePoint(p, rectCenter(g.rect), -(g.rot ?? 0));
  }
  // A text box is a solid hit target anywhere inside it (+ the click margin).
  if (g.t === 'caret') return rectContains(expandRect(g.rect, margin), p);
  if (g.t === 'text') {
    // Box test in the box's LOCAL frame (a tilted callout box); leader/arrow
    // tests in the PAGE frame (their points are already where they're drawn).
    const rot = g.callout ? (g.rot ?? 0) : 0;
    const pBox = rot ? rotatePoint(p, rectCenter(g.rect), -rot) : p;
    if (rectContains(expandRect(g.rect, margin), pBox)) return true;
    if (g.callout) {
      const pts = calloutLinePoints(g);
      for (let i = 0; i < pts.length - 1; i++)
        if (segDist(p, pts[i], pts[i + 1]) <= tol) return true;
      const seg = calloutEndingSeg(pts, g.callout.ending);
      if (seg && endingNodesHit(endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth), p, tol))
        return true;
    }
    return false;
  }
  if (g.t === 'rect') {
    const r = g.rect;
    if (g.ellipse) {
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const orx = r.width / 2; // outer (box) radii — the fill reaches here
      const ory = r.height / 2;
      if (orx <= 0 || ory <= 0) return false;
      if (filled && Math.hypot((p.x - cx) / orx, (p.y - cy) / ory) <= 1) return true;
      // stroke band centred on the inset path (its outer edge sits on the box)
      const rx = Math.max(0.01, orx - strokeWidth / 2);
      const ry = Math.max(0.01, ory - strokeWidth / 2);
      const d = Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
      const band = tol / Math.min(rx, ry); // approximate normalized stroke band
      return Math.abs(d - 1) <= band;
    }
    if (filled && rectContains(r, p)) return true;
    // near any of the 4 edges of the inset (drawn) rectangle
    const c = insetRect(r, strokeWidth / 2);
    const edges: [Vec, Vec][] = [
      [
        { x: c.x, y: c.y },
        { x: c.x + c.width, y: c.y },
      ],
      [
        { x: c.x + c.width, y: c.y },
        { x: c.x + c.width, y: c.y + c.height },
      ],
      [
        { x: c.x + c.width, y: c.y + c.height },
        { x: c.x, y: c.y + c.height },
      ],
      [
        { x: c.x, y: c.y + c.height },
        { x: c.x, y: c.y },
      ],
    ];
    return edges.some(([a, b]) => segDist(p, a, b) <= tol);
  }
  if (g.t === 'line') return segDist(p, g.a, g.b) <= tol || endingHit(g, p, tol, strokeWidth);
  if (g.t === 'poly') {
    if (filled && g.closed && pointInPoly(p, g.points)) return true;
    const pts = g.points;
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) if (segDist(p, pts[i], pts[i + 1]) <= tol) return true;
    if (g.closed && n > 2 && segDist(p, pts[n - 1], pts[0]) <= tol) return true;
    return endingHit(g, p, tol, strokeWidth);
  }
  if (g.t === 'ink') {
    // near any segment of any stroke (ink is stroke-only, never filled)
    for (const stroke of g.strokes)
      for (let i = 0; i < stroke.length - 1; i++)
        if (segDist(p, stroke[i], stroke[i + 1]) <= tol) return true;
    return false;
  }
  // quads (markup): oriented per-line cells — hit anywhere inside any quad.
  // TextQuad rings are simple (non-self-intersecting) by construction, so the
  // generic point-in-poly test is exact for rotated text too.
  return g.quads.some((q) => pointInQuad(p, textQuadRing(q)));
}

export function geomHandles(g: Geom): Handle[] {
  if (g.t === 'rect' || g.t === 'text') {
    const rot = g.rot ?? 0;
    const c = rectCenter(g.rect);
    const handles: Handle[] = RECT_HANDLES.map((h) => ({
      id: h,
      // box handles sit on the UNROTATED rect; rotate each into place so they
      // ride the tilted box. The cursor rotates WITH the handle (the visually
      // right-edge handle of a 90°-tilted box resizes horizontally).
      at: rot ? rotatePoint(rectHandlePoint(g.rect, h), c, rot) : rectHandlePoint(g.rect, h),
      cursor: rotatedHandleCursor(h, rot),
    }));
    // A callout adds vertex handles for the leader tip and (if present) knee, so
    // the called-out point and the elbow can be dragged independently of the box.
    if (g.t === 'text' && g.callout) {
      handles.push({ id: 'callout-tip', at: g.callout.tip, cursor: 'crosshair' });
      if (g.callout.knee)
        handles.push({ id: 'callout-knee', at: g.callout.knee, cursor: 'crosshair' });
    }
    return handles;
  }
  if (g.t === 'line') {
    return [
      { id: 'v0', at: g.a, cursor: 'crosshair' },
      { id: 'v1', at: g.b, cursor: 'crosshair' },
    ];
  }
  if (g.t === 'poly') {
    return g.points.map((at, i) => ({ id: `v${i}`, at, cursor: 'crosshair' }));
  }
  return []; // markup: move only
}

export function geomTranslate(g: Geom, d: Vec): Geom {
  const mv = (p: Vec): Vec => ({ x: p.x + d.x, y: p.y + d.y });
  if (g.t === 'text') {
    const rect = { ...g.rect, x: g.rect.x + d.x, y: g.rect.y + d.y };
    if (!g.callout) return { ...g, rect };
    return {
      ...g,
      rect,
      callout: {
        ...g.callout,
        tip: mv(g.callout.tip),
        knee: g.callout.knee ? mv(g.callout.knee) : undefined,
      },
    };
  }
  if (g.t === 'rect' || g.t === 'caret')
    return { ...g, rect: { ...g.rect, x: g.rect.x + d.x, y: g.rect.y + d.y } };
  if (g.t === 'line') return { ...g, a: mv(g.a), b: mv(g.b) };
  if (g.t === 'poly') return { ...g, points: g.points.map(mv) };
  if (g.t === 'ink') return { ...g, strokes: g.strokes.map((s) => s.map(mv)) };
  return { ...g, quads: g.quads.map((q) => mapTextQuad(q, mv)) };
}

const OPPOSITE_HANDLE: Record<RectHandle, RectHandle> = {
  nw: 'se',
  ne: 'sw',
  se: 'nw',
  sw: 'ne',
  n: 's',
  s: 'n',
  e: 'w',
  w: 'e',
};

/**
 * Resize a ROTATED box by `handle`, keeping the opposite corner/edge fixed in
 * WORLD space. The pointer is mapped into the box's local (unrotated) frame, the
 * axis-aligned `resizeRect` runs there, then the new box is repositioned so the
 * anchor (the opposite handle's point) lands back where it was — and the box
 * still rotates about its OWN centre. With `rot === 0` this is exactly the plain
 * `resizeRect`.
 */
function resizeRotatedRect(base: Rect, rot: number, handle: RectHandle, to: Vec): Rect {
  if (!rot) return resizeRect(base, handle, to);
  const c0 = rectCenter(base);
  const localTo = rotatePoint(to, c0, -rot);
  const next = resizeRect(base, handle, localTo);
  const anchorLocal = rectHandlePoint(base, OPPOSITE_HANDLE[handle]);
  const anchorWorld = rotatePoint(anchorLocal, c0, rot);
  const nextCenterLocal = rectCenter(next);
  // offset of the anchor from the new centre, in the local frame; rotate it to
  // world orientation and place the new centre so the anchor stays put.
  const offX = anchorLocal.x - nextCenterLocal.x;
  const offY = anchorLocal.y - nextCenterLocal.y;
  const rad = rot * DEG2RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const rOffX = cos * offX - sin * offY;
  const rOffY = sin * offX + cos * offY;
  const cx = anchorWorld.x - rOffX;
  const cy = anchorWorld.y - rOffY;
  return {
    x: cx - next.width / 2,
    y: cy - next.height / 2,
    width: next.width,
    height: next.height,
  };
}

export function geomDragHandle(g: Geom, handle: string, to: Vec): Geom {
  if (g.t === 'text') {
    if (handle === 'callout-tip' && g.callout) return { ...g, callout: { ...g.callout, tip: to } };
    if (handle === 'callout-knee' && g.callout)
      return { ...g, callout: { ...g.callout, knee: to } };
    return { ...g, rect: resizeRotatedRect(g.rect, g.rot ?? 0, handle as RectHandle, to) };
  }
  if (g.t === 'rect')
    return { ...g, rect: resizeRotatedRect(g.rect, g.rot ?? 0, handle as RectHandle, to) };
  if (g.t === 'line') return handle === 'v0' ? { ...g, a: to } : { ...g, b: to };
  if (g.t === 'poly') {
    const i = Number(handle.slice(1));
    if (!Number.isInteger(i) || i < 0 || i >= g.points.length) return g;
    const points = g.points.slice();
    points[i] = to;
    return { ...g, points };
  }
  return g;
}

export function geomScene(g: Geom, strokeWidth = 0, border?: Border): RenderNode[] {
  // A plain text box draws no vector nodes — the framework renders its editable
  // element. A callout still draws its leader (open polyline) + arrow at the tip,
  // plus a stroke-only box border (the DOM owns the text + background).
  if (g.t === 'text') {
    if (!g.callout) return [];
    const pts = [...calloutLinePoints(g)];
    // Mirror the AP generator's `adjusted_conn`: extend the connection point
    // under the box border by half the stroke, so the leader meets the border
    // ink without an angular gap at the box edge.
    if (strokeWidth > 0 && pts.length >= 2) {
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const dx = last.x - prev.x;
      const dy = last.y - prev.y;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        pts[pts.length - 1] = {
          x: last.x + (dx / len) * (strokeWidth / 2),
          y: last.y + (dy / len) * (strokeWidth / 2),
        };
      }
    }
    const nodes: RenderNode[] = [{ kind: 'poly', points: pts, closed: false }];
    const seg = calloutEndingSeg(pts, g.callout.ending);
    if (seg) nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth));
    if (strokeWidth > 0) {
      // The box border mirrors the AP generator (and the square/circle
      // convention below): the drawn path insets by half the stroke so the
      // ink sits INSIDE `g.rect` with its outer edge ON the rect — never
      // straddling the selection outline.
      const r = insetRect(g.rect, strokeWidth / 2);
      // A tilted box (the upright policy) draws as its rotated corner ring —
      // the scene stays plane-agnostic, so every framework painter gets the
      // tilt for free (the leader above is page-space and never rotates).
      const rot = g.rot ?? 0;
      const c = rectCenter(g.rect);
      nodes.push(
        rot
          ? {
              kind: 'poly',
              points: rectCornerPoints(r).map((p) => rotatePoint(p, c, rot)),
              closed: true,
            }
          : { kind: 'rect', rect: r },
      );
    }
    return nodes;
  }
  if (g.t === 'caret') {
    const r = g.rect;
    const midX = r.x + r.width / 2;
    const bottom = r.y + r.height;
    const d = [
      `M ${r.x} ${bottom}`,
      `C ${r.x + r.width * 0.27} ${bottom} ${midX} ${r.y + r.height * 0.56} ${midX} ${r.y}`,
      `C ${midX} ${r.y + r.height * 0.56} ${r.x + r.width * 0.73} ${bottom} ${r.x + r.width} ${bottom}`,
      'Z',
    ].join(' ');
    return [{ kind: 'path', d }];
  }
  if (g.t === 'rect') {
    // A cloudy border's scallops inset back into `g.rect` (the OUTER box): the troughs
    // land at the dragged inner edge (`g.rect` − extent) and the peaks on `g.rect`.
    // Only drawn when the box can hold them — a box smaller than 2× the inset (e.g.
    // a 0-drag, or after cranking intensity) falls through to the plain outline.
    if (border?.kind === 'cloudy') {
      const inset = cloudyBorderExtent(border.intensity, strokeWidth, g.ellipse);
      if (g.rect.width > 2 * inset && g.rect.height > 2 * inset) {
        return [{ kind: 'path', d: cloudyPath(g.rect, g.ellipse, border.intensity, strokeWidth) }];
      }
    }
    // Otherwise the stroke sits INSIDE the box: inset the drawn path by half the
    // stroke so its outer edge lands on `g.rect`, not straddling it.
    const r = insetRect(g.rect, strokeWidth / 2);
    return [g.ellipse ? { kind: 'ellipse', rect: r } : { kind: 'rect', rect: r }];
  }
  if (g.t === 'line') {
    const nodes: RenderNode[] = [{ kind: 'line', a: g.a, b: g.b }];
    for (const seg of endingSegs(g))
      nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth));
    return nodes;
  }
  if (g.t === 'poly') {
    // A closed poly takes a cloudy border: curls centred on the vertex path,
    // reaching outward — the same geometry PDFium bakes (no /RD, unlike boxes).
    if (g.closed && border?.kind === 'cloudy' && g.points.length >= 3) {
      return [{ kind: 'path', d: cloudyPolyPath(g.points, border.intensity, strokeWidth) }];
    }
    const nodes: RenderNode[] = [{ kind: 'poly', points: g.points, closed: g.closed }];
    for (const seg of endingSegs(g))
      nodes.push(...endingNodes(seg.tip, seg.angle, seg.ending, strokeWidth));
    return nodes;
  }
  if (g.t === 'ink') {
    // each pen stroke is an open polyline (stroke-only; `scene` paints it)
    return g.strokes.map((stroke) => ({ kind: 'poly', points: stroke, closed: false }));
  }
  // markup fallback: a closed ring per quad (US → UE → LE → LS). The scene
  // painter renders these per-subtype; this keeps the generic scene correct
  // regardless, rotated text included.
  return g.quads.map((q) => ({ kind: 'poly', points: textQuadRing(q), closed: true }));
}

/* ── PDF ↔ content bridge ─────────────────────────────────────────────────────
 * The ONE engine seam: PDF user space (y-up, crop bottom-left) ↔ content space
 * (y-down, crop top-left). The y-flip itself lives in `@embedpdf/core-geometry`
 * (`pdfToContentMatrix`) and is applied through its generic Mat2D primitives, so
 * this file never hand-rolls the rule. The only local work is bridging the
 * engine's edge-based `PdfRect` to geometry's corner+extent `RectIn`.
 * ──────────────────────────────────────────────────────────────────────────── */

const pdfRectToCorner = (r: PdfRect): RectIn<'pdf'> =>
  ({ x: r.left, y: r.bottom, width: r.right - r.left, height: r.top - r.bottom }) as RectIn<'pdf'>;
const cornerToPdfRect = (r: RectIn<'pdf'>): PdfRect => ({
  left: r.x,
  bottom: r.y,
  right: r.x + r.width,
  top: r.y + r.height,
});

export const pdfToContentPoint = (p: PdfPoint, crop: PdfRect): Vec =>
  applyPoint(pdfToContentMatrix(crop), p as PointIn<'pdf'>);
export const contentToPdfPoint = (p: Vec, crop: PdfRect): PdfPoint =>
  applyPoint(invert(pdfToContentMatrix(crop)), p as PointIn<'content'>);
export const pdfToContentRect = (pdf: PdfRect, crop: PdfRect): Rect =>
  applyRect(pdfToContentMatrix(crop), pdfRectToCorner(pdf));
export const contentToPdfRect = (r: Rect, crop: PdfRect): PdfRect =>
  cornerToPdfRect(applyRect(invert(pdfToContentMatrix(crop)), r as RectIn<'content'>));

/** A geom's VISUAL bounding box (geometry + stroke + line endings) as a PdfRect —
 *  the engine requires an explicit `rect` that encloses the baked /AP. */
export const geomPdfBounds = (
  g: Geom,
  strokeWidth: number,
  crop: PdfRect,
  border?: Border,
): PdfRect => contentToPdfRect(geomVisualBounds(g, strokeWidth, border), crop);
