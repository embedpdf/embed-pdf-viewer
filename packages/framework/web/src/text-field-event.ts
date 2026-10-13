/** Telling a key or a copy meant for a text field from one meant for the viewer around it. */

/**
 * Whether an event comes from a text field: an input, a text area, a select or editable
 * content. Read from the event's first target, so a field inside a shadow root counts too
 * (a listener on the document sees the shadow host as the target).
 */
export function isFromTextField(event: Event): boolean {
  const element = (event.composedPath?.()[0] ?? event.target) as HTMLElement | null;
  if (!element || !element.tagName) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
}
