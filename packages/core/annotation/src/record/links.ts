/**
 * Links: the rects a parent's attached link children take, and the link
 * targets a write can state.
 */
import { quadBounds } from '@embedpdf/core-geometry';
import type { PdfLinkTarget, PdfLinkTargetWritable } from '@embedpdf/engine-core/runtime';

import { selectionQuad } from '../geometry';
import { rotatedAabb, unionRect } from '../rect';
import type { Shape, Rect, Style } from '../types';

/**
 * The desired hit rects (page space) of a parent's attached link
 * children — derived fresh from the parent's committed geometry, never
 * tracked: markup gets one child per quad (per-line hit areas), a text box
 * one child over its box, every other kind one child over its visual bounds.
 * The reconciler and the navigation lens both read this, so the clickable
 * area and the written `/Rect`s can never disagree.
 *
 * A link's `/Rect` is axis-aligned by spec (no rotation exists for links),
 * so a rotated parent gets the AABB of its rotated footprint — the
 * `selectionQuad` corners (rotation + stroke included), the same envelope
 * the selection chrome outlines. A text box's link covers only its turned
 * box: a callout's frame also takes in its line, and a link that size
 * would make the empty space around the line clickable. Exact rotated hit
 * regions need `/QuadPoints` (tier 2).
 */
export function linkChildRects(shape: Shape, style: Style): Rect[] {
  if (shape.kind === 'quads') return shape.quadPoints.map(quadBounds);
  if (shape.kind === 'text-box') return [rotatedAabb(shape.box, shape.rotation)];
  return [unionRect(selectionQuad(shape, style))];
}

/** The writable projection of a `link` value: `goto`/`uri` pass through,
 *  read-only arms (`javascript`, `named`, `goto-remote`, `launch`,
 *  `unsupported`) yield `null` — they can be carried, never (re)written. */
export function writableTarget(
  target: PdfLinkTarget | null | undefined,
): PdfLinkTargetWritable | null {
  return target && (target.kind === 'goto' || target.kind === 'uri') ? target : null;
}
