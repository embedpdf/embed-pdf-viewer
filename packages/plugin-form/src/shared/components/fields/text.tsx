import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from '@framework';

import { TextFieldProps } from '../types';
import { inputStyle, textareaStyle } from './style';

const combContainerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
  border: '1px solid #7f96ed',
  borderRadius: 0,
  boxSizing: 'border-box',
};

const combHiddenInputStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  padding: 0,
  margin: 0,
  border: 'none',
  zIndex: 1,
};

const combCellStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: '"Courier New", Courier, monospace',
  pointerEvents: 'none',
};

const combCaretStyle: CSSProperties = {
  position: 'absolute',
  top: '15%',
  height: '70%',
  width: 1,
  backgroundColor: 'black',
  pointerEvents: 'none',
};

interface CombFieldProps {
  inputRef: (el: HTMLInputElement | null) => void;
  required: boolean;
  disabled: boolean;
  password: boolean;
  name: string;
  value: string;
  maxLen: number;
  cellWidth: number;
  chars: string[];
  caretIndex: number;
  onChange: (evt: FormEvent) => void;
  onBlur?: () => void;
}

function CombField(props: CombFieldProps) {
  const {
    inputRef,
    required,
    disabled,
    password,
    name,
    value,
    maxLen,
    cellWidth,
    chars,
    caretIndex,
    onChange,
    onBlur,
  } = props;

  const [caretVisible, setCaretVisible] = useState(true);

  useEffect(() => {
    setCaretVisible(true);
    const id = setInterval(() => setCaretVisible((v) => !v), 530);
    return () => clearInterval(id);
  }, [caretIndex]);

  const showCaret = caretIndex < maxLen;

  return (
    <div style={combContainerStyle}>
      <input
        ref={inputRef}
        required={required}
        disabled={disabled}
        type={password ? 'password' : 'text'}
        name={name}
        aria-label={name}
        value={value}
        maxLength={maxLen}
        onChange={onChange}
        onBlur={onBlur}
        style={combHiddenInputStyle}
      />
      {Array.from({ length: maxLen }).map((_, i) => (
        <span
          key={i}
          style={{
            ...combCellStyle,
            left: i * cellWidth,
            width: cellWidth,
            fontSize: 'inherit',
          }}
        >
          {chars[i] || ''}
        </span>
      ))}
      {showCaret && (
        <span
          style={{
            ...combCaretStyle,
            left: caretIndex * cellWidth + cellWidth / 2,
            opacity: caretVisible ? 1 : 0,
          }}
        />
      )}
    </div>
  );
}

export function TextField(props: TextFieldProps) {
  const { field, isEditable, values, onChangeValues, onBlur, inputRef } = props;

  const { flag } = field;
  const name = field.name;
  const value = useMemo(() => {
    if (values && values[0] && values[0].kind === 'text') {
      return values[0].text;
    }
    return field.value;
  }, [values, field.value]);

  const changeValue = useCallback(
    (evt: FormEvent) => {
      const value = (evt.target as HTMLInputElement).value;
      onChangeValues?.([
        {
          kind: 'text',
          text: value,
        },
      ]);
    },
    [onChangeValues],
  );

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.REQUIRED);
  const isPassword = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_PASSWORD);
  const isMultipleLine = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE);
  const isComb = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_COMB);
  const maxLen = field.maxLen;

  if (isComb && maxLen) {
    const cellWidth = (props.annotation.rect.size.width * props.scale) / maxLen;
    const chars = (value || '').split('');
    const caretIndex = chars.length;

    return (
      <CombField
        inputRef={inputRef as (el: HTMLInputElement | null) => void}
        required={isRequired}
        disabled={isDisabled}
        password={isPassword}
        name={name}
        value={value}
        maxLen={maxLen}
        cellWidth={cellWidth}
        chars={chars}
        caretIndex={caretIndex}
        onChange={changeValue}
        onBlur={onBlur}
      />
    );
  }

  return isMultipleLine ? (
    <textarea
      ref={inputRef as (el: HTMLTextAreaElement | null) => void}
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      value={value}
      maxLength={maxLen}
      onChange={changeValue}
      onBlur={onBlur}
      style={textareaStyle}
    />
  ) : (
    <input
      ref={inputRef as (el: HTMLInputElement | null) => void}
      required={isRequired}
      disabled={isDisabled}
      type={isPassword ? 'password' : 'text'}
      name={name}
      aria-label={name}
      value={value}
      maxLength={maxLen}
      onChange={changeValue}
      onBlur={onBlur}
      style={inputStyle}
    />
  );
}
