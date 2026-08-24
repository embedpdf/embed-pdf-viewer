/**
 * Screen-anchored annotations — `noZoom` / `noRotate` (ISO 32000-2 §12.5.3).
 *
 * The mental model: these flags are DISPLAY-TRANSFORM EXEMPTIONS, nothing
 * more. The view composes content space onto the screen with
 * `zoom × pageRotation`; a flagged annotation asks it to skip the zoom factor
 * (`noZoom`) and/or the page-rotation factor (`noRotate`), holding the
 * `/Rect` upper-left — the geometry's bounds top-left — fixed on the page.
 *
 * The flags do NOT restrict editing. The annotation keeps its full
 * content-space identity: a size (`/Rect`, which now reads as "screen size at
 * zoom 1") and an authored orientation (`rot` / rotated points, which now
 * reads as "screen tilt at every page rotation") — and both stay editable.
 * Edit restrictions come from kind caps (a note kind declares
 * `resizable: false`) and `locked`, never from here.
 *
 * Everything derives from ONE projection, {@link anchoredGeom}: the effective
 * content-space geometry of the body at the current view — a similarity
 * (uniform scale `1/s` + rotation `-r`) about the anchor. Rendering,
 * hit-testing, chrome, marquee, and clamping all read it, so what you see,
 * what you click, and what commits can never disagree (the v2 failure: only
 * the DOM containers compensated).
 *
 * GESTURES compose in VIEW space: project first, then apply the gesture to
 * the projected geometry — for un-flagged annotations the projection is the
 * identity, so this is the ordinary pipeline. A pointer-driven commit maps
 * the final view-space geometry back to stored space through
 * {@link unanchoredGeom}, the exact closed-form inverse — chosen so that the
 * committed geometry's OWN re-projection reproduces the released preview
 * (zero release-jump, any zoom, any rotation).
 *
 * The core stays zoom-free: the view environment is passed PER CALL (the
 * `pageBox`/`chrome` pattern) and captured on pointer drafts at DOWN; it is
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
import type { Geom, Vec, ViewEnv } from './types';

export type { ViewEnv };

/** Which display factors this annotation is exempt from: `zoom` =
 *  screen-constant size, `upright` = screen-constant orientation. */
export interface AnchorMode {
  zoom: boolean;
  upright: boolean;
}

/**
 * The anchor behaviors of one annotation: its `/F` flags OR'd with the kind's
 * statics — the spec's "Text (note) annotations behave as if NoZoom and
 * NoRotate are ALWAYS set", expressed as kind caps. Null when not anchored.
 */
export function anchorModeOf(a: FlagBearer): AnchorMode | null {
  const caps = capsFor(a.subtype);
  const zoom = a.flags.noZoom || caps.noZoom;
  const upright = a.flags.noRotate || caps.noRotate;
  return zoom || upright ? { zoom, upright } : null;
}

/**
 * The geometries the projection applies to: every kind with free content-space
 * geometry — boxes AND vertex kinds (line / poly / ink). Text-anchored
 * geometries (markup quads, carets) and callouts pass through: their position
 * is bound to page text, so a screen-constant body is meaningless there; the
 * flags still round-trip untouched.
 */
const projectable = (g: Geom): boolean =>
  g.t === 'rect' ||
  g.t === 'line' ||
  g.t === 'poly' ||
  g.t === 'ink' ||
  (g.t === 'text' && !g.callout);

/** The fixed page point: the geometry's bounds top-left in content space
 *  (y-down) — which IS the spec's "upper-left corner of the annotation
 *  rectangle", since `/Rect` is emitted from these bounds. */
export const anchorOf = (g: Geom): Vec => {
  const b = geomBounds(g);
  return { x: b.x, y: b.y };
};

const ORIGIN: Vec = { x: 0, y: 0 };

/** The projection's factors for a mode at a view; `null` when it is the
 *  identity (nothing to do). `s`/`r` are the STORED→VIEW inverse factors:
 *  the forward projection applies `1/s` and `-r`.
 *
 *  `s` clamps to `max(zoom, 1)` — Adobe's rule: `noZoom` holds the body at
 *  its 100% size while zooming IN, but below 100% the body scales WITH the
 *  page (a screen-constant body at 25% zoom would dwarf the page it
 *  annotates, and its chrome would drift off-screen). */
function factors(
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): { s: number; r: number } | null {
  if (!mode || !view) return null;
  const s = mode.zoom ? Math.max(view.zoom || 1, 1) : 1;
  const r = mode.upright ? normalizeDeg(view.rotation) : 0;
  return s !== 1 || r !== 0 ? { s, r } : null;
}

/**
 * THE effective content-space geometry of a screen-anchored body at `view`:
 * the stored geometry scaled by `1/max(zoom, 1)` about the anchor (`zoom`
 * exemption, Adobe-clamped) and counter-rotated by `-rotation` about it
 * (`upright`), so that after the page's own display transform the body reads
 * at its 100%-zoom size and its authored tilt, hanging from the fixed anchor.
 * Returns `g` unchanged when there is nothing to do — callers apply it
 * unconditionally.
 */
export function anchoredGeom(g: Geom, mode: AnchorMode | null, view: ViewEnv | undefined): Geom {
  const f = factors(mode, view);
  if (!f || !projectable(g)) return g;
  const a = anchorOf(g);
  let out: Geom = g;
  if (f.s !== 1) out = geomScaleAbout(out, a, 1 / f.s, 1 / f.s);
  if (f.r !== 0) out = geomRotateAbout(out, a, normalizeDeg(-f.r));
  return out;
}

/**
 * The exact inverse of {@link anchoredGeom} for a VIEW-space geometry a
 * gesture produced: the stored geometry whose OWN projection is `target`.
 *
 * Solving `anchoredGeom(stored) = target` where the projection anchors at
 * `stored`'s (unknown) bounds top-left `a` gives a closed form: map `target`
 * through the pure linear part (scale `s` + rotate `r` about the origin),
 * then translate so the result's bounds top-left `b` lands where the
 * projection needs it — at `a = R(-r)·b / s`, the unique fixed point. This is
 * what makes a released gesture commit EXACTLY what its preview showed.
 */
export function unanchoredGeom(
  target: Geom,
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): Geom {
  const f = factors(mode, view);
  if (!f || !projectable(target)) return target;
  let lin: Geom = target;
  if (f.s !== 1) lin = geomScaleAbout(lin, ORIGIN, f.s, f.s);
  if (f.r !== 0) lin = geomRotateAbout(lin, ORIGIN, f.r);
  const b = anchorOf(lin);
  const a = rotatePoint(b, ORIGIN, -f.r);
  return geomTranslate(lin, { x: a.x / f.s - b.x, y: a.y / f.s - b.y });
}

/** Stroke width in the projected (view) space: a `noZoom` body's line weight
 *  scales with its geometry so it stays screen-constant — through the SAME
 *  factors (incl. the ≤100% clamp) the geometry projects with. */
export const anchoredStrokeWidth = (
  width: number,
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): number => {
  const f = factors(mode, view);
  return f ? width / f.s : width;
};

/**
 * The similarity image of an axis-aligned box (a baked raster's AP `/Rect`)
 * under the anchor projection, as the blit vocabulary expects it: an
 * UNROTATED box (the projected centre + scaled size) plus the rotation to
 * re-apply about its centre. `anchor` is the OWNING GEOMETRY's anchor — the
 * raster rides its annotation's projection, it doesn't anchor itself. Null
 * when the projection is the identity.
 */
export function anchoredBox(
  box: { x: number; y: number; width: number; height: number },
  anchor: Vec,
  mode: AnchorMode | null,
  view: ViewEnv | undefined,
): { box: { x: number; y: number; width: number; height: number }; rot: number } | null {
  const f = factors(mode, view);
  if (!f) return null;
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const scaled = {
    x: anchor.x + (c.x - anchor.x) / f.s,
    y: anchor.y + (c.y - anchor.y) / f.s,
  };
  const pc = f.r !== 0 ? rotatePoint(scaled, anchor, normalizeDeg(-f.r)) : scaled;
  const w = box.width / f.s;
  const h = box.height / f.s;
  return {
    box: { x: pc.x - w / 2, y: pc.y - h / 2, width: w, height: h },
    rot: normalizeDeg(-f.r),
  };
}
