/**
 * Keeping a page's own listeners out of controls drawn over it. The Stage
 * listens natively on an ancestor of every page: a press that bubbles to it
 * starts a tool gesture or reads as a click outside (ending an edit), and a
 * wheel pans or zooms the page. A control that owns its gestures stops them
 * with a native listener on itself, which runs during real DOM bubbling,
 * before the Stage's. A framework's own event system may run too late: React
 * dispatches from its root, above the Stage.
 */

/**
 * Stop presses that begin inside `element` from reaching the page, and tell `onPress` about each
 * one. A control that needs the press itself (a link or a form field sending its PDF "mouse down"
 * action) must take it here: once the press stops at the element, a framework that dispatches
 * from its root (React) never sees it. Returns the detach.
 */
export function isolatePointerDown(
  element: HTMLElement,
  onPress?: (event: PointerEvent) => void,
): () => void {
  const stop = (event: PointerEvent) => {
    event.stopPropagation();
    onPress?.(event);
  };
  element.addEventListener('pointerdown', stop);
  return () => element.removeEventListener('pointerdown', stop);
}

/**
 * Stop wheel events inside `element` from reaching the page, so the browser
 * scrolls the element itself (a list box) instead of the Stage panning or
 * zooming. Returns the detach.
 */
export function isolateWheel(element: HTMLElement): () => void {
  const stop = (event: Event) => event.stopPropagation();
  element.addEventListener('wheel', stop);
  return () => element.removeEventListener('wheel', stop);
}
