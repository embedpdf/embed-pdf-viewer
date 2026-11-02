// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindFieldFocus, type FieldFocusForm } from '../src/field-focus';

afterEach(() => {
  document.body.innerHTML = '';
});

type Target = { focus(options: { readonly select: boolean }): void };

/** A form that remembers the targets it was lent and answers Tab with `next`. */
function fakeForm(next = true) {
  const targets = new Map<string, Target>();
  const form = {
    attachFocusTarget: vi.fn((widget: string, target: Target) => {
      targets.set(widget, target);
      return () => targets.delete(widget);
    }),
    focusNext: vi.fn(() => next),
    moveInGroup: vi.fn(() => true),
  } satisfies FieldFocusForm<string>;
  return { form, targets };
}

const press = (element: HTMLElement, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  element.dispatchEvent(event);
  return event;
};

describe('bindFieldFocus', () => {
  it("lends a target that focuses the box's control without scrolling, its text selected if asked", () => {
    document.body.innerHTML = '<div id="box"><input id="field" value="Ada" /></div>';
    const field = document.getElementById('field') as HTMLInputElement;
    const scrollingFocus = vi.spyOn(field, 'focus');
    const { form, targets } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'name');
    targets.get('name')!.focus({ select: true });
    expect(scrollingFocus).toHaveBeenCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
  });

  it("sends Tab and Shift+Tab through the form, and lets the browser's Tab go on past the end", () => {
    document.body.innerHTML = '<div id="box"><input id="field" /></div>';
    const field = document.getElementById('field')!;
    const { form } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'name');
    expect(press(field, 'Tab').defaultPrevented).toBe(true);
    expect(press(field, 'Tab', { shiftKey: true }).defaultPrevented).toBe(true);
    expect(form.focusNext.mock.calls).toEqual([[{ backward: false }], [{ backward: true }]]);

    form.focusNext.mockReturnValue(false);
    expect(press(field, 'Tab').defaultPrevented).toBe(false);
    // Ctrl+Tab is the browser's.
    expect(press(field, 'Tab', { ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it("moves a radio button's arrow keys within its group, and leaves other controls' alone", () => {
    document.body.innerHTML =
      '<div id="radio" tabindex="0"></div><div id="box"><select id="list"></select></div>';
    const radio = document.getElementById('radio')!;
    const list = document.getElementById('list')!;
    const { form, targets } = fakeForm();
    bindFieldFocus(radio, form, 'monthly', { radio: true });
    bindFieldFocus(document.getElementById('box')!, form, 'topics');
    // A radio button's box is its control.
    targets.get('monthly')!.focus({ select: false });
    expect(document.activeElement).toBe(radio);
    expect(press(radio, 'ArrowDown').defaultPrevented).toBe(true);
    expect(press(radio, 'ArrowLeft').defaultPrevented).toBe(true);
    expect(form.moveInGroup.mock.calls).toEqual([
      ['monthly', false],
      ['monthly', true],
    ]);
    expect(press(list, 'ArrowDown').defaultPrevented).toBe(false);
  });

  it('takes the target back and stops listening when unbound', () => {
    document.body.innerHTML = '<input id="field" />';
    const field = document.getElementById('field')!;
    const { form, targets } = fakeForm();
    const unbind = bindFieldFocus(field, form, 'name');
    unbind();
    expect(targets.has('name')).toBe(false);
    press(field, 'Tab');
    expect(form.focusNext).not.toHaveBeenCalled();
  });
});
