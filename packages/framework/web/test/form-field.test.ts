import { describe, expect, it, vi } from 'vitest';

import {
  autocompleteOf,
  bindWidgetEvents,
  createOptimisticSelection,
  createTextFieldEditor,
  fieldPlaceholderStyleOf,
  fieldTintOf,
  formColorsOf,
  listBoxStyleOf,
  pressToggle,
  recordAccentStyleOf,
  recordOutlineStyleOf,
  recordPlaceholderStyleOf,
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

describe('a group’s color on a field', () => {
  it('is a fill of the color as strong as the accent says, with the variable over it', () => {
    expect(fieldTintOf({ color: '#2563eb', strength: 0.2 }).fill).toBe(
      'color-mix(in srgb, #2563eb calc(var(--epdf-form-field-tint, 0.2) * 100%), transparent)',
    );
    expect(fieldTintOf({ color: 'var(--signer-1)', strength: 0.16 }).fill).toBe(
      'color-mix(in srgb, var(--signer-1) calc(var(--epdf-form-field-tint, 0.16) * 100%), transparent)',
    );
  });

  it('is an edge of the color itself, whatever the strength', () => {
    expect(fieldTintOf({ color: '#2563eb', strength: 0.2 }).edge).toBe('#2563eb');
    expect(fieldTintOf({ color: 'var(--signer-1)', strength: 1 }).edge).toBe('var(--signer-1)');
  });

  it('lets `--epdf-form-field-tint-color` win over the color of a field in no group', () => {
    const tint = fieldTintOf({ color: '#0ea5e9', strength: 0.16, base: true });
    expect(tint.edge).toBe('var(--epdf-form-field-tint-color, #0ea5e9)');
    expect(tint.fill).toBe(
      'color-mix(in srgb, var(--epdf-form-field-tint-color, #0ea5e9) calc(var(--epdf-form-field-tint, 0.16) * 100%), transparent)',
    );
    // A group's color is the app's, and no variable stands in for it.
    expect(fieldTintOf({ color: '#2563eb', strength: 0.16 }).edge).toBe('#2563eb');
  });

  it('lets `--epdf-form-field-anyone-tint-color` win over the color of a field anyone fills in', () => {
    const tint = fieldTintOf({ color: '#0891b2', strength: 0.16, anyone: true });
    expect(tint.edge).toBe('var(--epdf-form-field-anyone-tint-color, #0891b2)');
    expect(tint.fill).toBe(
      'color-mix(in srgb, var(--epdf-form-field-anyone-tint-color, #0891b2) calc(var(--epdf-form-field-tint, 0.16) * 100%), transparent)',
    );
  });

  it('outlines a lent record with no look and no tint in the form’s edge color', () => {
    expect(recordOutlineStyleOf({ color: null }, '#3858e9')).toEqual({
      position: 'absolute',
      inset: '0',
      boxSizing: 'border-box',
      boxShadow:
        'inset 0 0 0 1px var(--epdf-form-field-border, color-mix(in srgb, var(--epdf-accent, #3858e9) 55%, transparent))',
      pointerEvents: 'none',
    });
    expect(recordOutlineStyleOf({ color: '#64748b' }, '#3858e9').boxShadow).toBe(
      'inset 0 0 0 1px var(--epdf-form-field-border, #64748b)',
    );
  });

  it('fills a lent record’s frame, above its drawing, with the variable over its strength', () => {
    expect(recordAccentStyleOf({ color: '#2563eb', strength: 0.4 })).toEqual({
      position: 'absolute',
      inset: '0',
      boxSizing: 'border-box',
      background:
        'color-mix(in srgb, #2563eb calc(var(--epdf-form-field-tint, 0.4) * 100%), transparent)',
      boxShadow: 'inset 0 0 0 1px #2563eb',
      pointerEvents: 'none',
    });
  });
});

describe('what an empty field shows for its purpose', () => {
  const frame = { left: 10, top: 20, width: 320, height: 40 };
  // A box 160 points wide drawn 320 pixels wide: two pixels per point.
  const field = { box: { width: 160 }, look };

  it('fills the box as the layer’s own paint: no pointer, no selection, its own text rules', () => {
    const style = fieldPlaceholderStyleOf(field, frame, '#64748b');
    expect(style).toMatchObject({
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      userSelect: 'none',
      overflow: 'hidden',
      whiteSpace: 'nowrap',
      // The page's own text rules don't reach it.
      fontStyle: 'normal',
      fontWeight: '400',
      letterSpacing: 'normal',
      textTransform: 'none',
    });
  });

  it('is written in the placeholder color: the variable first, then the setting, then the built-in one', () => {
    expect(fieldPlaceholderStyleOf(field, frame, '#64748b').color).toBe(
      'var(--epdf-form-field-placeholder, #64748b)',
    );
    expect(fieldPlaceholderStyleOf(field, frame, 'var(--muted)').color).toBe(
      'var(--epdf-form-field-placeholder, var(--muted))',
    );
    expect(fieldPlaceholderStyleOf(field, frame).color).toBe(
      'var(--epdf-form-field-placeholder, rgb(31 42 68 / 0.55))',
    );
  });

  it('takes the field’s own text size and alignment, scaled with the page', () => {
    // 10 pt at two pixels per point, aligned as the field's text is.
    expect(fieldPlaceholderStyleOf(field, frame)).toMatchObject({
      fontSize: '20px',
      justifyContent: 'flex-end',
      alignItems: 'center',
      padding: '0 4px',
    });
    expect(
      fieldPlaceholderStyleOf({ ...field, look: { ...look, textAlign: 'center' } }, frame)
        .justifyContent,
    ).toBe('center');
    expect(
      fieldPlaceholderStyleOf({ ...field, look: { ...look, textAlign: 'left' } }, frame)
        .justifyContent,
    ).toBe('flex-start');
  });

  it('sits where the form plugin says the value will be, over the field’s own alignment', () => {
    // A signature or image field's box: the plugin says the middle, whatever `/Q` says.
    expect(
      fieldPlaceholderStyleOf({ ...field, placeholderAlign: 'center' }, frame).justifyContent,
    ).toBe('center');
    // A text field's box: the plugin says its own alignment.
    expect(
      fieldPlaceholderStyleOf({ ...field, placeholderAlign: 'left' }, frame).justifyContent,
    ).toBe('flex-start');
  });

  it('on a lent field sits where the placeholder says, else where the record aligns its text', () => {
    const box = { width: 160 };
    const pixels = { width: 320, height: 40 };
    const record = { fontSize: 10, textAlign: 'right' };
    expect(
      recordPlaceholderStyleOf(
        { text: 'Initials', color: 'tomato', align: 'center' },
        record,
        box,
        pixels,
      ).justifyContent,
    ).toBe('center');
    expect(
      recordPlaceholderStyleOf({ text: 'Name', color: 'tomato' }, record, box, pixels)
        .justifyContent,
    ).toBe('flex-end');
  });

  it('is 12 pt for a size that fits the box, and never taller than the box has room for', () => {
    const fitted = { ...field, look: { ...look, fontSize: 0 } };
    expect(fieldPlaceholderStyleOf(fitted, frame).fontSize).toBe('24px');
    // A box 20 pixels tall has room for 14.
    expect(fieldPlaceholderStyleOf(fitted, { ...frame, height: 20 }).fontSize).toBe('14px');
    expect(
      fieldPlaceholderStyleOf({ ...field, look: { ...look, fontSize: 30 } }, frame).fontSize,
    ).toBe('28px');
  });

  it('starts at the top of a box for several lines', () => {
    expect(fieldPlaceholderStyleOf({ ...field, multiline: true }, frame)).toMatchObject({
      alignItems: 'flex-start',
      padding: '4px',
    });
  });

  it('on a lent field takes the record’s own text and the placeholder’s own color', () => {
    const placeholder = { text: 'Name', color: 'tomato' };
    // The same field, lent: its frame in page points, and that frame in pixels.
    const box = { width: 160 };
    const pixels = { width: 320, height: 40 };
    expect(
      recordPlaceholderStyleOf(placeholder, { fontSize: 10, textAlign: 'right' }, box, pixels),
    ).toEqual(fieldPlaceholderStyleOf(field, frame, 'tomato'));
    // A record that says nothing about its text is drawn as 12 pt from the left.
    expect(recordPlaceholderStyleOf(placeholder, null, box, pixels)).toMatchObject({
      fontSize: '24px',
      justifyContent: 'flex-start',
      color: 'var(--epdf-form-field-placeholder, tomato)',
    });
    expect(
      recordPlaceholderStyleOf(placeholder, { textAlign: 'justify' }, box, pixels).justifyContent,
    ).toBe('flex-start');
    // The size follows the pixels the frame has, whatever the zoom is called.
    expect(
      recordPlaceholderStyleOf(placeholder, { fontSize: 10 }, box, { width: 80, height: 10 })
        .fontSize,
    ).toBe('5px');
  });
});

describe('autocomplete from a field’s purpose', () => {
  it('is the purpose where the purpose is one of the web’s names for a value', () => {
    for (const purpose of ['name', 'email', 'organization', 'organization-title']) {
      expect(autocompleteOf(purpose)).toBe(purpose);
    }
  });

  it('is left out for every other purpose, and for none', () => {
    for (const purpose of ['signature', 'initials', 'date-signed', 'ticket-number', 'Name', '']) {
      expect(autocompleteOf(purpose)).toBeUndefined();
    }
    expect(autocompleteOf(null)).toBeUndefined();
    expect(autocompleteOf(undefined)).toBeUndefined();
  });
});

describe('field looks', () => {
  it('sizes a text field’s font with the page, and fits an unsized one to its box', () => {
    const frame = { left: 0, top: 0, width: 200, height: 20 };
    const field = { box: { width: 100 }, look, multiline: false, comb: false, maxLength: null };
    // The font is the editor layout's: nothing is read off the font's name.
    expect(textFieldStyleOf(field, frame, colors)).toEqual({
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
    // Laid out twice as big: the size and the spacing double with it.
    expect(textFieldStyleOf(comb, frame, colors, 2)).toMatchObject({
      fontSize: '20px',
      letterSpacing: '20px',
    });
  });

  it('draws a list box’s border at least a pixel wide, in the field’s own style and font', () => {
    const font = {
      fontFamily: '"epdf-times", serif',
      fontWeight: 700,
      fontStyle: 'normal' as const,
    };
    const style = listBoxStyleOf(
      { box: { width: 100 }, look: { ...look, borderWidth: 0.25, fontSize: null } },
      { left: 0, top: 0, width: 200, height: 50 },
      colors,
      { ...font, programs: [] } as typeof font,
    );
    expect(style).toEqual({
      ...font,
      fontSize: '24px',
      textAlign: 'right',
      color: 'T',
      background: 'BG',
      borderWidth: '1px',
      borderStyle: 'dashed',
      borderColor: 'B',
    });
  });

  it('a list box shows its group’s color over its own background, and as its border', () => {
    const style = listBoxStyleOf(
      {
        box: { width: 100 },
        look: { ...look, background: '#fafafa' },
        accent: { color: '#2563eb', strength: 0.2 },
      },
      { left: 0, top: 0, width: 200, height: 50 },
      colors,
    );
    const tint = fieldTintOf({ color: '#2563eb', strength: 0.2 });
    expect(style.background).toBe(`linear-gradient(${tint.fill}, ${tint.fill}), #fafafa`);
    expect(style.borderColor).toBe(tint.edge);
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
  function harness(
    commit: () => Promise<{ readonly status: string } | null> = async () => ({ status: 'applied' }),
  ) {
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
    // The typed text stays: a blur never shows the old value for a moment.
    expect(editor.getState()).toEqual({ focused: false, draft: 'Ada L' });
    editor.setValue('Ada L');
    expect(editor.getState().draft).toBe('Ada L');
  });

  it('keeps the typed text until the field shows it, then follows the field', async () => {
    let answer!: (result: { status: string }) => void;
    const { editor } = harness(() => new Promise((resolve) => (answer = resolve)));
    editor.focus();
    editor.input('ada');
    editor.blur();
    // A render with the field's old value, before the view shows the commit.
    editor.setValue('Ada');
    expect(editor.getState().draft).toBe('ada');
    editor.setValue('ada');
    // The form's scripts changed it: the field's value shows from now on.
    editor.setValue('ADA');
    expect(editor.getState().draft).toBe('ADA');
    answer({ status: 'applied' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.getState().draft).toBe('ADA');
  });

  it('keeps a value the form’s validation refuses typed, as Acrobat does', async () => {
    const { editor } = harness(async () => ({ status: 'rejected' }));
    editor.focus();
    editor.input('abc');
    editor.blur();
    editor.setValue('Ada');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.getState().draft).toBe('abc');
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

  it('puts the value back when the engine refuses the commit', async () => {
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
