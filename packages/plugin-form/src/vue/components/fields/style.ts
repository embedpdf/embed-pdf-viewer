import type { CSSProperties } from 'vue';

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
  outline: 'none',
  boxSizing: 'border-box',
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

export const selectStyle: CSSProperties = {
  ...baseInputStyle,
  cursor: 'inherit',
};

export const textareaStyle: CSSProperties = {
  ...baseInputStyle,
  resize: 'none',
  lineHeight: 1.14,
};

export const buttonStyle: CSSProperties = baseStyle;
