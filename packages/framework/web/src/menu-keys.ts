/**
 * The keyboard of an open menu (the ARIA menu button pattern). The menu
 * takes focus on its first item; Up, Down, Home and End move between items,
 * passing over the ones that can't be used now; typing jumps to the next item
 * that starts with what was typed; Enter and Space pick; Escape closes the
 * menu and gives focus back to its button, and Tab closes it and moves on
 * from that button. While the menu is open, its button says so with
 * `aria-expanded`.
 */
import { deepActiveElementOf, isUnavailable } from './focusable';
import { rovingMoveOf, rovingTargetOf } from './roving-focus';

/** How long typed letters keep adding to one search, in milliseconds. */
const TYPEAHEAD_RESET_MS = 500;

/** The menu's items when no `items` is given: its menu-item roles, in order. */
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]';

/**
 * The item typeahead lands on: the first one from `current` on, wrapping, that
 * is available and whose label starts with `query` (any case). A one-letter
 * query starts after `current`, so typing the same letter again moves on, and
 * a query of one letter repeated ("ppp") cycles like that letter. -1 when no
 * item matches.
 */
export function typeaheadMatchOf(
  labels: readonly string[],
  current: number,
  query: string,
  available: (index: number) => boolean,
): number {
  const typed = query.toLocaleLowerCase();
  const repeated = typed.length > 1 && [...typed].every((letter) => letter === typed[0]);
  const search = repeated ? typed[0]! : typed;
  const offset = search.length === 1 ? 1 : 0;
  const count = labels.length;
  for (let taken = 0; taken < count; taken += 1) {
    const index = (((current + offset + taken) % count) + count) % count;
    if (available(index) && labels[index]!.toLocaleLowerCase().startsWith(search)) return index;
  }
  return -1;
}

/**
 * The words typeahead matches an item by: its `aria-label`, else its text,
 * without the marks a row may start with (a bullet, a check, an icon glyph).
 */
export function menuItemLabelOf(item: Element): string {
  const label = item.getAttribute('aria-label') ?? item.textContent ?? '';
  return label.trim().replace(/^[^\p{L}\p{N}]+/u, '');
}

export interface MenuKeysOptions {
  /** The button that opened the menu: it says it's expanded, and gets focus back. */
  readonly trigger: HTMLElement | null;
  /** Close the menu; removing it is the caller's. */
  readonly close: () => void;
  /** The items, in order. Default: the menu's `menuitem`, `menuitemradio` and `menuitemcheckbox` elements. */
  readonly items?: () => readonly HTMLElement[];
  /** Which item takes focus when the menu opens. Default `'first'`. */
  readonly initialFocus?: 'first' | 'last' | 'none';
}

/**
 * Drive an open `menu` from the keyboard until the returned detach runs.
 * Detaching (the menu closed) gives focus back to the trigger when focus was
 * in the menu or went nowhere, and never when the user moved it elsewhere.
 */
export function attachMenuKeys(menu: HTMLElement, options: MenuKeysOptions): () => void {
  const { trigger, close } = options;
  const items =
    options.items ?? (() => [...menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)]);
  let typed = '';
  let typedAt = Number.NEGATIVE_INFINITY;

  // Items take focus from the arrows only, so Tab leaves the menu instead of walking through it.
  const listed = () => {
    const list = items();
    for (const item of list) if (item.tabIndex !== -1) item.tabIndex = -1;
    return list;
  };
  const available = (list: readonly HTMLElement[]) => (index: number) =>
    !isUnavailable(list[index]!);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    const list = listed();
    const from = list.indexOf(event.target as HTMLElement);

    if (event.key === 'Escape') {
      event.preventDefault();
      // The menu closes, not the dialog or panel it opened over.
      event.stopPropagation();
      close();
      trigger?.focus();
      return;
    }
    if (event.key === 'Tab') {
      // Focus goes back to the button first, so Tab moves on from there.
      close();
      trigger?.focus();
      return;
    }
    if ((event.key === 'Enter' || (event.key === ' ' && typed === '')) && from >= 0) {
      event.preventDefault();
      if (!isUnavailable(list[from]!)) list[from]!.click();
      return;
    }
    const move = event.shiftKey ? null : rovingMoveOf(event.key, 'vertical', 'ltr');
    if (move) {
      event.preventDefault();
      const to = rovingTargetOf(move, from, list.length, available(list), true);
      if (to >= 0) list[to]!.focus();
      return;
    }
    if (event.key.length === 1) {
      if (event.timeStamp - typedAt > TYPEAHEAD_RESET_MS) typed = '';
      typed += event.key;
      typedAt = event.timeStamp;
      const labels = list.map(menuItemLabelOf);
      const to = typeaheadMatchOf(labels, from, typed, available(list));
      if (to >= 0) {
        event.preventDefault();
        list[to]!.focus();
      }
    }
  };

  // A native button would click again on the Space key's release.
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === ' ' && !event.defaultPrevented) event.preventDefault();
  };

  menu.addEventListener('keydown', onKeyDown);
  menu.addEventListener('keyup', onKeyUp);
  trigger?.setAttribute('aria-expanded', 'true');

  const initial = options.initialFocus ?? 'first';
  if (initial !== 'none') {
    const list = listed();
    const to = rovingTargetOf(initial, -1, list.length, available(list), false);
    if (to >= 0) list[to]!.focus();
  }

  return () => {
    menu.removeEventListener('keydown', onKeyDown);
    menu.removeEventListener('keyup', onKeyUp);
    trigger?.setAttribute('aria-expanded', 'false');
    const active = deepActiveElementOf(menu.ownerDocument);
    if (trigger && (active === null || menu.contains(active))) trigger.focus();
  };
}
