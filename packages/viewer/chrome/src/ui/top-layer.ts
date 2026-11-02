/**
 * Placing what opens in the browser's top layer beside what it opens from: a menu beside its
 * button or its row, a tooltip beside its button. The top layer is the window's, so each is
 * placed in window px (`position: fixed`), on the side asked for or the other one when that has no
 * room, and moved to stay in the window (`fitAnchoredRect` in `@embedpdf/web`).
 */
import {
  anchoredViewOf,
  fitAnchoredRect,
  type AnchoredPlacement,
  type AnchoredRect,
} from '@embedpdf/web';

import type { SelectionBarSide } from './menu-placement';

/** Where `element` is in the window. */
export const boxOf = (element: Element): AnchoredRect => {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
};

/**
 * Where the bar over a selection that `element` is in sits now: its anchored wrapper says so
 * in `data-placement` (`Anchored` in `@embedpdf/react`), `bottom…` once it went below.
 */
export const selectionBarSideOf = (element: Element): SelectionBarSide =>
  element.closest('[data-placement]')?.getAttribute('data-placement')?.startsWith('bottom')
    ? 'below'
    : 'above';

/**
 * Place `element` (`position: fixed`, in the top layer) around `box`, `gap` px from it and from
 * the window's edges.
 */
export function placeInWindow(
  element: HTMLElement,
  box: AnchoredRect,
  placement: AnchoredPlacement,
  gap: number,
): void {
  const view = anchoredViewOf(element, 'client');
  if (!view) return;
  const size = { width: element.offsetWidth, height: element.offsetHeight };
  const { left, top } = fitAnchoredRect(box, placement, gap, { size, view });
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
  // Without the top layer, `position: fixed` starts at the viewer's box (its `contain`):
  // move by however far from the window's origin the element landed.
  const landed = element.getBoundingClientRect();
  if (Math.abs(landed.left - left) > 0.5 || Math.abs(landed.top - top) > 0.5) {
    element.style.left = `${2 * left - landed.left}px`;
    element.style.top = `${2 * top - landed.top}px`;
  }
}
