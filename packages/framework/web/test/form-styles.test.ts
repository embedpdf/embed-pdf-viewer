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
      ...FORM_CONTROL_FILL,
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
