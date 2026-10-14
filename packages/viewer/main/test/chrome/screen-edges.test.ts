/**
 * Which edges of the window the viewer reaches, and the safe-area padding for
 * them.
 */
import { describe, expect, it } from 'vitest';

import {
  NO_SCREEN_EDGES,
  safeAreaPaddingOf,
  sameScreenEdges,
  screenEdgesOf,
} from '../../../chrome/src/ui/screen-edges';

const VIEW = { width: 390, height: 844 };

describe('screenEdgesOf', () => {
  it('reaches every edge when the viewer is the whole window', () => {
    expect(screenEdgesOf({ left: 0, top: 0, right: 390, bottom: 844 }, VIEW)).toEqual({
      top: true,
      right: true,
      bottom: true,
      left: true,
    });
  });

  it('reaches none when it sits inside the page', () => {
    expect(screenEdgesOf({ left: 20, top: 80, right: 370, bottom: 600 }, VIEW)).toEqual(
      NO_SCREEN_EDGES,
    );
  });

  it('reaches an edge it is past, while some of it is on screen', () => {
    expect(screenEdgesOf({ left: 0, top: -200, right: 390, bottom: 500 }, VIEW)).toMatchObject({
      top: true,
      bottom: false,
    });
    expect(screenEdgesOf({ left: 0, top: -900, right: 390, bottom: -10 }, VIEW)).toEqual(
      NO_SCREEN_EDGES,
    );
  });

  it('tells equal edges apart from different ones', () => {
    expect(sameScreenEdges(NO_SCREEN_EDGES, { ...NO_SCREEN_EDGES })).toBe(true);
    expect(sameScreenEdges(NO_SCREEN_EDGES, { ...NO_SCREEN_EDGES, bottom: true })).toBe(false);
  });
});

describe('safeAreaPaddingOf', () => {
  it('pads only the reached edges, with the browser inset', () => {
    expect(safeAreaPaddingOf({ top: true, right: false, bottom: true, left: false })).toEqual({
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    });
  });

  it('pads only the sides asked for', () => {
    const all = { top: true, right: true, bottom: true, left: true };
    expect(Object.keys(safeAreaPaddingOf(all, ['bottom']))).toEqual(['paddingBottom']);
  });
});
