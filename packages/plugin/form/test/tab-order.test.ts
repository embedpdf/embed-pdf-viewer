/**
 * Tab's order through a form: the pages in the document's order, and on each page the order the
 * page gives (`/Tabs`): rows, columns, or its annotations' own order.
 */
import { describe, expect, it } from 'vitest';
import { toPageRef, type WidgetAnnotation } from '@embedpdf/engine-core/runtime';

import { tabOrderOf, type TabPage } from '../src/read/tab-order';

const P1 = toPageRef(1);
const P2 = toPageRef(2);

/** A box named by its object number, at x, y (page space, y down). */
const box = (objectNumber: number, page: typeof P1, x: number, y: number, height = 20) =>
  ({
    subtype: 'widget',
    ref: { kind: 'objectNumber', page, objectNumber },
    page,
    rect: { x, y, width: 100, height },
  }) as unknown as WidgetAnnotation;

const names = (rows: readonly WidgetAnnotation[]) =>
  rows.map((row) => (row.ref as { objectNumber: number }).objectNumber);

// A page as its annotations list them: 3 (bottom right), 1 (top right), 2 (top left), 4 (middle left).
const page1 = [
  box(3, P1, 300, 400),
  box(1, P1, 300, 100),
  box(2, P1, 50, 102),
  box(4, P1, 50, 250),
];
const page = (ref: typeof P1, tabOrder: TabPage['tabOrder']): TabPage => ({ ref, tabOrder });

describe('tabOrderOf', () => {
  it("keeps the annotations' own order on a page that says nothing", () => {
    expect(names(tabOrderOf(page1, [page(P1, null)]))).toEqual([3, 1, 2, 4]);
    expect(names(tabOrderOf(page1, [page(P1, 'annotations')]))).toEqual([3, 1, 2, 4]);
    // The plugin doesn't read the structure tree: the annotations' order stands in for it.
    expect(names(tabOrderOf(page1, [page(P1, 'structure')]))).toEqual([3, 1, 2, 4]);
  });

  it('reads rows top to bottom, each left to right, boxes a point or two apart on one line', () => {
    // 2 sits 2 points lower than 1, still on its line: left first.
    expect(names(tabOrderOf(page1, [page(P1, 'rows')]))).toEqual([2, 1, 4, 3]);
  });

  it('reads columns left to right, each top to bottom', () => {
    expect(names(tabOrderOf(page1, [page(P1, 'columns')]))).toEqual([2, 4, 1, 3]);
  });

  it("goes page by page in the document's order, each page in its own order", () => {
    const rows = [box(9, P2, 0, 0), ...page1, box(8, P2, 0, 300)];
    expect(names(tabOrderOf(rows, [page(P2, null), page(P1, 'rows')]))).toEqual([9, 8, 2, 1, 4, 3]);
    // A page the document doesn't list (being deleted) has no stops.
    expect(names(tabOrderOf(rows, [page(P1, null)]))).toEqual([3, 1, 2, 4]);
  });
});
