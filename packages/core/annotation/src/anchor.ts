/**
 * Screen-anchored annotations — `noZoom` / `noRotate` (ISO 32000-2 §12.5.3).
 *
 * The mental model: these flags are display-transform exemptions, nothing
 * more. The view composes content space onto the screen with
 * `zoom × pageRotation`; a flagged annotation asks it to skip the zoom factor
 * (`noZoom`) and/or the page-rotation factor (`noRotate`), holding the
 * `/Rect` upper-left — the geometry's bounds top-left — fixed on the page.
 *
 * The flags do not restrict editing. The annotation keeps its full
 * content-space identity: a size (`/Rect`, which now reads as "screen size at
 * zoom 1") and an authored orientation (`rot` / rotated points, which now
 * reads as "screen tilt at every page rotation") — and both stay editable.
 * Edit restrictions come from kind caps (a note kind declares
 * `resizable: false`) and `locked`, never from here.
 *
 * Everything derives from one projection, {@link anchoredGeom}: the effective
 * content-space geometry of the body at the current view — a similarity
 * (uniform scale `1/s` + rotation `-r`) about the anchor. Rendering,
 * hit-testing, chrome, marquee, and clamping all read it, so what you see,
 * what you click, and what commits can never disagree. Compensating only in
 * the DOM containers would let hit-testing and commits drift from the render.
 *
 * Gestures compose in view space: project first, then apply the gesture to
 * the projected geometry — for un-flagged annotations the projection is the
 * identity, so this is the ordinary pipeline. A pointer-driven commit maps
 * the final view-space geometry back to stored space through
 * {@link unanchoredGeom}, the exact closed-form inverse — chosen so that the
 * committed geometry's own re-projection reproduces the released preview
 * (zero release-jump, any zoom, any rotation).
 *
 * The core stays zoom-free: the view environment is passed per call (the
 * `pageBox`/`chrome` pattern) and captured on pointer drafts at down; it is
 * never stored on the model.
 */
import {
  geomBounds,
  geomRotateAbout,
  geomScaleAbout,
  geomTranslate,
  normalizeDeg,
  rotatePoint,
} from './geometry';
import { capsFor } from './kinds';
import type { FlagBearer } from './flags';
import type { ContentGeometry, Point, ViewEnv } from './types';

export type { ViewEnv };

/** Which display factors this annotation is exempt from: `zoom` =
 *  screen-constant size, `upright` = screen-constant orientation. */
export interface AnchorMode {
  zoom: boolean;
  upright: boolean;
}

/**
 * The anchor behaviors of one annotation: its `/F` flags or'd with the kind's
 * statics — the spec's "Text (note) annotations behave as if NoZoom and
 * NoRotate are always set", expressed as kind caps. Null when not anchored.
 */
export function anchorModeOf(annotation: FlagBearer): AnchorMode | null {
  const caps = capsFor(annotation.subtype);
  const zoom = annotation.flags.noZoom || caps.noZoom;
  const upright = annotation.flags.noRotate || caps.noRotate;
  return zoom || upright ? { zoom, upright } : null;
}

/**
 * The geometries the projection applies to: every kind with free content-space
 * geometry — boxes and vertex kinds (line / poly / ink). Text-anchored
 * geometries (markup quads, carets) and callouts pass through: their position
 * is bound to page text, so a screen-constant body is meaningless there; the
 * flags still round-trip untouched.
 */
const projectable = (geometry: ContentGeometry): boolean =>
  geometry.kind === 'rect' ||
  geometry.kind === 'line' ||
  geometry.kind === 'poly' ||
  geometry.kind === 'ink' ||
  (geometry.kind === 'text' && !geometry.callout);

/** The fixed page point: the geometry's bounds top-left in content space
 *  (y-down) — which is the spec's "upper-left corner of the annotation
 *  rectangle", since `/Rect` is emitted from these bounds. */
export const anchorOf = (geometry: ContentGeometry): Point => {
  const rect = geomBounds(geometry);
  return { x: rect.x, y: rect.y };
};

const ORIGIN: Point = { x: 0, y: 0 };

/** The projection's factors for a mode at a view; `null` when it is the
 *  identity (nothing to do). `s`/`r` are the stored→view inverse factors:
 *  the forward projection applies `1/s` and `-r`.
 *
 *  `s` clamps to `max(zoom, 1)` — Adobe's rule: `noZoom` holds the body at
 *  its 100% size while zooming in, but below 100% the body scales with the
 *  page (a screen-constant body at 25% zoom would dwarf the page it
 *  annotates, and its chrome would drift off-screen). */
function factors(
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): { s: number; r: number } | null {
  if (!mode || !view) return null;
  const scale = mode.zoom ? Math.max(view.zoom || 1, 1) : 1;
  const rotation = mode.upright ? normalizeDeg(view.rotation) : 0;
  return scale !== 1 || rotation !== 0 ? { s: scale, r: rotation } : null;
}

/**
 * The effective content-space geometry of a screen-anchored body at `view`:
 * the stored geometry scaled by `1/max(zoom, 1)` about the anchor (`zoom`
 * exemption, Adobe-clamped) and counter-rotated by `-rotation` about it
 * (`upright`), so that after the page's own display transform the body reads
 * at its 100%-zoom size and its authored tilt, hanging from the fixed anchor.
 * Returns `geometry` unchanged when there is nothing to do — callers apply it
 * unconditionally.
 */
export function anchoredGeom(
  geometry: ContentGeometry,
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): ContentGeometry {
  const projection = factors(mode, view);
  if (!projection || !projectable(geometry)) return geometry;
  const point = anchorOf(geometry);
  let out: ContentGeometry = geometry;
  if (projection.s !== 1) out = geomScaleAbout(out, point, 1 / projection.s, 1 / projection.s);
  if (projection.r !== 0) out = geomRotateAbout(out, point, normalizeDeg(-projection.r));
  return out;
}

/**
 * The exact inverse of {@link anchoredGeom} for a view-space geometry a
 * gesture produced: the stored geometry whose own projection is `target`.
 *
 * Solving `anchoredGeom(stored) = target` where the projection anchors at
 * `stored`'s (unknown) bounds top-left `a` gives a closed form: map `target`
 * through the pure linear part (scale `s` + rotate `r` about the origin),
 * then translate so the result's bounds top-left `b` lands where the
 * projection needs it — at `a = R(-r)·b / s`, the unique fixed point. This is
 * what makes a released gesture commit exactly what its preview showed.
 */
export function unanchoredGeom(
  target: ContentGeometry,
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): ContentGeometry {
  const projection = factors(mode, view);
  if (!projection || !projectable(target)) return target;
  let lin: ContentGeometry = target;
  if (projection.s !== 1) lin = geomScaleAbout(lin, ORIGIN, projection.s, projection.s);
  if (projection.r !== 0) lin = geomRotateAbout(lin, ORIGIN, projection.r);
  const point = anchorOf(lin);
  const unrotatedAnchor = rotatePoint(point, ORIGIN, -projection.r);
  return geomTranslate(lin, {
    x: unrotatedAnchor.x / projection.s - point.x,
    y: unrotatedAnchor.y / projection.s - point.y,
  });
}

/** Stroke width in the projected (view) space: a `noZoom` body's line weight
 *  scales with its geometry so it stays screen-constant — through the same
 *  factors (incl. the ≤100% clamp) the geometry projects with. */
export const anchoredStrokeWidth = (
  width: number,
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): number => {
  const projection = factors(mode, view);
  return projection ? width / projection.s : width;
};

/**
 * The similarity image of an axis-aligned box (a baked raster's AP `/Rect`)
 * under the anchor projection, as the blit vocabulary expects it: an
 * unrotated box (the projected centre + scaled size) plus the rotation to
 * re-apply about its centre. `anchor` is the owning geometry's anchor — the
 * raster rides its annotation's projection, it doesn't anchor itself. Null
 * when the projection is the identity.
 */
export function anchoredBox(
  box: { x: number; y: number; width: number; height: number },
  anchor: Point,
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): { box: { x: number; y: number; width: number; height: number }; rot: number } | null {
  const projection = factors(mode, view);
  if (!projection) return null;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const scaled = {
    x: anchor.x + (center.x - anchor.x) / projection.s,
    y: anchor.y + (center.y - anchor.y) / projection.s,
  };
  const pc = projection.r !== 0 ? rotatePoint(scaled, anchor, normalizeDeg(-projection.r)) : scaled;
  const width = box.width / projection.s;
  const height = box.height / projection.s;
  return {
    box: { x: pc.x - width / 2, y: pc.y - height / 2, width, height },
    rot: normalizeDeg(-projection.r),
  };
}
