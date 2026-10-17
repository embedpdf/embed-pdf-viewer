/**
 * Where a sheet comes to rest after its handle is let go: the nearest height
 * it rests at, a whole step for a flick, and closed when dragged far enough
 * down.
 */
import { describe, expect, it } from 'vitest';

import {
  SHEET_FLICK_PX_PER_S,
  SHEET_TOP_CLEARANCE_PX,
  panelSheetHeightsOf,
  sheetRestOf,
} from '../../../chrome/src/ui/sheet-rest';

const HEIGHTS = [400, 760];

describe('sheetRestOf', () => {
  it('settles at the nearest height after a slow drag', () => {
    expect(sheetRestOf(HEIGHTS, 420, 0)).toBe(400);
    expect(sheetRestOf(HEIGHTS, 700, 0)).toBe(760);
    expect(sheetRestOf(HEIGHTS, 250, 0)).toBe(400);
  });

  it('closes when dragged below half of its lowest height', () => {
    expect(sheetRestOf(HEIGHTS, 190, 0)).toBeNull();
    expect(sheetRestOf([300], 140, 0)).toBeNull();
    expect(sheetRestOf([300], 200, 0)).toBe(300);
  });

  it('moves a whole step down for a downward flick, closing from the lowest', () => {
    expect(sheetRestOf(HEIGHTS, 740, SHEET_FLICK_PX_PER_S)).toBe(400);
    expect(sheetRestOf(HEIGHTS, 390, SHEET_FLICK_PX_PER_S)).toBeNull();
    expect(sheetRestOf([300], 290, 2000)).toBeNull();
  });

  it('moves a whole step up for an upward flick, and stays at its tallest', () => {
    expect(sheetRestOf(HEIGHTS, 420, -SHEET_FLICK_PX_PER_S)).toBe(760);
    expect(sheetRestOf(HEIGHTS, 780, -SHEET_FLICK_PX_PER_S)).toBe(760);
  });
});

describe('panelSheetHeightsOf', () => {
  it('opens at half the viewer and drags up to nearly all of it', () => {
    expect(panelSheetHeightsOf(800)).toEqual([400, 800 - SHEET_TOP_CLEARANCE_PX]);
  });

  it('has one height when half the viewer is already its tallest', () => {
    expect(panelSheetHeightsOf(60)).toEqual([20]);
  });
});
