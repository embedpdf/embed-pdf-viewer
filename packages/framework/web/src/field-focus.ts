/**
 * A field box and the form's cursor. While the box is on screen it lends the form plugin a focus
 * target (`attachFocusTarget`), so `focus()` and `focusNext()` put the cursor in its control: the
 * box itself when it takes focus (a checkbox or radio button), else the form control inside it;
 * in a control of an app's own, the first element that Tab stops at. It
 * focuses without the browser scrolling, since the Stage brings the box into view. Tab and
 * Shift+Tab, which bubble up to the box, go the form's way, in the document's order and across
 * pages that aren't on screen; past the last field the browser's Tab goes on, out of the form. In
 * a radio button, the arrow keys move between its group's buttons and pick the one they reach. The
 * adapters' form layers bind each field box with it; the rule lives here.
 *
 * A box that holds nothing to focus is bound too, and its target says it takes no cursor, so
 * the form passes over it: a box that is only the field's picture (`focusable: false`, a
 * signature field with nothing to sign it), and a control of an app's own with no element that
 * Tab stops at. The target answers from the box as it is when asked. What an app draws may also
 * refuse the cursor for a reason its markup doesn't show, so the target of such a box answers
 * whether the cursor went in.
 */
import { containsFocus, deepActiveElementOf } from './focusable';

/** What the binding needs from the form plugin; its host capability satisfies it. */
export interface FieldFocusForm<Widget> {
  attachFocusTarget(
    widget: Widget,
    target: { takesCursor(): boolean; focus(options: { readonly select: boolean }): boolean },
  ): () => void;
  focusNext(options: { backward?: boolean }): boolean;
  moveInGroup(widget: Widget, backward: boolean): boolean;
}

export interface FieldFocusOptions {
  /** The control is a radio button: the arrow keys move within its group. */
  readonly radio?: boolean;
  /**
   * The box holds a control of an app's own: the cursor goes into the first element inside it
   * that Tab stops at (an input, a button, an element with `tabindex="0"`), wherever it is.
   */
  readonly custom?: boolean;
  /**
   * `false` for a box that holds no control, only the field's picture: a signature field with
   * nothing to sign it. The cursor passes over it.
   */
  readonly focusable?: boolean;
}

/** Whether an element has text that `select()` selects. */
const hasSelectableText = (element: HTMLElement): element is HTMLInputElement =>
  element.tagName === 'INPUT' || element.tagName === 'TEXTAREA';

const BACKWARD = new Set(['ArrowUp', 'ArrowLeft']);
const FORWARD = new Set(['ArrowDown', 'ArrowRight']);

/** The control in a field box: the box when it takes focus itself, else the form control in it. */
const controlIn = (box: HTMLElement): HTMLElement =>
  box.tabIndex >= 0
    ? box
    : (box.querySelector<HTMLElement>('input, textarea, select, button') ?? box);

/** What can take focus without a `tabindex` of its own. */
const FOCUSABLE = 'input, textarea, select, button, a[href], [tabindex], [contenteditable]';

/**
 * Whether an element is drawn: not one a stylesheet hides (`display: none`, `visibility: hidden`),
 * itself or through what holds it. A browser that can't say counts it as drawn.
 */
const isDrawn = (element: HTMLElement): boolean =>
  typeof element.checkVisibility !== 'function' ||
  element.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true });

/**
 * Whether Tab stops at an element now: its `tabindex` when it has one, else what the browser gives
 * it, and never one that is disabled (also by a `<fieldset>`), hidden, inert or not drawn. It is
 * asked when the cursor is about to move, so it may look at what a stylesheet does.
 */
const takesTab = (element: HTMLElement): boolean => {
  if (element.hasAttribute('disabled') || element.matches(':disabled')) return false;
  if (element.tagName === 'INPUT' && element.getAttribute('type') === 'hidden') return false;
  if (element.getAttribute('contenteditable') === 'false') return false;
  if (element.closest('[hidden], [inert]') !== null || !isDrawn(element)) return false;
  const tabIndex = element.getAttribute('tabindex');
  return tabIndex === null || Number(tabIndex) >= 0;
};

/** The elements in a control of an app's own that Tab stops at, in order. */
const tabStopsIn = (box: HTMLElement): HTMLElement[] =>
  Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(takesTab);

/** Bind a field box to the form's cursor. Returns the unbind. */
export function bindFieldFocus<Widget>(
  box: HTMLElement,
  form: FieldFocusForm<Widget>,
  widget: Widget,
  options: FieldFocusOptions = {},
): () => void {
  /** What the cursor can go into, as the box is now, in order; none when it holds nothing to focus. */
  const controls = (): HTMLElement[] => {
    if (options.focusable === false) return [];
    return options.custom ? tabStopsIn(box) : [controlIn(box)];
  };
  /**
   * Put the cursor in an element. The layer's own control takes it. In a control of an app's
   * own, the browser ignores `focus()` on what it won't focus, and the cursor is then where it
   * was: outside the box, and unmoved. A control that hands the cursor on (to a picker it opens
   * elsewhere) took it.
   */
  const enter = (element: HTMLElement): boolean => {
    const before = deepActiveElementOf(box.ownerDocument);
    element.focus({ preventScroll: true });
    if (!options.custom) return true;
    return containsFocus(box) || deepActiveElementOf(box.ownerDocument) !== before;
  };
  const detach = form.attachFocusTarget(widget, {
    takesCursor: () => controls().length > 0,
    focus: ({ select }) => {
      const element = controls().find(enter);
      if (!element) return false;
      if (select && hasSelectableText(element)) element.select();
      return true;
    },
  });
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      if (form.focusNext({ backward: event.shiftKey })) event.preventDefault();
      return;
    }
    if (!options.radio || event.shiftKey) return;
    const backward = BACKWARD.has(event.key);
    if ((backward || FORWARD.has(event.key)) && form.moveInGroup(widget, backward)) {
      event.preventDefault();
    }
  };
  box.addEventListener('keydown', onKeyDown);
  return () => {
    box.removeEventListener('keydown', onKeyDown);
    detach();
  };
}
