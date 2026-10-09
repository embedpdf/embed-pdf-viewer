/**
 * Rubber-band selection: drag a box on empty page space to select what it
 * touches of what each annotation paints (`painted.ts`), the ink, or the
 * inside of a filled shape, as a click would hit it.
 */
import type { PageRef } from '@embedpdf/engine-core/runtime';

import { type ViewEnv } from '../anchor';
import { rectFromPoints } from '../rect';
import { expandGroups } from '../group';
import { isSelectable, paintedOf } from '../hit';
import { paintedTouches } from '../painted';
import { isSubstrateOnly } from '../plane';
import type { Effect, Id, Model, PointerInput, Rect } from '../types';
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
  if (model.draft.page.objectNumber !== input.page.objectNumber) return [model, []]; // foreign frame — ignore
  if (phase === 'move') {
    return [{ ...model, draft: { ...model.draft, to: point } }, []];
  }

  const hits = selectionInBox(
    model,
    model.draft.page,
    rectFromPoints(model.draft.from, point),
    input.inert,
    viewOf(input),
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

/**
 * What a box on `page` selects: every annotation it touches
 * ({@link annotsInBox}), and the rest of the group of each. The marquee and
 * the capability's `selectInRect` both select this.
 */
export function selectionInBox(
  model: Model,
  page: PageRef,
  box: Rect,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Id[] {
  return expandGroups(model, annotsInBox(model, page, box, inert, view));
}

/**
 * The selectable annotations on `page` whose paint the box touches: their
 * ink, or their inside where a click would hit it. Screen-anchored bodies
 * count as they show at `view`. An unfilled shape's empty middle, or the
 * empty corners of a diagonal line's bounds, is not touching it.
 */
export function annotsInBox(
  model: Model,
  page: PageRef,
  box: Rect,
  inert?: ReadonlySet<Id>,
  view?: ViewEnv,
): Id[] {
  const pageObjectNumber = page.objectNumber;
  return model.order.filter((id) => {
    const record = model.byId[id];
    if (
      record?.annotation.page.objectNumber !== pageObjectNumber ||
      inert?.has(id) ||
      !isSelectable(model, id)
    )
      return false;
    // Conversation-plane annotations (replies, review states) are never on
    // the page — the marquee cannot sweep up what does not paint.
    if (isSubstrateOnly(record)) return false;
    return paintedTouches(paintedOf(record, view), box);
  });
}
