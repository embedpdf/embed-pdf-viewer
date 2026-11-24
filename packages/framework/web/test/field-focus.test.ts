// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { bindFieldFocus, type FieldFocusForm } from '../src/field-focus';

afterEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

type Target = { takesCursor(): boolean; focus(options: { readonly select: boolean }): boolean };

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

  it("in a control of an app's own, the cursor goes into the first element Tab stops at", () => {
    document.body.innerHTML = `
      <div id="box">
        <span>Label</span>
        <button id="skipped" tabindex="-1"></button>
        <button id="off" disabled></button>
        <input type="hidden" />
        <div id="switch" role="switch" tabindex="0"></div>
        <input id="later" />
      </div>`;
    const { form, targets } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'agree', { custom: true });
    targets.get('agree')!.focus({ select: true });
    expect(document.activeElement).toBe(document.getElementById('switch'));
  });

  it('a box that holds a control says it takes the cursor', () => {
    document.body.innerHTML =
      '<div id="text"><input /></div><div id="check" tabindex="0"></div><div id="radio" tabindex="-1"></div>';
    const { form, targets } = fakeForm();
    bindFieldFocus(document.getElementById('text')!, form, 'text');
    bindFieldFocus(document.getElementById('check')!, form, 'check');
    // A box asked to take the cursor itself does, Tab stop or not, as a radio group's buttons are.
    bindFieldFocus(document.getElementById('radio')!, form, 'radio', { radio: true });
    expect(targets.get('text')!.takesCursor()).toBe(true);
    expect(targets.get('check')!.takesCursor()).toBe(true);
    expect(targets.get('radio')!.takesCursor()).toBe(true);
  });

  it('a box that is only a picture says it takes no cursor, and takes none', () => {
    // A signature field with nothing to sign it: the layer draws no control in its box.
    document.body.innerHTML = '<input id="before" /><div id="box"></div>';
    const before = document.getElementById('before')!;
    const box = document.getElementById('box')!;
    const focus = vi.spyOn(box, 'focus');
    const { form, targets } = fakeForm();
    bindFieldFocus(box, form, 'sign', { focusable: false });
    before.focus();
    expect(targets.get('sign')!.takesCursor()).toBe(false);
    targets.get('sign')!.focus({ select: true });
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(before);
  });

  it("a control of an app's own with nothing Tab stops at takes no cursor, until it has one", () => {
    document.body.innerHTML = `
      <input id="before" />
      <div id="box">
        <span>Signed on paper</span>
        <button tabindex="-1"></button>
        <button disabled></button>
      </div>`;
    const before = document.getElementById('before')!;
    const box = document.getElementById('box')!;
    const focus = vi.spyOn(box, 'focus');
    const { form, targets } = fakeForm();
    bindFieldFocus(box, form, 'sign', { custom: true });
    before.focus();
    expect(targets.get('sign')!.takesCursor()).toBe(false);
    targets.get('sign')!.focus({ select: false });
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(before);

    // The control draws a button later: the box answers from what it holds when asked.
    const sign = document.createElement('button');
    box.append(sign);
    expect(targets.get('sign')!.takesCursor()).toBe(true);
    targets.get('sign')!.focus({ select: false });
    expect(document.activeElement).toBe(sign);
  });

  it("a control of an app's own whose only element can't take focus takes no cursor", () => {
    document.head.innerHTML =
      '<style>.gone { display: none; } .unseen { visibility: hidden; }</style>';
    document.body.innerHTML = `
      <input id="before" />
      <div data-case="hidden"><button hidden></button></div>
      <div data-case="in a hidden part"><div hidden><button></button></div></div>
      <div data-case="in an inert part"><div inert><button></button></div></div>
      <div data-case="disabled"><button disabled></button></div>
      <div data-case="display: none"><button class="gone"></button></div>
      <div data-case="in a part with display: none"><div class="gone"><button></button></div></div>
      <div data-case="visibility: hidden"><button class="unseen"></button></div>`;
    const before = document.getElementById('before')!;
    const { form, targets } = fakeForm();
    for (const box of document.querySelectorAll<HTMLElement>('[data-case]')) {
      const name = box.dataset.case!;
      bindFieldFocus(box, form, name, { custom: true });
      before.focus();
      expect(targets.get(name)!.takesCursor(), name).toBe(false);
      expect(targets.get(name)!.focus({ select: false }), name).toBe(false);
      expect(document.activeElement, name).toBe(before);
    }
  });

  it("in a control of an app's own, the cursor goes past what can't take focus to what can", () => {
    document.head.innerHTML = '<style>.gone { display: none; }</style>';
    document.body.innerHTML = `
      <div id="box">
        <button hidden></button>
        <button class="gone"></button>
        <div inert><input /></div>
        <input id="field" value="Ada" />
      </div>`;
    const field = document.getElementById('field') as HTMLInputElement;
    const { form, targets } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'name', { custom: true });
    expect(targets.get('name')!.takesCursor()).toBe(true);
    expect(targets.get('name')!.focus({ select: true })).toBe(true);
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
  });

  it("a control of an app's own answers whether the cursor went in", () => {
    document.body.innerHTML = `
      <input id="before" />
      <div id="box"><button id="first"></button><button id="second"></button></div>`;
    const before = document.getElementById('before')!;
    const first = document.getElementById('first')!;
    const second = document.getElementById('second')!;
    const { form, targets } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'sign', { custom: true });

    // The browser ignores `focus()` on what it won't focus, for a reason the markup doesn't
    // show: the cursor is where it was, and the next element is asked.
    vi.spyOn(first, 'focus').mockImplementation(() => {});
    before.focus();
    expect(targets.get('sign')!.focus({ select: false })).toBe(true);
    expect(document.activeElement).toBe(second);

    // Nothing in the box takes it: the target says so.
    vi.spyOn(second, 'focus').mockImplementation(() => {});
    before.focus();
    expect(targets.get('sign')!.focus({ select: false })).toBe(false);
    expect(document.activeElement).toBe(before);

    // A control that hands the cursor on, to a picker it opens elsewhere, took it.
    const picker = document.createElement('input');
    document.body.append(picker);
    vi.spyOn(first, 'focus').mockImplementation(() => picker.focus());
    before.focus();
    expect(targets.get('sign')!.focus({ select: false })).toBe(true);
    expect(document.activeElement).toBe(picker);
  });

  it("the layer's own control always answers that the cursor went in", () => {
    document.body.innerHTML = '<div id="box"><input id="field" /></div>';
    const { form, targets } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'name');
    expect(targets.get('name')!.focus({ select: false })).toBe(true);
    expect(document.activeElement).toBe(document.getElementById('field'));
  });

  it("a control of an app's own with a text box in it has its text selected when asked", () => {
    document.body.innerHTML =
      '<div id="box"><div><input id="field" value="Ada" /></div><button tabindex="-1"></button></div>';
    const field = document.getElementById('field') as HTMLInputElement;
    const { form, targets } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'name', { custom: true });
    targets.get('name')!.focus({ select: true });
    expect(document.activeElement).toBe(field);
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 3]);
  });

  it("a control of an app's own sends Tab through the form from any element inside it", () => {
    document.body.innerHTML =
      '<div id="box"><div id="switch" role="switch" tabindex="0"></div></div>';
    const { form } = fakeForm();
    bindFieldFocus(document.getElementById('box')!, form, 'agree', { custom: true });
    expect(press(document.getElementById('switch')!, 'Tab').defaultPrevented).toBe(true);
    expect(form.focusNext).toHaveBeenCalledWith({ backward: false });
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
