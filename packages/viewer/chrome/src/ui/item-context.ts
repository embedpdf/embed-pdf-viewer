/**
 * Where your own toolbar item sits, as the viewer tells it: which way its bar
 * runs, the bar's place, the variant the toolbar picked, and the viewer's
 * size. The viewer writes it on the element you slot in, as `data-orientation`,
 * `data-edge`, `data-variant` and `data-size`, and keeps it there while the
 * bar moves and the viewer resizes; page CSS reads those, and so do the
 * framework wrappers (`useToolbarItem()`).
 */
import type { ViewerSize } from '@embedpdf/core-ui';

import type { BarEdge } from './bar-edge';

/** The place of the bar an item sits in: an edge, floating over the pages, or over a selection. */
export type ToolbarItemEdge = 'top' | 'bottom' | 'start' | 'end' | 'float' | 'selection';

/** Where your own toolbar item sits. */
export interface ToolbarItemContext {
  /** Which way the bar runs. */
  readonly orientation: 'horizontal' | 'vertical';
  /** The bar's place. */
  readonly edge: ToolbarItemEdge;
  /** Which of the item's `variants` the toolbar picked, or null for an item without its own. */
  readonly variant: string | null;
  /** The viewer's size. */
  readonly size: ViewerSize;
}

/** The attribute each field of a {@link ToolbarItemContext} is written to. */
export const TOOLBAR_ITEM_CONTEXT_ATTRIBUTES = {
  orientation: 'data-orientation',
  edge: 'data-edge',
  variant: 'data-variant',
  size: 'data-size',
} as const satisfies Record<keyof ToolbarItemContext, string>;

/** The public place of a bar on `edge`: a floating bar is `float`, whichever half it floats in. */
export const toolbarItemEdgeOf = (edge: BarEdge): ToolbarItemEdge =>
  edge === 'float-top' || edge === 'float-bottom' ? 'float' : edge;

/** Write `context` on `element`, changing only the attributes that differ. */
export function writeToolbarItemContext(element: Element, context: ToolbarItemContext): void {
  for (const [field, attribute] of Object.entries(TOOLBAR_ITEM_CONTEXT_ATTRIBUTES)) {
    const value = context[field as keyof ToolbarItemContext];
    if (value === null) element.removeAttribute(attribute);
    else if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  }
}
