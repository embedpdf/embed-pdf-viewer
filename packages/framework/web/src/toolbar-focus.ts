/**
 * A toolbar's keyboard: one tab stop, and arrow keys along the bar
 * ({@link attachRovingFocus}). Each item of the live row (a command, your own
 * item, a folded group, the "More" button) sits in an element marked with
 * {@link TOOLBAR_ITEM_ATTRIBUTE}, and the first element in it that takes focus
 * is the item's stop: the rest of a custom item's controls are its own.
 */
import { focusablesIn } from './focusable';
import type { Orientation } from './orientation';
import type { RovingFocus } from './roving-focus';
import { attachRovingFocus } from './roving-focus';

/** The attribute on the element around each item of a toolbar's live row. */
export const TOOLBAR_ITEM_ATTRIBUTE = 'data-epdf-toolbar-item';

/**
 * A toolbar's stops: the first element of each item that takes focus, in
 * order. A menu an item holds open is not part of its stop.
 */
export function toolbarStopsOf(toolbar: ParentNode): HTMLElement[] {
  const stops: HTMLElement[] = [];
  for (const item of toolbar.querySelectorAll(`[${TOOLBAR_ITEM_ATTRIBUTE}]`)) {
    const stop = focusablesIn(item).find((element) => {
      const menu = element.closest('[role="menu"]');
      return menu === null || !item.contains(menu);
    });
    if (stop) stops.push(stop);
  }
  return stops;
}

/** Arrow keys between a toolbar's items, along its orientation; `refresh()` after each render. */
export function attachToolbarFocus(toolbar: HTMLElement, orientation: Orientation): RovingFocus {
  return attachRovingFocus(toolbar, { orientation, stops: () => toolbarStopsOf(toolbar) });
}
