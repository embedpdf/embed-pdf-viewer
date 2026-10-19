// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { attachMenuKeys, menuItemLabelOf, typeaheadMatchOf } from '../src/menu-keys';
import type { MenuKeysOptions } from '../src/menu-keys';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('typeaheadMatchOf', () => {
  const labels = ['Print', 'Properties', 'Download', 'Present'];
  const all = () => true;

  it('finds the next item starting with a letter, wrapping, in any case', () => {
    expect(typeaheadMatchOf(labels, -1, 'p', all)).toBe(0);
    expect(typeaheadMatchOf(labels, 0, 'p', all)).toBe(1);
    expect(typeaheadMatchOf(labels, 3, 'P', all)).toBe(0);
    expect(typeaheadMatchOf(labels, 0, 'x', all)).toBe(-1);
  });

  it('matches a longer query from the current item on, and cycles a repeated letter', () => {
    expect(typeaheadMatchOf(labels, 0, 'pre', all)).toBe(3);
    expect(typeaheadMatchOf(labels, 1, 'pr', all)).toBe(1);
    expect(typeaheadMatchOf(labels, 1, 'pp', all)).toBe(3);
  });

  it('passes over items that are not available', () => {
    expect(typeaheadMatchOf(labels, -1, 'p', (index) => index !== 0)).toBe(1);
  });
});

describe('menuItemLabelOf', () => {
  it('is the aria-label, else the text without the marks it starts with', () => {
    const item = document.createElement('button');
    item.textContent = ' • Fit width ▸';
    expect(menuItemLabelOf(item)).toBe('Fit width ▸');
    item.setAttribute('aria-label', 'Zoom');
    expect(menuItemLabelOf(item)).toBe('Zoom');
  });
});

/** A trigger and the menu it opened, attached. */
function openMenu(options: Partial<MenuKeysOptions> = {}) {
  const trigger = document.createElement('button');
  trigger.textContent = 'More';
  const menu = document.createElement('div');
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `
    <button role="menuitem" id="print">Print</button>
    <button role="menuitem" id="properties" disabled>Properties</button>
    <button role="menuitem" id="download">Download</button>
    <button role="menuitemradio" id="present">• Present</button>
  `;
  document.body.append(trigger, menu);
  const close = vi.fn();
  const detach = attachMenuKeys(menu, { trigger, close, ...options });
  const item = (id: string) => menu.querySelector<HTMLElement>(`#${id}`)!;
  /** Press a key on what has focus, `atMs` into the test (typeahead reads the event's time). */
  const press = (key: string, init: KeyboardEventInit = {}, atMs = 0) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    Object.defineProperty(event, 'timeStamp', { value: atMs });
    (document.activeElement ?? menu).dispatchEvent(event);
    return event;
  };
  return { trigger, menu, close, detach, item, press };
}

describe('attachMenuKeys', () => {
  it('focuses the first item, takes the items out of the tab order and says the button is expanded', () => {
    const { trigger, item } = openMenu();
    expect(document.activeElement).toBe(item('print'));
    expect(item('download').tabIndex).toBe(-1);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('can open on the last item, or leave focus where it is', () => {
    const { item } = openMenu({ initialFocus: 'last' });
    expect(document.activeElement).toBe(item('present'));
    document.body.innerHTML = '';
    openMenu({ initialFocus: 'none' });
    expect(document.activeElement).toBe(document.body);
  });

  it('moves with Up, Down, Home and End, passing over a disabled item and wrapping', () => {
    const { item, press } = openMenu();
    expect(press('ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(item('download'));
    press('End');
    expect(document.activeElement).toBe(item('present'));
    press('ArrowDown');
    expect(document.activeElement).toBe(item('print'));
    press('ArrowUp');
    expect(document.activeElement).toBe(item('present'));
    press('Home');
    expect(document.activeElement).toBe(item('print'));
  });

  it('jumps to the item that starts with what was typed, past marks like a bullet', () => {
    const { item, press } = openMenu();
    press('p', {}, 0);
    expect(document.activeElement).toBe(item('present'));
    // Typed together, "pd" names no item; half a second later, "d" starts a new search.
    press('d', {}, 100);
    expect(document.activeElement).toBe(item('present'));
    press('d', {}, 700);
    expect(document.activeElement).toBe(item('download'));
  });

  it('picks the focused item with Enter and with Space', () => {
    const { item, press } = openMenu();
    const picked = vi.fn();
    item('print').addEventListener('click', picked);
    expect(press('Enter').defaultPrevented).toBe(true);
    expect(press(' ').defaultPrevented).toBe(true);
    expect(picked).toHaveBeenCalledTimes(2);
  });

  it('closes on Escape, keeps the key from whatever is around it, and focuses the button', () => {
    const { trigger, close, press } = openMenu();
    const outside = vi.fn();
    document.body.addEventListener('keydown', outside);
    press('Escape');
    expect(close).toHaveBeenCalledTimes(1);
    expect(outside).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on Tab from the button, so Tab moves on from there', () => {
    const { trigger, close, press } = openMenu();
    expect(press('Tab').defaultPrevented).toBe(false);
    expect(close).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it('gives focus back to the button when the menu closes with focus in it or lost', () => {
    const { trigger, menu, detach } = openMenu();
    menu.remove();
    detach();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves focus where the user moved it when the menu closes', () => {
    const { detach } = openMenu();
    const elsewhere = document.createElement('input');
    document.body.append(elsewhere);
    elsewhere.focus();
    detach();
    expect(document.activeElement).toBe(elsewhere);
  });
});
