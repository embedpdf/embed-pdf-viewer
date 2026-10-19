import {
  toOutlineItemRef,
  toPageRef,
  type OutlineItem,
  type OutlineItemRef,
  type PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  collapsed,
  expanded,
  initialOutlineState,
  itemsOf,
  pruned,
  rowsOf,
  seeded,
  selected,
  spotAt,
  spotsOf,
  topmostOf,
  treeOf,
  type OutlineTree,
} from '../src/model';

const ref = toOutlineItemRef;
const A = ref(6);
const B = ref(7);
const C = ref(8);
const A1 = ref(10);
const C1 = ref(11);
const PAGE_ONE = toPageRef(3);
const PAGE_TWO = toPageRef(4);

const item = (
  at: OutlineItemRef,
  title: string,
  parent: OutlineItemRef | null,
  extra: Partial<OutlineItem> = {},
): OutlineItem => ({
  ref: at,
  parent,
  title,
  target: null,
  action: null,
  open: false,
  color: null,
  bold: false,
  italic: false,
  ...extra,
});

/** A (open) with A1; B; C (closed) with C1. */
const OUTLINE = treeOf({
  items: [
    item(A, 'A', null, { open: true }),
    item(A1, 'A1', A),
    item(B, 'B', null),
    item(C, 'C', null),
    item(C1, 'C1', C),
  ],
  incomplete: false,
});

const titles = (tree: OutlineTree | null) => (tree ? itemsOf(tree).map((each) => each.title) : []);

describe('the tree', () => {
  it('lists items depth first, as the read did', () => {
    expect(titles(OUTLINE)).toEqual(['A', 'A1', 'B', 'C', 'C1']);
  });

  it('shows rows under expanded items only', () => {
    const rows = rowsOf(OUTLINE, { [String(A.objectNumber)]: true });
    expect(rows.map((row) => [row.item.title, row.depth, row.hasChildren, row.expanded])).toEqual([
      ['A', 0, true, true],
      ['A1', 1, false, false],
      ['B', 0, false, false],
      ['C', 0, true, false],
    ]);
  });

  it('names each item once in a delete, without the items under a named one', () => {
    expect(topmostOf(OUTLINE, [C1, C, B, B])).toEqual([C, B]);
  });
});

describe('the reading position', () => {
  const goto = (page = PAGE_ONE, y?: number): PdfLinkTarget => ({
    kind: 'goto',
    destination:
      y === undefined ? { kind: 'fit', page } : { kind: 'xyz', page, x: 0, y, zoom: null },
  });
  const items = [
    item(A, 'A', null, { target: goto(PAGE_ONE, 100) }),
    item(A1, 'A1', A, { target: goto(PAGE_ONE, 100) }),
    item(B, 'B', null, { target: goto(PAGE_TWO) }),
    item(C, 'C', null, { target: { kind: 'uri', uri: 'https://example.com/' } }),
  ];
  const indexOf = (page: { objectNumber: number }) =>
    page.objectNumber === 3 ? 0 : page.objectNumber === 4 ? 1 : null;
  const spots = spotsOf(items, indexOf);

  it('is the last item at or above the top of the view, the deepest of a tie', () => {
    expect(spotAt(spots, 0, 50)).toBeNull();
    expect(spotAt(spots, 0, 100)?.key).toBe(String(A1.objectNumber));
    expect(spotAt(spots, 0, 700)?.key).toBe(String(A1.objectNumber));
    expect(spotAt(spots, 1, 0)?.key).toBe(String(B.objectNumber));
  });

  it('counts only items that go to a page of this document', () => {
    expect(spots.map((spot) => spot.key)).toEqual(['6', '10', '7']);
  });
});

describe('the session', () => {
  it('starts expanded where the file opens items, once', () => {
    const first = seeded(initialOutlineState(), OUTLINE);
    expect(first.expanded).toEqual({ '6': true });
    const chosen = collapsed(first, ['6']);
    expect(seeded(chosen, OUTLINE)).toBe(chosen);
  });

  it('changes nothing when a transition has nothing to do', () => {
    const state = expanded(initialOutlineState(), ['6']);
    expect(expanded(state, ['6'])).toBe(state);
    expect(collapsed(state, ['7'])).toBe(state);
    const picked = selected(state, [A, A]);
    expect(picked.selected).toEqual([A]);
    expect(selected(picked, [A])).toBe(picked);
  });

  it('forgets items the outline no longer has', () => {
    const state = selected(expanded(initialOutlineState(), ['6', '99']), [A, ref(99)]);
    const next = pruned(state, OUTLINE);
    expect(next.expanded).toEqual({ '6': true });
    expect(next.selected).toEqual([A]);
    expect(pruned(next, OUTLINE)).toBe(next);
  });
});
