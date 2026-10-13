// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { attachRovingFocus, rovingMoveOf, rovingTargetOf } from '../src/roving-focus';
import type { RovingFocusOptions } from '../src/roving-focus';

afterEach(() => {
  document.body.innerHTML = '';
});

describe('rovingMoveOf', () => {
  it('follows the row: Left and Right across, Up and Down down, Home and End either way', () => {
    expect(rovingMoveOf('ArrowRight', 'horizontal', 'ltr')).toBe('next');
    expect(rovingMoveOf('ArrowLeft', 'horizontal', 'ltr')).toBe('previous');
    expect(rovingMoveOf('ArrowDown', 'horizontal', 'ltr')).toBeNull();
    expect(rovingMoveOf('ArrowDown', 'vertical', 'ltr')).toBe('next');
    expect(rovingMoveOf('ArrowUp', 'vertical', 'ltr')).toBe('previous');
    expect(rovingMoveOf('ArrowRight', 'vertical', 'ltr')).toBeNull();
    expect(rovingMoveOf('Home', 'vertical', 'ltr')).toBe('first');
    expect(rovingMoveOf('End', 'horizontal', 'rtl')).toBe('last');
    expect(rovingMoveOf('a', 'horizontal', 'ltr')).toBeNull();
  });

  it('swaps Left and Right in right-to-left text, and only those', () => {
    expect(rovingMoveOf('ArrowLeft', 'horizontal', 'rtl')).toBe('next');
    expect(rovingMoveOf('ArrowRight', 'horizontal', 'rtl')).toBe('previous');
    expect(rovingMoveOf('ArrowDown', 'vertical', 'rtl')).toBe('next');
  });
});

describe('rovingTargetOf', () => {
  const all = () => true;

  it('steps to the neighbour, wrapping around the ends when it loops', () => {
    expect(rovingTargetOf('next', 0, 3, all, true)).toBe(1);
    expect(rovingTargetOf('next', 2, 3, all, true)).toBe(0);
    expect(rovingTargetOf('previous', 0, 3, all, true)).toBe(2);
    expect(rovingTargetOf('next', 2, 3, all, false)).toBe(-1);
    expect(rovingTargetOf('previous', 0, 3, all, false)).toBe(-1);
  });

  it('passes over the stops that are not available', () => {
    const available = (index: number) => index !== 1;
    expect(rovingTargetOf('next', 0, 3, available, true)).toBe(2);
    expect(rovingTargetOf('first', -1, 3, (index) => index > 0, true)).toBe(1);
    expect(rovingTargetOf('last', 0, 3, (index) => index < 2, true)).toBe(1);
    // The only available stop is the current one: nowhere to go.
    expect(rovingTargetOf('next', 0, 3, (index) => index === 0, true)).toBe(-1);
    expect(rovingTargetOf('first', -1, 0, all, true)).toBe(-1);
  });
});

/** A row of three buttons (the third disabled) and a text field, attached. */
function row(options: Partial<RovingFocusOptions> = {}) {
  const container = document.createElement('div');
  container.innerHTML = `
    <button id="a">A</button>
    <button id="b">B</button>
    <button id="c" disabled>C</button>
    <input id="d" />
  `;
  document.body.append(container);
  const stops = () => [...container.querySelectorAll<HTMLElement>('button, input')];
  const roving = attachRovingFocus(container, { orientation: 'horizontal', stops, ...options });
  const element = (id: string) => container.querySelector<HTMLElement>(`#${id}`)!;
  const press = (key: string, init: KeyboardEventInit = {}) => {
    const target = (document.activeElement as HTMLElement | null) ?? container;
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  };
  const tabIndexes = () => stops().map((stop) => stop.tabIndex);
  return { container, roving, element, press, tabIndexes };
}

describe('attachRovingFocus', () => {
  it('makes the first usable stop the one tab stop', () => {
    const { tabIndexes } = row();
    expect(tabIndexes()).toEqual([0, -1, -1, -1]);
  });

  it('moves focus and the tab stop with the arrows, passing over a disabled stop', () => {
    const { element, press, tabIndexes } = row();
    element('a').focus();
    expect(press('ArrowRight').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(element('b'));
    press('ArrowRight');
    expect(document.activeElement).toBe(element('d'));
    expect(tabIndexes()).toEqual([-1, -1, -1, 0]);
  });

  it('goes to the ends with Home and End, and wraps around at them', () => {
    const { element, press } = row();
    element('b').focus();
    press('Home');
    expect(document.activeElement).toBe(element('a'));
    press('ArrowLeft');
    // The input is the last stop; Left from the first wraps to it.
    expect(document.activeElement).toBe(element('d'));
  });

  it('leaves a text field its caret keys', () => {
    const { element, press } = row();
    element('d').focus();
    expect(press('ArrowLeft').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(element('d'));
  });

  it('moves with Up and Down in a vertical row, and leaves Left and Right alone', () => {
    const { element, press } = row({ orientation: 'vertical' });
    element('a').focus();
    expect(press('ArrowRight').defaultPrevented).toBe(false);
    press('ArrowDown');
    expect(document.activeElement).toBe(element('b'));
    press('ArrowUp');
    expect(document.activeElement).toBe(element('a'));
  });

  it('swaps Left and Right in right-to-left text', () => {
    const { element, press } = row({ direction: () => 'rtl' });
    element('a').focus();
    press('ArrowLeft');
    expect(document.activeElement).toBe(element('b'));
  });

  it('reads right-to-left from the container’s direction', () => {
    const { container, element, press } = row();
    container.style.direction = 'rtl';
    element('b').focus();
    press('ArrowRight');
    expect(document.activeElement).toBe(element('a'));
  });

  it('stops without looping at the ends', () => {
    const { element, press } = row({ loop: false });
    element('a').focus();
    expect(press('ArrowLeft').defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(element('a'));
  });

  it('leaves keys with a modifier, and keys a handler already took', () => {
    const { element, press } = row();
    element('a').focus();
    press('ArrowRight', { ctrlKey: true });
    press('ArrowRight', { shiftKey: true });
    expect(document.activeElement).toBe(element('a'));
    element('a').addEventListener('keydown', (event) => event.preventDefault(), { once: true });
    press('ArrowRight');
    expect(document.activeElement).toBe(element('a'));
  });

  it('makes a stop focused another way the tab stop', () => {
    const { element, tabIndexes } = row();
    element('b').focus();
    expect(tabIndexes()).toEqual([-1, 0, -1, -1]);
  });

  it('gives the tab stop back to the first usable stop when its stop goes away or is disabled', () => {
    const { element, roving, tabIndexes } = row();
    element('b').focus();
    (element('b') as HTMLButtonElement).disabled = true;
    roving.refresh();
    expect(tabIndexes()).toEqual([0, -1, -1, -1]);

    element('a').remove();
    roving.refresh();
    // B and C are disabled now; the input is the first usable stop.
    expect(element('d').tabIndex).toBe(0);
  });

  it('keeps the tab stop on the first usable stop until one has had focus', () => {
    const container = document.createElement('div');
    container.innerHTML = '<button id="first">First</button><button id="later">Later</button>';
    document.body.append(container);
    // The row's first render shows only its last stop; the next one shows both.
    let shown = ['later'];
    const stops = () => shown.map((id) => container.querySelector<HTMLElement>(`#${id}`)!);
    const roving = attachRovingFocus(container, { orientation: 'horizontal', stops });
    expect(stops().map((stop) => stop.tabIndex)).toEqual([0]);
    shown = ['first', 'later'];
    roving.refresh();
    expect(stops().map((stop) => stop.tabIndex)).toEqual([0, -1]);
  });

  it('stops handling keys once detached', () => {
    const { element, roving, press } = row();
    element('a').focus();
    roving.detach();
    press('ArrowRight');
    expect(document.activeElement).toBe(element('a'));
  });
});
