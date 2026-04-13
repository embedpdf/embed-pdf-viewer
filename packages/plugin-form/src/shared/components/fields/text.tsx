import { PDF_FORM_FIELD_FLAG, standardFontCssProperties } from '@embedpdf/models';
import { CSSProperties, FormEvent, useCallback, useEffect, useMemo, useState } from '@framework';
import { useIOSZoomPrevention } from '@embedpdf/plugin-annotation/@framework';

import { TextFieldProps } from '../types';
import { inputStyle, textareaStyle } from './style';

const combContainerStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  height: '100%',
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
  containerStyle: CSSProperties;
  cellFontStyle: CSSProperties;
  onFocus?: () => void;
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
    containerStyle,
    cellFontStyle,
    onFocus,
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
    <div style={containerStyle}>
      <input
        ref={inputRef}
        required={required}
        disabled={disabled}
        type={password ? 'password' : 'text'}
        name={name}
        aria-label={name}
        value={value}
        maxLength={maxLen}
        onFocus={onFocus}
        onChange={onChange}
        onBlur={onBlur}
        style={combHiddenInputStyle}
      />
      {Array.from({ length: maxLen }).map((_, i) => (
        <span
          key={i}
          style={{
            ...combCellStyle,
            ...cellFontStyle,
            left: i * cellWidth,
            width: cellWidth,
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
  const {
    annotation,
    isEditable,
    onChangeField,
    onFocus,
    onBlur,
    inputRef,
    scale,
    syncExternalValue = true,
  } = props;
  const field = annotation.field;

  const { flag } = field;
  const name = field.name;
  const value = field.value;

  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    if (!syncExternalValue) return;
    setLocalValue(value);
  }, [value, syncExternalValue]);

  const changeValue = useCallback(
    (evt: FormEvent) => {
      const newValue = (evt.target as HTMLInputElement).value;
      setLocalValue(newValue);
      onChangeField?.({ ...field, value: newValue });
    },
    [onChangeField, field],
  );

  const bw = (annotation.strokeWidth ?? 0) * scale;
  const fontCss = standardFontCssProperties(annotation.fontFamily);
  const { adjustedFontPx, wrapperStyle } = useIOSZoomPrevention(annotation.fontSize * scale, true);

  const visualStyle: CSSProperties = useMemo(
    () => ({
      backgroundColor: annotation.color ?? 'transparent',
      borderStyle: 'solid',
      borderColor: annotation.strokeColor ?? 'transparent',
      borderWidth: bw,
      color: annotation.fontColor,
      ...fontCss,
      fontSize: adjustedFontPx,
      padding: `${bw}px ${bw}px`,
    }),
    [annotation.color, annotation.strokeColor, annotation.fontColor, adjustedFontPx, bw, fontCss],
  );

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.REQUIRED);
  const isPassword = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_PASSWORD);
  const isMultipleLine = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE);
  const isComb = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_COMB);
  const maxLen = field.maxLen;

  if (isComb && maxLen) {
    const cellWidth = (annotation.rect.size.width * scale) / maxLen;
    const chars = (localValue || '').split('');
    const caretIndex = chars.length;

    const combContainer: CSSProperties = {
      ...combContainerStyle,
      backgroundColor: annotation.color ?? 'transparent',
      borderStyle: 'solid',
      borderColor: annotation.strokeColor ?? 'transparent',
      borderWidth: bw,
    };

    const cellFont: CSSProperties = {
      color: annotation.fontColor,
      ...fontCss,
      fontSize: adjustedFontPx,
    };

    const combContent = (
      <CombField
        inputRef={inputRef as (el: HTMLInputElement | null) => void}
        required={isRequired}
        disabled={isDisabled}
        password={isPassword}
        name={name}
        value={localValue}
        maxLen={maxLen}
        cellWidth={cellWidth}
        chars={chars}
        caretIndex={caretIndex}
        containerStyle={combContainer}
        cellFontStyle={cellFont}
        onFocus={onFocus}
        onChange={changeValue}
        onBlur={onBlur}
      />
    );

    return wrapperStyle ? <div style={wrapperStyle}>{combContent}</div> : combContent;
  }

  const inputContent = isMultipleLine ? (
    <textarea
      ref={inputRef as (el: HTMLTextAreaElement | null) => void}
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      value={localValue}
      maxLength={maxLen}
      onFocus={onFocus}
      onChange={changeValue}
      onBlur={onBlur}
      style={{ ...textareaStyle, ...visualStyle }}
    />
  ) : (
    <input
      ref={inputRef as (el: HTMLInputElement | null) => void}
      required={isRequired}
      disabled={isDisabled}
      type={isPassword ? 'password' : 'text'}
      name={name}
      aria-label={name}
      value={localValue}
      maxLength={maxLen}
      onFocus={onFocus}
      onChange={changeValue}
      onBlur={onBlur}
      style={{ ...inputStyle, ...visualStyle }}
    />
  );

  return wrapperStyle ? <div style={wrapperStyle}>{inputContent}</div> : inputContent;
}
