/**
 * Where the chrome's menus open: away from their bar's edge, lined up with
 * their button along the bar, read through the writing direction, and
 * submenus beside their row.
 */
import { describe, expect, it } from 'vitest';

import {
  menuPlacementOf,
  submenuKeysOf,
  submenuPlacementOf,
  tooltipPlacementOf,
} from '../../../chrome/src/ui/menu-placement';

describe('menuPlacementOf', () => {
  it('opens below a top bar and above a bottom bar, lined up with the start of the button', () => {
    expect(menuPlacementOf('top', 'ltr')).toBe('bottom-start');
    expect(menuPlacementOf('bottom', 'ltr')).toBe('top-start');
  });

  it('opens a floating bar toward the middle of the viewer', () => {
    expect(menuPlacementOf('float-top', 'ltr')).toBe('bottom-start');
    expect(menuPlacementOf('float-bottom', 'ltr')).toBe('top-start');
  });

  it('opens from a bar over a selection on the side the bar sits, away from what is selected', () => {
    expect(menuPlacementOf('selection', 'ltr')).toBe('top-start');
    expect(menuPlacementOf('selection', 'ltr', 'start', 'above')).toBe('top-start');
    expect(menuPlacementOf('selection', 'rtl', 'start', 'below')).toBe('bottom-end');
  });

  it('opens beside a start or end bar, on the side of the pages', () => {
    expect(menuPlacementOf('start', 'ltr')).toBe('right-start');
    expect(menuPlacementOf('end', 'ltr')).toBe('left-start');
  });

  it('swaps the sides of start and end bars in a right-to-left language', () => {
    expect(menuPlacementOf('start', 'rtl')).toBe('left-start');
    expect(menuPlacementOf('end', 'rtl')).toBe('right-start');
  });

  it("lines a horizontal bar's menu up with the edge its text starts from", () => {
    expect(menuPlacementOf('top', 'rtl')).toBe('bottom-end');
    expect(menuPlacementOf('top', 'ltr', 'end')).toBe('bottom-end');
    expect(menuPlacementOf('top', 'rtl', 'end')).toBe('bottom-start');
    expect(menuPlacementOf('bottom', 'rtl', 'end')).toBe('top-start');
  });

  it("lines a vertical bar's menu up with the top or the bottom of its button, either way", () => {
    expect(menuPlacementOf('start', 'ltr', 'end')).toBe('right-end');
    expect(menuPlacementOf('start', 'rtl', 'end')).toBe('left-end');
    expect(menuPlacementOf('end', 'rtl', 'start')).toBe('right-start');
  });
});

describe('submenuPlacementOf', () => {
  it('opens beside its row on the side the text runs toward', () => {
    expect(submenuPlacementOf('ltr')).toBe('right-start');
    expect(submenuPlacementOf('rtl')).toBe('left-start');
  });
});

describe('tooltipPlacementOf', () => {
  it("opens on the side the button's menu would, centered on the button", () => {
    expect(tooltipPlacementOf('top', 'ltr')).toBe('bottom');
    expect(tooltipPlacementOf('bottom', 'ltr')).toBe('top');
    expect(tooltipPlacementOf('float-bottom', 'rtl')).toBe('top');
    expect(tooltipPlacementOf('start', 'ltr')).toBe('right');
    expect(tooltipPlacementOf('start', 'rtl')).toBe('left');
    expect(tooltipPlacementOf('end', 'ltr')).toBe('left');
  });

  it('opens away from what is selected, from a bar over a selection', () => {
    expect(tooltipPlacementOf('selection', 'ltr')).toBe('top');
    expect(tooltipPlacementOf('selection', 'ltr', false, 'below')).toBe('bottom');
  });

  it("opens beside a menu's row, on the side a submenu would", () => {
    expect(tooltipPlacementOf('top', 'ltr', true)).toBe('right');
    expect(tooltipPlacementOf('bottom', 'rtl', true)).toBe('left');
  });
});

describe('submenuKeysOf', () => {
  it('opens with the arrow toward the submenu and closes with the arrow back', () => {
    expect(submenuKeysOf('ltr')).toEqual({ open: 'ArrowRight', close: 'ArrowLeft' });
    expect(submenuKeysOf('rtl')).toEqual({ open: 'ArrowLeft', close: 'ArrowRight' });
  });
});
