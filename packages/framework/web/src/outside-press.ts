/**
 * Call `onPress` when a pointer press starts anywhere in `element`'s document
 * outside `element`: how a menu closes when the user presses somewhere else,
 * in the viewer or on the page around it. Where the press landed is read from
 * its composed path: at the document, an event from inside a shadow root is
 * retargeted to the shadow host, so `element.contains(event.target)` would
 * call every press inside a shadow-rooted menu an outside one. Listens in the
 * capture phase, so a handler that stops the press can't keep a menu open.
 * Returns the stop.
 */
export function observeOutsidePress(
  element: Element,
  onPress: (event: PointerEvent) => void,
): () => void {
  const doc = element.ownerDocument;
  const listener = (event: PointerEvent) => {
    if (!event.composedPath().includes(element)) onPress(event);
  };
  doc.addEventListener('pointerdown', listener, true);
  return () => doc.removeEventListener('pointerdown', listener, true);
}
