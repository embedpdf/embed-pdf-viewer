/**
 * Attached-link folding + desired-state derivation — relationship logic, not
 * projection: a `/Link` child grouped under a linkable parent becomes the
 * parent's `link` prop, and the reconciler derives the children it should
 * have from the parent's committed geometry.
 */
import { quadBounds } from '@embedpdf/core-geometry';

import { selectionQuad, unionRect } from '../geometry';
import { propsFor } from '../kinds';
import type { Rect, RecordFields } from '../types';
import { annotationKey } from './seam';

/** Does this kind's table declare the `link` prop (may it carry an attached
 *  link)? Widgets/caret/redact/file-attachment deliberately don't. */
const takesLink = (subtype: string): boolean =>
  propsFor(subtype).some((spec) => spec.key === 'link');

/**
 * The desired hit rects (page space) of a parent's attached link
 * children — derived fresh from the parent's committed geometry, never
 * tracked: markup gets one child per quad (per-line hit areas), every
 * other kind one child over its visual bounds.
 * The reconciler and the navigation lens both read this, so the clickable
 * area and the written `/Rect`s can never disagree.
 *
 * A link's `/Rect` is axis-aligned by spec (no rotation exists for links),
 * so a rotated parent gets the AABB of its rotated footprint — the
 * `selectionQuad` corners (rotation + stroke included), the same envelope
 * the selection chrome outlines. Exact rotated hit regions need
 * `/QuadPoints` (tier 2).
 */
export function linkChildRects(annotation: RecordFields): Rect[] {
  if (annotation.geometry.kind === 'quads') return annotation.geometry.quads.map(quadBounds);
  return [
    unionRect(
      selectionQuad(annotation.geometry, annotation.style.strokeWidth, annotation.style.border),
    ),
  ];
}
