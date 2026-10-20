import { describe, expect, it } from 'vitest';

import type { FieldLook, FormColors } from '../src/form-field';
import {
  FORM_CONTROL_FILL,
  formFocusRingStyleOf,
  listBoxControlStyleOf,
  textFieldEditorStyleOf,
  widgetBoxStyleOf,
} from '../src/form-styles';

const colors: FormColors = { focus: 'F', border: 'B', background: 'BG', text: 'T' };

const look: FieldLook = {
  border: null,
  borderWidth: 1,
  borderStyle: 'solid',
  background: null,
  color: null,
  fontFamily: 'helvetica',
  fontSize: 10,
  textAlign: 'left',
};

/** A widget 100 points wide drawn 200 pixels wide: 2 pixels per point. */
const frame = { left: 10, top: 20, width: 200, height: 40 };
const box = { width: 100 };

describe('widgetBoxStyleOf', () => {
  it('places the box over the widget, and edges a field without a border of its own', () => {
    expect(widgetBoxStyleOf({ look }, frame, colors)).toEqual({
      position: 'absolute',
      left: '10px',
      top: '20px',
      width: '200px',
      height: '40px',
      pointerEvents: 'auto',
      boxShadow: 'inset 0 0 0 1px B',
    });
  });

  it('draws no edge for a field with a border, or a control that draws its own', () => {
    expect(widgetBoxStyleOf({ look: { border: '#000' } }, frame, colors)).not.toHaveProperty(
      'boxShadow',
    );
    expect(widgetBoxStyleOf({ look }, frame, colors, { edge: false })).not.toHaveProperty(
      'boxShadow',
    );
  });
});

describe('textFieldEditorStyleOf', () => {
  const field = { box, look, multiline: false, comb: false, maxLength: null, disabled: false };

  it('shows the field’s text with a focus ring while focused', () => {
    expect(textFieldEditorStyleOf(field, frame, colors, true)).toEqual({
      position: 'absolute',
      left: '0',
      top: '0',
      width: '100%',
      height: '100%',
      boxSizing: 'border-box',
      margin: '0',
      transform: 'none',
      transformOrigin: '0 0',
      border: 'none',
      outline: '2px solid F',
      outlineOffset: '-2px',
      padding: '0 2px',
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: 400,
      fontStyle: 'normal',
      fontSize: '20px',
      textAlign: 'left',
      color: 'T',
      background: 'BG',
      resize: 'none',
      cursor: 'text',
      opacity: 1,
    });
  });

  it('writes the text where the engine will draw it, with its layout', () => {
    const layout = {
      fontFamily: '"epdf-0123456789abcdef", Helvetica, Arial, sans-serif',
      fontWeight: 400,
      fontStyle: 'normal' as const,
      fontSize: 9.5,
      lineHeight: 11.1,
      padding: { top: 1, right: 2, bottom: 1, left: 2 },
      letterSpacing: 0,
      comb: false,
      rtl: false,
    };
    expect(textFieldEditorStyleOf(field, frame, colors, true, layout)).toMatchObject({
      fontFamily: layout.fontFamily,
      fontSize: '19px',
      lineHeight: '22.2px',
      padding: '2px 4px 2px 4px',
      textAlign: 'left',
      direction: 'ltr',
    });
    // A line that reads right to left in the engine reads so in the editor too, aligned as the field is.
    expect(
      textFieldEditorStyleOf(field, frame, colors, true, { ...layout, rtl: true }),
    ).toMatchObject({ direction: 'rtl', textAlign: 'left' });
    // A comb starts at its first cell and spaces its characters by the cells.
    const comb = {
      ...field,
      look: { ...look, textAlign: 'center' as const },
      comb: true,
      maxLength: 4,
    };
    expect(
      textFieldEditorStyleOf(comb, frame, colors, true, {
        ...layout,
        padding: { ...layout.padding, left: 8 },
        letterSpacing: 18,
        comb: true,
      }),
    ).toMatchObject({ letterSpacing: '36px', textAlign: 'left', padding: '2px 4px 2px 16px' });
  });

  it('lays small text out at 16 px, and draws the editor back at the box’s size', () => {
    // 4 pt at 2 px per point is 8 px on the page: laid out twice as big, drawn at half.
    const small = { ...field, look: { ...look, fontSize: 4 } };
    expect(textFieldEditorStyleOf(small, frame, colors, true)).toMatchObject({
      width: '200%',
      height: '200%',
      transform: 'scale(0.5)',
      transformOrigin: '0 0',
      fontSize: '16px',
      outline: '4px solid F',
      outlineOffset: '-4px',
      padding: '0 4px',
    });
    const layout = {
      fontFamily: 'Helvetica',
      fontWeight: 400,
      fontStyle: 'normal' as const,
      fontSize: 4,
      lineHeight: 5,
      padding: { top: 1, right: 2, bottom: 1, left: 2 },
      letterSpacing: 0,
      comb: false,
      rtl: false,
    };
    expect(textFieldEditorStyleOf(small, frame, colors, true, layout)).toMatchObject({
      width: '200%',
      fontSize: '16px',
      lineHeight: '20px',
      padding: '4px 8px 4px 8px',
    });
  });

  it('reaches 16 px for a fitted field too, whatever its smallest size', () => {
    // A one-line field fitted to an 8 px tall box writes at the 6 px floor.
    const fitted = { ...field, look: { ...look, fontSize: 0 } };
    const style = textFieldEditorStyleOf(fitted, { ...frame, height: 8 }, colors, true);
    expect(parseFloat(style.fontSize)).toBeCloseTo(16);
    expect(parseFloat(style.width)).toBeCloseTo((100 * 16) / 6);
  });

  it('is see-through at rest, and lets the pointer through when disabled', () => {
    const resting = textFieldEditorStyleOf({ ...field, disabled: true }, frame, colors, false);
    expect(resting).toMatchObject({ outline: 'none', opacity: 0, pointerEvents: 'none' });
    expect(textFieldEditorStyleOf(field, frame, colors, false)).not.toHaveProperty('pointerEvents');
  });
});

describe('listBoxControlStyleOf', () => {
  it('fills the box in the field’s look, with its own border', () => {
    expect(listBoxControlStyleOf({ box, look, disabled: false }, frame, colors)).toEqual({
      ...FORM_CONTROL_FILL,
      padding: '0',
      borderRadius: '0',
      outline: 'none',
      fontFamily: 'Helvetica, Arial, sans-serif',
      fontWeight: 400,
      fontStyle: 'normal',
      fontSize: '20px',
      textAlign: 'left',
      color: 'T',
      background: 'BG',
      borderWidth: '2px',
      borderStyle: 'solid',
      borderColor: 'B',
      cursor: 'pointer',
    });
  });

  it('lets the pointer through when disabled', () => {
    expect(listBoxControlStyleOf({ box, look, disabled: true }, frame, colors)).toMatchObject({
      cursor: 'default',
      pointerEvents: 'none',
    });
  });
});

describe('formFocusRingStyleOf', () => {
  it('rings the field above its control, in the focus color', () => {
    expect(formFocusRingStyleOf('F')).toEqual({
      position: 'absolute',
      inset: '0',
      zIndex: 1,
      boxSizing: 'border-box',
      outline: '2px solid F',
      outlineOffset: '-2px',
      pointerEvents: 'none',
    });
  });
});
