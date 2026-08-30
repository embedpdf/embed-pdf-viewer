/**
 * Attached-link folding + desired-state derivation — RELATIONSHIP logic, not
 * projection: a `/Link` child grouped under a linkable parent becomes the
 * parent's `link` prop, and the reconciler derives the children it should
 * have from the parent's committed geometry.
 */
import { textQuadBounds } from '@embedpdf/core-geometry';
import {
  propsFor,
  selectionQuad,
  unionRect,
  type Annot,
  type Quad,
  type Rect,
} from '@embedpdf/core-annotation';

import { refKey } from './seam';

/** Does this kind's table declare the `link` prop (may it carry an attached
 *  link)? Widgets/caret/redact/file-attachment deliberately don't. */
const takesLink = (subtype: string): boolean => propsFor(subtype).some((s) => s.key === 'link');

/** Bounds of one quad (content space). */
const quadBounds = (q: Quad): Rect => unionRect(q);

/**
 * The DESIRED hit rects (content space) of a parent's attached link
 * children — derived fresh from the parent's committed geometry, never
 * tracked: markup gets one child per quad (per-line hit areas, the v2
 * segment behaviour), every other kind one child over its visual bounds.
 * The reconciler and the navigation lens both read THIS, so the clickable
 * area and the written `/Rect`s can never disagree.
 *
 * A link's `/Rect` is axis-aligned by spec (no rotation exists for links),
 * so a ROTATED parent gets the AABB of its rotated footprint — the
 * `selectionQuad` corners (rotation + stroke included), the same envelope
 * the selection chrome outlines. Exact rotated hit regions need
 * `/QuadPoints` (tier 2).
 */
export function linkChildRects(a: Annot): Rect[] {
  if (a.geom.t === 'quads') return a.geom.quads.map(textQuadBounds);
  return [unionRect(selectionQuad(a.geom, a.style.strokeWidth, a.style.border))];
}
