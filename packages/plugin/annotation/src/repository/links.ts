/**
 * Attached-link folding + desired-state derivation — RELATIONSHIP logic, not
 * projection: a `/Link` child grouped under a linkable parent becomes the
 * parent's `link` prop, and the reconciler derives the children it should
 * have from the parent's committed geometry.
 */
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

/**
 * Fold attached link children onto their parents: a `/Link` annotation
 * grouped (`/RT /Group`) under a linkable non-link parent is not an object
 * in the client model — it becomes the parent's `link` prop value plus the
 * `linkRefs` join keys the write side needs. Folded children are REMOVED
 * from the returned list, so they never render, hit-test, or select.
 * Anything that doesn't match (orphans, links grouped under widgets or
 * other links) stays a standalone annotation — nothing is ever hidden.
 *
 * Multi-segment parents (markup) carry several children with one shared
 * target; the first child's target wins and the next write heals any
 * foreign disagreement.
 */
export function foldAttachedLinks(annots: Annot[]): Annot[] {
  const byId = new Map(annots.map((a) => [a.id, a]));
  const folded = new Set<string>();
  const patched = new Map<string, Annot>();
  for (const a of annots) {
    if (a.subtype !== 'link' || a.data?.subtype !== 'link') continue;
    if (a.data.replyType !== 'group' || !a.data.inReplyTo || !a.ref) continue;
    const parentId = refKey(a.data.inReplyTo);
    const parent = patched.get(parentId) ?? byId.get(parentId);
    if (!parent || parent.subtype === 'link' || !takesLink(parent.subtype)) continue;
    patched.set(parentId, {
      ...parent,
      link: parent.link ?? a.data.target,
      linkRefs: [...(parent.linkRefs ?? []), a.ref],
    });
    folded.add(a.id);
  }
  if (!folded.size) return annots;
  return annots.filter((a) => !folded.has(a.id)).map((a) => patched.get(a.id) ?? a);
}

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
  if (a.geom.t === 'quads') return a.geom.quads.map(quadBounds);
  return [unionRect(selectionQuad(a.geom, a.style.strokeWidth, a.style.border))];
}
