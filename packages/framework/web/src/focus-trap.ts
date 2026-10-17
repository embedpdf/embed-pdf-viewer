/**
 * Keep keyboard focus inside a dialog or sheet while it's open. It takes
 * focus when the trap starts, unless focus is inside already (the control you
 * name, else its first one that Tab stops at, else the container itself); Tab
 * and Shift+Tab go round its controls without leaving it; focus that lands
 * outside comes back; and when the trap is released, focus returns to where it
 * was before. Traps nest: only the one started last acts, until it's released.
 */
import { containsFocus, deepActiveElementOf, tabbablesIn } from './focusable';

/**
 * Move focus into `container` unless it's there already: to `initialFocus`, else its first
 * control Tab stops at, else the container itself. Focus already inside stays where it is, so a
 * control that took focus as it appeared (a search field asking for the cursor) keeps it.
 */
export function moveFocusInto(container: HTMLElement, initialFocus?: HTMLElement | null): void {
  if (containsFocus(container)) return;
  if (initialFocus) {
    initialFocus.focus();
    return;
  }
  const first = tabbablesIn(container)[0];
  if (first) {
    first.focus();
    return;
  }
  if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
  container.focus();
}

export interface FocusTrapOptions {
  /**
   * What takes focus when the trap starts, unless focus is inside already. Default: the first
   * control Tab stops at.
   */
  readonly initialFocus?: HTMLElement | null;
  /** Whether focus goes back to where it was when the trap is released. Default true. */
  readonly returnFocus?: boolean;
}

/** The traps holding focus now, the innermost last. */
const activeTraps: HTMLElement[] = [];

/** Trap focus in `container` until the returned release runs. */
export function attachFocusTrap(
  container: HTMLElement,
  options: FocusTrapOptions = {},
): () => void {
  const doc = container.ownerDocument;
  const before = deepActiveElementOf(doc) as HTMLElement | null;
  const isInnermost = () => activeTraps[activeTraps.length - 1] === container;
  /** The control that had focus last inside the trap, to go back to. */
  let last: HTMLElement | null = null;

  const focusInside = (edge: 'first' | 'last') => {
    const tabbables = tabbablesIn(container);
    const target = edge === 'first' ? tabbables[0] : tabbables[tabbables.length - 1];
    if (target) {
      target.focus();
      return;
    }
    // Nothing to tab to: the container holds focus itself.
    if (!container.hasAttribute('tabindex')) container.tabIndex = -1;
    container.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.defaultPrevented || !isInnermost()) return;
    const tabbables = tabbablesIn(container);
    const active = deepActiveElementOf(doc);
    const first = tabbables[0];
    const lastTabbable = tabbables[tabbables.length - 1];
    const atStart = active === container || active === first || !first;
    const atEnd = active === lastTabbable || !lastTabbable;
    if (event.shiftKey ? atStart : atEnd) {
      event.preventDefault();
      focusInside(event.shiftKey ? 'last' : 'first');
    }
  };

  // Where focus lands is read from the composed path: at the document, focus inside a shadow
  // root targets its host.
  const onFocusIn = (event: FocusEvent) => {
    if (!isInnermost()) return;
    const path = event.composedPath();
    if (path.includes(container)) {
      last = path[0] as HTMLElement;
      return;
    }
    if (last?.isConnected && container.contains(last)) last.focus();
    else focusInside('first');
  };

  activeTraps.push(container);
  container.addEventListener('keydown', onKeyDown);
  doc.addEventListener('focusin', onFocusIn, true);
  moveFocusInto(container, options.initialFocus);
  // Focus that was inside already took no `focusin` here: it is what focus comes back to.
  if (last === null && containsFocus(container)) last = deepActiveElementOf(doc) as HTMLElement;

  return () => {
    const index = activeTraps.lastIndexOf(container);
    if (index >= 0) activeTraps.splice(index, 1);
    container.removeEventListener('keydown', onKeyDown);
    doc.removeEventListener('focusin', onFocusIn, true);
    if (options.returnFocus !== false && before?.isConnected) before.focus();
  };
}
