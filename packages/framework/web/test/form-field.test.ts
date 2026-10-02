import { describe, expect, it, vi } from 'vitest';

import {
  bindWidgetEvents,
  createOptimisticSelection,
  createTextFieldEditor,
  cssFontOf,
  formColorsOf,
  listBoxStyleOf,
  pressToggle,
  showSelectedOptions,
  textFieldStyleOf,
  type FieldLook,
  type FormColors,
} from '../src/form-field';
import { asElement, fakeElement } from './helpers/fake-element';

const colors: FormColors = { focus: 'F', border: 'B', background: 'BG', text: 'T' };

const look: FieldLook = {
  border: null,
  borderWidth: 1,
  borderStyle: 'dashed',
  background: null,
  color: null,
  fontFamily: 'times-bold',
  fontSize: 10,
  textAlign: 'right',
};

describe('formColorsOf', () => {
  it('paints the focus ring in the accent and an unset edge in the accent at 55%', () => {
    const painted = formColorsOf(
      { focus: { color: null }, fields: { border: null, background: '#fff', color: '#000' } },
      '#123456',
    );
    expect(painted.focus).toBe('var(--epdf-form-focus, var(--epdf-accent, #123456))');
    expect(painted.border).toContain('color-mix(in srgb');
    expect(painted.background).toBe('var(--epdf-form-field-background, #fff)');
    expect(painted.text).toBe('var(--epdf-form-field-color, #000)');
  });
});

describe('field looks', () => {
  it('maps the 14 standard fonts to CSS', () => {
    expect(cssFontOf(null)).toEqual({
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: 400,
      fontStyle: 'normal',
    });
    expect(cssFontOf('courier-oblique')).toEqual({
      fontFamily: '"Courier New", Courier, monospace',
      fontWeight: 400,
      fontStyle: 'italic',
    });
    expect(cssFontOf('times-bold').fontWeight).toBe(700);
  });

  it('sizes a text field’s font with the page, and fits an unsized one to its box', () => {
    const frame = { left: 0, top: 0, width: 200, height: 20 };
    const field = { box: { width: 100 }, look, multiline: false, comb: false, maxLength: null };
    expect(textFieldStyleOf(field, frame, colors)).toEqual({
      fontFamily: '"Times New Roman", Times, serif',
      fontWeight: 700,
      fontStyle: 'normal',
      fontSize: '20px',
      textAlign: 'right',
      color: 'T',
      background: 'BG',
    });
    const fitted = { ...field, look: { ...look, fontSize: 0 } };
    expect(textFieldStyleOf(fitted, frame, colors).fontSize).toBe(`${20 * 0.72}px`);
    expect(textFieldStyleOf({ ...fitted, multiline: true }, frame, colors).fontSize).toBe('24px');
  });

  it('spaces a comb field’s cells', () => {
    const frame = { left: 0, top: 0, width: 100, height: 20 };
    const comb = { box: { width: 100 }, look, multiline: false, comb: true, maxLength: 5 };
    expect(textFieldStyleOf(comb, frame, colors).letterSpacing).toBe('10px');
  });

  it('draws a list box’s border at least a pixel wide, in the field’s own style', () => {
    const style = listBoxStyleOf(
      { box: { width: 100 }, look: { ...look, borderWidth: 0.25, fontSize: null } },
      { left: 0, top: 0, width: 200, height: 50 },
      colors,
    );
    expect(style).toMatchObject({
      borderWidth: '1px',
      borderStyle: 'dashed',
      borderColor: 'B',
      fontSize: '24px',
    });
  });
});

describe('bindWidgetEvents', () => {
  it('names each pointer and focus event as the actions plugin does, until detached', () => {
    const box = fakeElement();
    const notify = vi.fn();
    const detach = bindWidgetEvents(asElement(box), notify);
    for (const type of [
      'pointerenter',
      'pointerleave',
      'pointerdown',
      'pointerup',
      'focusin',
      'focusout',
    ]) {
      box.dispatch(type);
    }
    expect(notify.mock.calls.map(([kind]) => kind)).toEqual([
      'cursorEnter',
      'cursorExit',
      'mouseDown',
      'mouseUp',
      'focus',
      'blur',
    ]);
    detach();
    expect(box.listenerCount('focusout')).toBe(0);
  });
});

describe('pressToggle', () => {
  const toggle = {
    fieldRef: 'agree',
    kind: 'checkbox' as const,
    checked: false,
    exportValue: 'Yes',
    disabled: false,
  };

  it('writes the value first, then runs the widget’s action', async () => {
    const order: string[] = [];
    const form = { setValue: vi.fn(async () => void order.push('write')) };
    await new Promise<void>((resolve) =>
      pressToggle(form, toggle, () => {
        order.push('activate');
        resolve();
      }),
    );
    expect(form.setValue).toHaveBeenCalledWith('agree', { value: 'Yes' });
    expect(order).toEqual(['write', 'activate']);
  });

  it('clears a checked checkbox, keeps a radio button on, and only runs a read-only one’s action', async () => {
    const form = { setValue: vi.fn(async () => undefined) };
    const activated = vi.fn();
    pressToggle(form, { ...toggle, checked: true }, activated);
    pressToggle(form, { ...toggle, kind: 'radio', checked: true }, activated);
    pressToggle(form, { ...toggle, disabled: true }, activated);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(form.setValue.mock.calls).toEqual([
      ['agree', { value: null }],
      ['agree', { value: 'Yes' }],
    ]);
    expect(activated).toHaveBeenCalledTimes(3);
  });
});

describe('createTextFieldEditor', () => {
  function harness(commit: () => Promise<unknown> = async () => null) {
    const form = { draftText: vi.fn(), commitDraftText: vi.fn(commit), discardDraftText: vi.fn() };
    const editor = createTextFieldEditor(form, 'name', 'Ada');
    return { form, editor };
  }

  it('drafts each keystroke and commits a change on blur', () => {
    const { form, editor } = harness();
    editor.focus();
    editor.input('Ada L');
    expect(form.draftText).toHaveBeenCalledWith('name', 'Ada L');
    expect(editor.getState()).toEqual({ focused: true, draft: 'Ada L' });
    editor.blur();
    expect(form.commitDraftText).toHaveBeenCalledWith('name');
    // At rest it shows the field's value until the commit brings the new one.
    expect(editor.getState()).toEqual({ focused: false, draft: 'Ada' });
    editor.setValue('Ada L');
    expect(editor.getState().draft).toBe('Ada L');
  });

  it('discards an unchanged edit, and one cancelled with Escape', () => {
    const { form, editor } = harness();
    editor.focus();
    editor.blur();
    expect(form.discardDraftText).toHaveBeenCalledTimes(1);
    editor.focus();
    editor.input('typo');
    expect(editor.keyDown('Escape', false)).toBe(true);
    editor.blur();
    expect(form.discardDraftText).toHaveBeenCalledTimes(2);
    expect(form.commitDraftText).not.toHaveBeenCalled();
    expect(editor.getState().draft).toBe('Ada');
  });

  it('blurs on Enter in a one-line field only', () => {
    const { editor } = harness();
    expect(editor.keyDown('Enter', false)).toBe(true);
    expect(editor.keyDown('Enter', true)).toBe(false);
    expect(editor.keyDown('a', false)).toBe(false);
  });

  it('never takes the field’s value mid-edit, and notifies only on a change', () => {
    const { editor } = harness();
    const listener = vi.fn();
    editor.subscribe(listener);
    editor.focus();
    editor.setValue('Grace');
    expect(editor.getState().draft).toBe('Ada');
    const state = editor.getState();
    editor.focus();
    expect(editor.getState()).toBe(state);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('puts the value back when the form refuses the commit', async () => {
    const { editor } = harness(async () => {
      throw new Error('refused');
    });
    editor.focus();
    editor.input('Bad');
    editor.blur();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.getState().draft).toBe('Ada');
  });
});

describe('createOptimisticSelection', () => {
  it('shows a choice at once, and rolls back when its write fails', async () => {
    const selection = createOptimisticSelection(['December']);
    let fail!: () => void;
    selection.choose(
      ['October'],
      () => new Promise((_resolve, reject) => (fail = () => reject(new Error('no')))),
    );
    expect(selection.get()).toEqual(['October']);
    fail();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(selection.get()).toEqual(['December']);
  });

  it('keeps the choice while the engine still has the old one, and adopts a new one', () => {
    const selection = createOptimisticSelection(['December']);
    const listener = vi.fn();
    selection.subscribe(listener);
    selection.choose(['November'], () => undefined);
    selection.setConfirmed(['December']);
    expect(selection.get()).toEqual(['November']);
    selection.setConfirmed(['November']);
    expect(selection.get()).toEqual(['November']);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('rolls back a write that throws', () => {
    const selection = createOptimisticSelection(['a']);
    selection.choose(['b'], () => {
      throw new Error('no');
    });
    expect(selection.get()).toEqual(['a']);
  });
});

describe('showSelectedOptions', () => {
  it('selects exactly the options whose value is shown', () => {
    const options = ['a', 'b', 'c'].map((value) => ({ value, selected: value === 'a' }));
    showSelectedOptions({ options }, ['b', 'c']);
    expect(options.map((option) => option.selected)).toEqual([false, true, true]);
    showSelectedOptions({ options }, []);
    expect(options.every((option) => !option.selected)).toBe(true);
  });
});
