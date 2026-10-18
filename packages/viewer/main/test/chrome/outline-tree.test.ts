/**
 * The outline panel's rules: a filter shows what matches in its place, an item's own colour is
 * drawn only where it reads, and a dragged row lands where a tree lets it.
 */
import { describe, expect, it } from 'vitest';

import type { OutlineItem, OutlineRow } from '@embedpdf/plugin-outline';

import {
  dropOf,
  filteredRows,
  movingKeysOf,
  readableColor,
} from '../../../chrome/src/ui/outline-tree';

const ref = (objectNumber: number) => ({ kind: 'objectNumber', objectNumber }) as const;
const item = (objectNumber: number, title: string, parent: number | null): OutlineItem => ({
  ref: ref(objectNumber),
  parent: parent === null ? null : ref(parent),
  title,
  target: null,
  action: null,
  open: false,
  color: null,
  bold: false,
  italic: false,
});

/** Intro; Chapter with Section A and Section B, B with Detail; Appendix. */
const ITEMS = [
  item(1, 'Intro', null),
  item(2, 'Chapter', null),
  item(3, 'Section A', 2),
  item(4, 'Section B', 2),
  item(5, 'Detail', 4),
  item(6, 'Appendix', null),
];

const row = (index: number, depth: number, hasChildren = false): OutlineRow => ({
  item: ITEMS[index]!,
  depth,
  hasChildren,
  expanded: hasChildren,
});
/** Every row showing. */
const ROWS = [row(0, 0), row(1, 0, true), row(2, 1), row(3, 1, true), row(4, 2), row(5, 0)];
const NONE = new Set<string>();

describe('filteredRows', () => {
  it('shows what matches with the items it sits under, at their depth, whatever the case', () => {
    expect(filteredRows(ITEMS, 'detail').map((each) => [each.item.title, each.depth])).toEqual([
      ['Chapter', 0],
      ['Section B', 1],
      ['Detail', 2],
    ]);
    expect(filteredRows(ITEMS, '  ')).toEqual([]);
    expect(filteredRows(ITEMS, 'nothing')).toEqual([]);
  });
});

describe('readableColor', () => {
  it('keeps a colour that reads on the panel, and drops one that does not', () => {
    expect(readableColor('#c92a2a', 'light')).toBe('#c92a2a');
    expect(readableColor('#ffff00', 'light')).toBeNull();
    expect(readableColor('#000080', 'dark')).toBeNull();
    expect(readableColor('#ffd43b', 'dark')).toBe('#ffd43b');
    expect(readableColor(null, 'light')).toBeNull();
    expect(readableColor('red', 'light')).toBeNull();
  });
});

describe('dropOf', () => {
  it('puts a row after the row above at its level, or under it one level deeper', () => {
    // The gap after Intro, at the top level: after Intro.
    expect(dropOf(ROWS, NONE, 1, 0)).toEqual({
      parent: null,
      position: { after: ref(1) },
      depth: 0,
    });
    // The same gap one level in: Intro's first child.
    expect(dropOf(ROWS, NONE, 1, 1)).toEqual({ parent: ref(1), position: 'start', depth: 1 });
  });

  it('keeps the tree a tree: no deeper than under the row above, no shallower than the row below', () => {
    // Between Chapter and its first section, only as Chapter's first child.
    expect(dropOf(ROWS, NONE, 2, 0)).toEqual({ parent: ref(2), position: 'start', depth: 1 });
    expect(dropOf(ROWS, NONE, 2, 5)).toEqual({ parent: ref(2), position: 'start', depth: 1 });
    // After Detail, before Appendix: any level from the top to under Detail.
    expect(dropOf(ROWS, NONE, 5, 0)).toEqual({
      parent: null,
      position: { after: ref(2) },
      depth: 0,
    });
    expect(dropOf(ROWS, NONE, 5, 1)).toEqual({
      parent: ref(2),
      position: { after: ref(4) },
      depth: 1,
    });
    expect(dropOf(ROWS, NONE, 5, 2)).toEqual({
      parent: ref(4),
      position: { after: ref(5) },
      depth: 2,
    });
    // At the very top, only the top level.
    expect(dropOf(ROWS, NONE, 0, 3)).toEqual({ parent: null, position: 'start', depth: 0 });
  });

  it('leaves out the rows that move, so nothing lands under itself', () => {
    const moving = movingKeysOf(ROWS, new Set(['4']));
    expect([...moving].sort()).toEqual(['4', '5']);
    // Dragging Section B: the gap after Detail is the gap after Section A.
    expect(dropOf(ROWS, moving, 5, 2)).toEqual({ parent: ref(3), position: 'start', depth: 2 });
    expect(dropOf(ROWS, movingKeysOf(ROWS, new Set(['1', '2', '6'])), 3, 0)).toBeNull();
  });
});
