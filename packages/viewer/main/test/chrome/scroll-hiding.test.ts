/**
 * Which bar hides while the pages scroll, as its place says or on a phone, and
 * what counts as a scroll.
 */
import type { BarSchema } from '@embedpdf/core-ui';
import { describe, expect, it } from 'vitest';

import {
  PAGE_NUMBER_SLOT,
  hidesWhileScrolling,
  holdsSlot,
  isScrollOf,
} from '../../../chrome/src/ui/scroll-hiding';

const PAGER: BarSchema = {
  id: 'pager',
  sections: { center: [{ id: 'pages', items: [{ slot: PAGE_NUMBER_SLOT }] }] },
};
const ZOOM: BarSchema = {
  id: 'zoom',
  sections: { center: [{ id: 'zoom', items: ['zoom:out', 'zoom:in'] }] },
};

describe('isScrollOf', () => {
  it('is a move at the same zoom', () => {
    expect(isScrollOf({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 120, zoom: 1 })).toBe(true);
  });

  it('is not a zoom, or no move at all', () => {
    expect(isScrollOf({ x: 0, y: 0, zoom: 1 }, { x: 10, y: 10, zoom: 1.25 })).toBe(false);
    expect(isScrollOf({ x: 5, y: 5, zoom: 1 }, { x: 5, y: 5, zoom: 1 })).toBe(false);
  });
});

describe('hidesWhileScrolling', () => {
  it('hides a bar whose place says so at every size, and keeps one whose place says not', () => {
    expect(hidesWhileScrolling(true, ZOOM, 'expanded')).toBe(true);
    expect(hidesWhileScrolling(true, PAGER, 'medium')).toBe(true);
    expect(hidesWhileScrolling(false, PAGER, 'compact')).toBe(false);
  });

  it('hides the bar with the page number on a phone when its place says nothing', () => {
    expect(holdsSlot(PAGER, PAGE_NUMBER_SLOT)).toBe(true);
    expect(hidesWhileScrolling(undefined, PAGER, 'compact')).toBe(true);
    expect(hidesWhileScrolling(undefined, PAGER, 'medium')).toBe(false);
  });

  it('keeps every other bar', () => {
    expect(hidesWhileScrolling(undefined, ZOOM, 'compact')).toBe(false);
    expect(hidesWhileScrolling(true, null, 'compact')).toBe(false);
  });
});
