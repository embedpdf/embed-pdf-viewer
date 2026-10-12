/**
 * Where a menu opens, as a placement for `@embedpdf/web`'s `fitAnchoredRect`:
 * away from the edge its bar sits on, toward the pages, and a submenu beside
 * its row. Placements are physical sides, so the bar's edge and the menu's
 * alignment are read through the writing direction: a start bar is on the
 * right in a right-to-left language. When the side asked for has no room,
 * the fit opens the menu on the other.
 */
import type { AnchoredPlacement } from '@embedpdf/web';

import type { BarEdge } from './bar-edge';

/** The writing direction the menu opens in. */
export type MenuDirection = 'ltr' | 'rtl';

/**
 * How a menu lines up with its button along the bar: by the edges the bar
 * starts from (`'start'`), or by the edges it ends at (`'end'`, the "More"
 * menu at a bar's end).
 */
export type MenuAlign = 'start' | 'end';

/**
 * The placement of a menu opened from a button in a bar on `edge`: below a
 * top bar's button, above a bottom bar's, beside a start or end bar's (on the
 * side of the pages), toward the middle from a floating bar, and below a bar
 * over a selection, away from what's selected.
 */
export function menuPlacementOf(
  edge: BarEdge,
  direction: MenuDirection,
  align: MenuAlign = 'start',
): AnchoredPlacement {
  if (edge === 'start' || edge === 'end') {
    // A vertical bar: its start is its top in either direction.
    const onLeft = (edge === 'start') === (direction === 'ltr');
    return `${onLeft ? 'right' : 'left'}-${align}`;
  }
  const side = edge === 'bottom' || edge === 'float-bottom' ? 'top' : 'bottom';
  // A horizontal bar starts on the left, or on the right in a right-to-left language.
  const physical = (align === 'start') === (direction === 'ltr') ? 'start' : 'end';
  return `${side}-${physical}`;
}

/** The placement of a submenu: beside its row, on the side the text runs toward, tops lined up. */
export function submenuPlacementOf(direction: MenuDirection): AnchoredPlacement {
  return direction === 'ltr' ? 'right-start' : 'left-start';
}

/** The key that opens a submenu from its row, and the one that closes it again. */
export function submenuKeysOf(direction: MenuDirection): { open: string; close: string } {
  return direction === 'ltr'
    ? { open: 'ArrowRight', close: 'ArrowLeft' }
    : { open: 'ArrowLeft', close: 'ArrowRight' };
}
