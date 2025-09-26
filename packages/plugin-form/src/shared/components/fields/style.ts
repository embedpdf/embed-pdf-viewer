import { CSSProperties } from '@framework';

const baseStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  padding: 0,
  margin: 0,
  width: '100%',
  height: '100%',
};

const baseInputStyle: CSSProperties = {
  ...baseStyle,
  borderRadius: 0,
  backgroundColor: '#fffb8b',
  borderWidth: '1px solid #7f96ed',
  outline: 'none',
  fontFamily: '"Courier New", Courier, monospace',
};

export const checkboxStyle: CSSProperties = {
  ...baseStyle,
  borderRadius: 0,
  backgroundColor: 'transparent',
  borderWidth: 0,
  borderStyle: 'none',
  outline: 'none',
};

export const inputStyle: CSSProperties = baseInputStyle;

export const selectStyle: CSSProperties = baseInputStyle;

export const textareaStyle: CSSProperties = {
  ...baseInputStyle,
  resize: 'none',
};

export const buttonStyle: CSSProperties = baseStyle;
