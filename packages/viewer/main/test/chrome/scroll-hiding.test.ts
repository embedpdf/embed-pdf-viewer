/**
 * Which bar hides while the pages scroll on a phone, and what counts as a
 * scroll.
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
  it('hides the bar with the page number on a phone only', () => {
    expect(holdsSlot(PAGER, PAGE_NUMBER_SLOT)).toBe(true);
    expect(hidesWhileScrolling(PAGER, 'compact')).toBe(true);
    expect(hidesWhileScrolling(PAGER, 'medium')).toBe(false);
  });

  it('keeps every other bar', () => {
    expect(hidesWhileScrolling(ZOOM, 'compact')).toBe(false);
    expect(hidesWhileScrolling(null, 'compact')).toBe(false);
  });
});
