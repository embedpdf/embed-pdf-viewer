/**
 * Which elements take keyboard focus, for the keyboard models (a toolbar's
 * stops, a menu's items, a dialog's tab order). Decided from the markup only,
 * never from layout, so it answers the same before the first paint: `hidden`,
 * `inert` and `disabled` count; a `display: none` from a stylesheet doesn't.
 */

/** Elements that can take focus, before {@link canTakeFocus} rules out the disabled and the hidden. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  'summary',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(', ');

/** Form controls the `disabled` attribute takes focus from. */
const DISABLEABLE = new Set([
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'FIELDSET',
  'OPTGROUP',
  'OPTION',
]);

/** Whether an element can take focus now: focusable markup, not disabled, not hidden or inert. */
export function canTakeFocus(element: Element): boolean {
  if (!element.matches(FOCUSABLE_SELECTOR)) return false;
  if (DISABLEABLE.has(element.tagName) && (element as HTMLButtonElement).disabled) return false;
  return element.closest('[hidden], [inert]') === null;
}

/** Whether Tab stops at an element: it takes focus and its `tabIndex` isn't negative. */
export function isTabbable(element: Element): element is HTMLElement {
  return canTakeFocus(element) && (element as HTMLElement).tabIndex >= 0;
}

/** The elements inside `root` that can take focus, in document order. */
export function focusablesIn(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(canTakeFocus);
}

/** The elements inside `root` that Tab stops at, in document order. */
export function tabbablesIn(root: ParentNode): HTMLElement[] {
  return focusablesIn(root).filter((element) => element.tabIndex >= 0);
}

/**
 * The element that has focus, looking into shadow roots: the document's
 * `activeElement` is only the outermost shadow host. Null when nothing has
 * focus (the body).
 */
export function deepActiveElementOf(doc: Document): Element | null {
  let active: Element | null = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active === doc.body ? null : active;
}

/**
 * Whether a control says it can't be used now, through `disabled` or
 * `aria-disabled="true"`: the keyboard models pass over it.
 */
export function isUnavailable(element: Element): boolean {
  if (DISABLEABLE.has(element.tagName) && (element as HTMLButtonElement).disabled) return true;
  return element.getAttribute('aria-disabled') === 'true';
}

/** Input types that type text, so they keep Left, Right, Home and End for the caret. */
const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password']);

/** Input types that change their value with the arrow keys, both ways. */
const STEPPED_INPUT_TYPES = new Set([
  'number',
  'range',
  'radio',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

/** Roles of widgets that move with the arrow keys themselves. */
const ARROW_ROLES = new Set([
  'slider',
  'spinbutton',
  'combobox',
  'textbox',
  'listbox',
  'tree',
  'grid',
]);

/**
 * Whether a focused control uses `key` itself, so a keyboard model around it
 * must leave the key alone: a text field moves its caret with Left, Right,
 * Home and End; a select changes with Up and Down; a slider takes them all.
 */
export function usesKey(element: Element, key: string): boolean {
  const horizontal = key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Home' || key === 'End';
  const vertical = key === 'ArrowUp' || key === 'ArrowDown';
  if (!horizontal && !vertical) return false;
  if ((element as HTMLElement).isContentEditable || element.tagName === 'TEXTAREA') return true;
  if (element.tagName === 'SELECT') return vertical;
  if (element.tagName === 'INPUT') {
    const type = (element.getAttribute('type') ?? '').toLowerCase();
    return STEPPED_INPUT_TYPES.has(type) || (TEXT_INPUT_TYPES.has(type) && horizontal);
  }
  const role = element.getAttribute('role');
  return role !== null && ARROW_ROLES.has(role);
}
