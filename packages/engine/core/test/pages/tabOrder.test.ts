/**
 * The order Tab visits a document's annotations in: the pages in the document's order, and on each
 * page the order the page gives (`/Tabs`): rows, columns, the tags (structure), widgets first, or
 * the page's own order.
 */
import { describe, expect, it } from 'vitest';

import { compareStructurePositions, tabOrderOf, type TabOrderPage } from '../../src/pages/tabOrder';
import { toPageRef } from '../../src/identity/PageRef';

const P1 = toPageRef(1);
const P2 = toPageRef(2);

/** An annotation named by its number, at x, y on a page (page space, y down). */
const at = (
  name: number,
  page: typeof P1,
  x: number,
  y: number,
  { structure = null, subtype = 'widget' }: { structure?: number[] | null; subtype?: string } = {},
) => ({
  name,
  subtype,
  page,
  rect: { x, y, width: 100, height: 20 },
  structurePosition: structure,
});

const names = (annotations: readonly { name: number }[]) => annotations.map(({ name }) => name);
const page = (ref: typeof P1, tabOrder: TabOrderPage['tabOrder']): TabOrderPage => ({
  ref,
  tabOrder,
});

// A page as it lists its annotations: 3 (bottom right), 1 (top right), 2 (top left), 4 (middle left).
// Its tags read 2, 4, 3; 1 isn't tagged.
const page1 = [
  at(3, P1, 300, 400, { structure: [0, 1, 0] }),
  at(1, P1, 300, 100),
  at(2, P1, 50, 102, { structure: [0, 0, 2, 1] }),
  at(4, P1, 50, 250, { structure: [0, 0, 5] }),
];

describe('tabOrderOf', () => {
  it("keeps the page's own order on a page that says nothing, or names it", () => {
    expect(names(tabOrderOf(page1, [page(P1, null)]))).toEqual([3, 1, 2, 4]);
    expect(names(tabOrderOf(page1, [page(P1, 'annotations')]))).toEqual([3, 1, 2, 4]);
  });

  it('reads rows top to bottom, each left to right, boxes a point or two apart on one line', () => {
    // 2 sits 2 points lower than 1, still on its line: left first.
    expect(names(tabOrderOf(page1, [page(P1, 'rows')]))).toEqual([2, 1, 4, 3]);
  });

  it('reads columns left to right, each top to bottom', () => {
    expect(names(tabOrderOf(page1, [page(P1, 'columns')]))).toEqual([2, 4, 1, 3]);
  });

  it("follows the tags on a structure page, and puts what isn't tagged after, in the page's order", () => {
    expect(names(tabOrderOf(page1, [page(P1, 'structure')]))).toEqual([2, 4, 3, 1]);
    // A page with nothing tagged keeps its own order.
    const untagged = page1.map((annotation) => ({ ...annotation, structurePosition: null }));
    expect(names(tabOrderOf(untagged, [page(P1, 'structure')]))).toEqual([3, 1, 2, 4]);
    // A row without a position at all, from an engine that doesn't read them, isn't tagged.
    const unread = page1.map(({ structurePosition: _, ...rest }) => rest);
    expect(names(tabOrderOf(unread as unknown as typeof page1, [page(P1, 'structure')]))).toEqual([
      3, 1, 2, 4,
    ]);
  });

  it('puts the form fields first on a widgets page, then the other annotations', () => {
    const mixed = [
      at(5, P1, 0, 0, { subtype: 'link' }),
      ...page1,
      at(6, P1, 0, 500, { subtype: 'text' }),
    ];
    expect(names(tabOrderOf(mixed, [page(P1, 'widgets')]))).toEqual([3, 1, 2, 4, 5, 6]);
  });

  it("goes page by page in the document's order, each page in its own order", () => {
    const annotations = [at(9, P2, 0, 0), ...page1, at(8, P2, 0, 300)];
    expect(names(tabOrderOf(annotations, [page(P2, null), page(P1, 'rows')]))).toEqual([
      9, 8, 2, 1, 4, 3,
    ]);
    // A page the document doesn't list (being deleted) has no stops.
    expect(names(tabOrderOf(annotations, [page(P1, null)]))).toEqual([3, 1, 2, 4]);
  });
});

describe('compareStructurePositions', () => {
  it('compares index by index, a parent before its kids', () => {
    expect(compareStructurePositions([0, 0, 2], [0, 1])).toBeLessThan(0);
    expect(compareStructurePositions([0, 1, 0], [0, 0, 9, 9])).toBeGreaterThan(0);
    expect(compareStructurePositions([0, 2], [0, 2, 0])).toBeLessThan(0);
    expect(compareStructurePositions([3, 1], [3, 1])).toBe(0);
  });
});
