/**
 * A field box and the form's cursor. While the box is on screen it lends the form plugin a focus
 * target (`attachFocusTarget`), so `focus()` and `focusNext()` put the cursor in its control: the
 * box itself when it takes focus (a checkbox or radio button), else the form control inside it. It
 * focuses without the browser scrolling, since the Stage brings the box into view. Tab and
 * Shift+Tab, which bubble up to the box, go the form's way, in the document's order and across
 * pages that aren't on screen; past the last field the browser's Tab goes on, out of the form. In
 * a radio button, the arrow keys move between its group's buttons and pick the one they reach. The
 * adapters' form layers bind each field box with it; the rule lives here.
 */

/** What the binding needs from the form plugin; its host capability satisfies it. */
export interface FieldFocusForm<Widget> {
  attachFocusTarget(
    widget: Widget,
    target: { focus(options: { readonly select: boolean }): void },
  ): () => void;
  focusNext(options: { backward?: boolean }): boolean;
  moveInGroup(widget: Widget, backward: boolean): boolean;
}

export interface FieldFocusOptions {
  /** The control is a radio button: the arrow keys move within its group. */
  readonly radio?: boolean;
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

/** Bind a field box to the form's cursor. Returns the unbind. */
export function bindFieldFocus<Widget>(
  box: HTMLElement,
  form: FieldFocusForm<Widget>,
  widget: Widget,
  options: FieldFocusOptions = {},
): () => void {
  const detach = form.attachFocusTarget(widget, {
    focus: ({ select }) => {
      const control = controlIn(box);
      control.focus({ preventScroll: true });
      if (select && hasSelectableText(control)) control.select();
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
