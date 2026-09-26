/**
 * Click-create placement — the pure, plane-agnostic layer.
 *
 * `resolveClickPlacement` answers "where does a bare click put the thing": a
 * box (anchored per policy, upright-aware, slid onto the page) or a segment
 * (default length/angle from the point, slid onto the page as a unit). It is
 * the single source for that answer — the annotation core's click commit, the
 * hover footprint ghost, and the form plugin's field placement all consume
 * the same result, so preview ≡ commit by construction.
 *
 * It deliberately returns logical geometry: no annotation visual semantics
 * (no cloudy-border outer-box expansion, no ellipse) — a form field takes
 * `rect` straight to `doc.forms.createField`. The annotation-only conversion
 * to a committable/renderable `ContentGeometry` is {@link clickCreateGeom} below; that
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
import type { AnnotationProps, ClickCreate, ContentGeometry, Rect, Subtype, Point } from './types';

/** A resolved click placement: what the click will occupy, page-clamped. */
export type ClickPlacement =
  | {
      kind: 'box';
      rect: Rect;
      /** Upright counter-rotation captured for the commit (deg CW; 0 = none). */
      rot: number;
    }
  | { kind: 'segment'; a: Point; b: Point };

/** Slide a rect (as a unit) to sit inside `box`; pins at the origin edge when
 *  it doesn't fit. Placements are page-bound; the pointer isn't. */
export const clampRectToBox = (rect: Rect, box: Rect | undefined): Rect => {
  if (!box) return rect;
  return {
    ...rect,
    x: Math.min(Math.max(rect.x, box.x), Math.max(box.x, box.x + box.width - rect.width)),
    y: Math.min(Math.max(rect.y, box.y), Math.max(box.y, box.y + box.height - rect.height)),
  };
};

/**
 * Resolve a click-create policy at a content point. `anchor` defaults to
 * `center`; under `upright` a box counter-rotates against the page's display
 * rotation exactly as the drag commit would (centre-anchored boxes transpose
 * about their centre, top-left boxes anchor in the display frame).
 */
export function resolveClickPlacement(
  point: Point,
  policy: ClickCreate,
  options: { pageBox?: Rect; upright?: boolean; displayRotation?: PageRotation } = {},
): ClickPlacement {
  if ('length' in policy) {
    const ang = ((policy.angleDeg ?? 0) * Math.PI) / 180;
    const end = {
      x: point.x + Math.cos(ang) * policy.length,
      y: point.y + Math.sin(ang) * policy.length,
    };
    const bounds = rectFromPoints(point, end);
    const placed = clampRectToBox(bounds, options.pageBox);
    const dx = placed.x - bounds.x;
    const dy = placed.y - bounds.y;
    return {
      kind: 'segment',
      a: { x: point.x + dx, y: point.y + dy },
      b: { x: end.x + dx, y: end.y + dy },
    };
  }
  const { width, height } = policy;
  const rot =
    options.upright && options.displayRotation ? uprightRotation(options.displayRotation) : 0;
  let rect: Rect;
  if (policy.anchor === 'top-left') {
    rect = rot
      ? uprightAnchoredRect(point, width, height, options.displayRotation!)
      : { x: point.x, y: point.y, width, height };
  } else {
    rect = { x: point.x - width / 2, y: point.y - height / 2, width, height };
    // A quarter-turn transposes the unrotated box so the displayed box keeps
    // the configured width×height (same rule as a dragged box).
    if (rot === 90 || rot === 270) rect = transposedAboutCenter(rect);
  }
  return { kind: 'box', rect: clampRectToBox(rect, options.pageBox), rot };
}

/**
 * Annotation-only: convert a placement into the `ContentGeometry` the commit stores and
 * the ghost paints, for a routing kind. This is where annotation visual
 * semantics live — ellipse for circles, the cloudy outer-box via
 * `shapeRectFor`. Forms never call this; a field box is the placement rect
 * itself. Null for kinds a click cannot author.
 */
export function clickCreateGeom(
  subtype: Subtype,
  placement: ClickPlacement,
  definition: AnnotationProps,
): ContentGeometry | null {
  if (placement.kind === 'segment') {
    return subtype === 'line'
      ? { kind: 'line', a: placement.a, b: placement.b, ends: definition.lineEndings }
      : null;
  }
  const { rect, rot } = placement;
  if (subtype === 'free-text') {
    return { kind: 'text', rect, ...(rot ? { rot } : {}) };
  }
  if (subtype === 'square' || subtype === 'circle') {
    return {
      kind: 'rect',
      rect: shapeRectFor(rect, subtype === 'circle', styleFromProps(definition)),
      ellipse: subtype === 'circle',
      ...(rot ? { rot } : {}),
    };
  }
  return null;
}
