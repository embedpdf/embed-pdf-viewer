/**
 * Click-create PLACEMENT — the pure, plane-agnostic layer.
 *
 * `resolveClickPlacement` answers "where does a bare click put the thing": a
 * box (anchored per POLICY, upright-aware, slid onto the page) or a segment
 * (default length/angle from the point, slid onto the page as a unit). It is
 * THE single source for that answer — the annotation core's click commit, the
 * hover footprint ghost, and the form plugin's field placement all consume
 * the same result, so preview ≡ commit by construction.
 *
 * It deliberately returns LOGICAL geometry: no annotation visual semantics
 * (no cloudy-border outer-box expansion, no ellipse) — a form field takes
 * `rect` straight to `doc.forms.createField`. The annotation-only conversion
 * to a committable/renderable `Geom` is {@link clickCreateGeom} below; that
 * is where `shapeRectFor` and ellipse semantics apply.
 */
import {
  rectFromPoints,
  shapeRectFor,
  transposedAboutCenter,
  uprightAnchoredRect,
  uprightRotation,
} from './geometry';
import { styleFromProps } from './props';
import type { PageRotation } from '@embedpdf/core-geometry';
import type { AnnotationProps, ClickCreate, Geom, Rect, Subtype, Vec } from './types';

/** A resolved click placement: what the click will occupy, page-clamped. */
export type ClickPlacement =
  | {
      kind: 'box';
      rect: Rect;
      /** Upright counter-rotation captured for the commit (deg CW; 0 = none). */
      rot: number;
    }
  | { kind: 'segment'; a: Vec; b: Vec };

/** Slide a rect (as a unit) to sit inside `box`; pins at the origin edge when
 *  it doesn't fit. Placements are page-bound; the pointer isn't. */
export const clampRectToBox = (r: Rect, box: Rect | undefined): Rect => {
  if (!box) return r;
  return {
    ...r,
    x: Math.min(Math.max(r.x, box.x), Math.max(box.x, box.x + box.width - r.width)),
    y: Math.min(Math.max(r.y, box.y), Math.max(box.y, box.y + box.height - r.height)),
  };
};

/**
 * Resolve a click-create POLICY at a content point. `anchor` defaults to
 * `center`; under `upright` a box counter-rotates against the page's display
 * rotation exactly as the drag commit would (centre-anchored boxes transpose
 * about their centre, top-left boxes anchor in the DISPLAY frame).
 */
export function resolveClickPlacement(
  point: Vec,
  policy: ClickCreate,
  opts: { pageBox?: Rect; upright?: boolean; displayRotation?: PageRotation } = {},
): ClickPlacement {
  if ('length' in policy) {
    const ang = ((policy.angleDeg ?? 0) * Math.PI) / 180;
    const b = {
      x: point.x + Math.cos(ang) * policy.length,
      y: point.y + Math.sin(ang) * policy.length,
    };
    const bounds = rectFromPoints(point, b);
    const placed = clampRectToBox(bounds, opts.pageBox);
    const dx = placed.x - bounds.x;
    const dy = placed.y - bounds.y;
    return {
      kind: 'segment',
      a: { x: point.x + dx, y: point.y + dy },
      b: { x: b.x + dx, y: b.y + dy },
    };
  }
  const { width, height } = policy;
  const rot = opts.upright && opts.displayRotation ? uprightRotation(opts.displayRotation) : 0;
  let rect: Rect;
  if (policy.anchor === 'top-left') {
    rect = rot
      ? uprightAnchoredRect(point, width, height, opts.displayRotation!)
      : { x: point.x, y: point.y, width, height };
  } else {
    rect = { x: point.x - width / 2, y: point.y - height / 2, width, height };
    // A quarter-turn transposes the unrotated box so the DISPLAYED box keeps
    // the configured width×height (same rule as a dragged box).
    if (rot === 90 || rot === 270) rect = transposedAboutCenter(rect);
  }
  return { kind: 'box', rect: clampRectToBox(rect, opts.pageBox), rot };
}

/**
 * ANNOTATION-ONLY: convert a placement into the `Geom` the commit stores and
 * the ghost paints, for a routing kind. This is where annotation VISUAL
 * semantics live — ellipse for circles, the cloudy outer-box via
 * `shapeRectFor`. Forms never call this; a field box is the placement rect
 * itself. Null for kinds a click cannot author.
 */
export function clickCreateGeom(
  subtype: Subtype,
  placement: ClickPlacement,
  def: AnnotationProps,
): Geom | null {
  if (placement.kind === 'segment') {
    return subtype === 'line'
      ? { t: 'line', a: placement.a, b: placement.b, ends: def.lineEndings }
      : null;
  }
  const { rect, rot } = placement;
  if (subtype === 'free-text') {
    return { t: 'text', rect, ...(rot ? { rot } : {}) };
  }
  if (subtype === 'square' || subtype === 'circle') {
    return {
      t: 'rect',
      rect: shapeRectFor(rect, subtype === 'circle', styleFromProps(def)),
      ellipse: subtype === 'circle',
      ...(rot ? { rot } : {}),
    };
  }
  return null;
}
