/**
 * Which way a row of controls runs, and which way its text reads: what a
 * toolbar measures along, and what its arrow keys move along.
 */

/** A row of controls side by side, or one under another (`aria-orientation`'s values). */
export type Orientation = 'horizontal' | 'vertical';

/** The writing direction an element lays out in: its computed CSS `direction`. */
export function directionOf(element: Element): 'ltr' | 'rtl' {
  const view = element.ownerDocument.defaultView;
  return view?.getComputedStyle(element).direction === 'rtl' ? 'rtl' : 'ltr';
}
