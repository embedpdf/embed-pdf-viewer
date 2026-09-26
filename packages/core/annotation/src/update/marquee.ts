/** Rubber-band selection: drag a box on empty page space to select what it touches. */
import type { PageRef } from '@embedpdf/engine-core/runtime';

import { type ViewEnv } from '../anchor';
import { quadIntersectsRect, rectFromPoints } from '../geometry';
import { expandGroups } from '../group';
import { isSelectable } from '../hit';
import { isSubstrateOnly } from '../plane';
import { annotationSelectionFrame } from '../selection';
import type { Effect, Id, Model, Point, PointerInput } from '../types';
import { clampPointToBox, viewOf } from './page-bound';

export function marqueePointer(
  model: Model,
  phase: 'down' | 'move' | 'up',
  input: PointerInput,
): [Model, Effect[]] {
  // The marquee lives on one page and pins to its box (same rules as editMove).
  const point = clampPointToBox(input.point, input.pageBox);
  if (phase === 'down') {
    return [{ ...model, draft: { kind: 'marquee', page: input.page, from: point, to: point } }, []];
  }
  if (model.draft?.kind !== 'marquee') return [model, []];
  if (model.draft.page.pageObjectNumber !== input.page.pageObjectNumber) return [model, []]; // foreign frame — ignore
  if (phase === 'move') {
    return [{ ...model, draft: { ...model.draft, to: point } }, []];
  }

  // A marquee that touches one member takes the whole group with it.
  const hits = expandGroups(
    model,
    annotsInBox(model, model.draft.page, model.draft.from, point, input.inert, viewOf(input)),
  );
  const selected = input.shift ? toggleSelection(model.selected, hits) : hits;
  return [{ ...model, selected, draft: null }, []];
}

function toggleSelection(base: Id[], ids: Id[]): Id[] {
  const next = new Set(base);
  for (const id of ids) {
    if (next.has(id)) next.delete(id);
    else next.add(id);
  }
  return [...next];
}

/** The annotations on `page` a marquee from `from` to `to` touches. */
export function annotsInBox(
  model: Model,
  page: PageRef,
  from: Point,
  to: Point,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Id[] {
  const pageObjectNumber = page.pageObjectNumber;
  const box = rectFromPoints(from, to);
  return model.order.filter((id) => {
    const annotation = model.byId[id];
    if (
      annotation?.page.pageObjectNumber !== pageObjectNumber ||
      inert?.has(id) ||
      !isSelectable(model, id)
    )
      return false;
    // Conversation-plane annotations (replies, review states) are never on
    // the page — the marquee cannot sweep up what does not paint.
    if (isSubstrateOnly(annotation)) return false;
    // intersect against what is actually drawn: the oriented selection quad
    // (exact, via SAT) — the same quad the chrome outlines and the grab region
    // uses (screen-anchored bodies at their view-projected footprint). Its
    // AABB is a coarse superset whose empty corners cover most of a tilted
    // shape's unrotated footprint, so testing the AABB selected shapes the
    // marquee never touched.
    const frame = annotationSelectionFrame(annotation, view);
    return quadIntersectsRect(frame.corners, box);
  });
}
