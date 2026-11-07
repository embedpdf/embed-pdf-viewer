/**
 * Which floating bar rests out of sight while nothing moves: as its place says, or the bar with
 * the page number at every size.
 */
import type { BarSchema } from '@embedpdf/core-ui';
import { describe, expect, it } from 'vitest';

import { PAGE_NUMBER_SLOT, hidesWhenIdle, holdsSlot } from '../../../chrome/src/ui/idle-hiding';

const PAGER: BarSchema = {
  id: 'pager',
  sections: { center: [{ id: 'pages', items: [{ slot: PAGE_NUMBER_SLOT }] }] },
};
const ZOOM: BarSchema = {
  id: 'zoom',
  sections: { center: [{ id: 'zoom', items: ['zoom:out', 'zoom:in'] }] },
};

describe('hidesWhenIdle', () => {
  it('hides a bar whose place says so, and keeps one whose place says not', () => {
    expect(hidesWhenIdle(true, ZOOM)).toBe(true);
    expect(hidesWhenIdle(false, PAGER)).toBe(false);
  });

  it('hides the bar with the page number when its place says nothing', () => {
    expect(holdsSlot(PAGER, PAGE_NUMBER_SLOT)).toBe(true);
    expect(hidesWhenIdle(undefined, PAGER)).toBe(true);
  });

  it('keeps every other bar', () => {
    expect(hidesWhenIdle(undefined, ZOOM)).toBe(false);
    expect(hidesWhenIdle(true, null)).toBe(false);
  });
});
