import { PDF_FORM_FIELD_FLAG, standardFontCssProperties } from '@embedpdf/models';
import { CSSProperties, useCallback, useMemo } from '@framework';

import { ListboxFieldProps } from '../types';

export function ListboxField(props: ListboxFieldProps) {
  const { annotation, isEditable, onChangeField, onBlur, inputRef, scale } = props;
  const field = annotation.field;

  const { flag, options } = field;
  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isMultipleChoice = !!(flag & PDF_FORM_FIELD_FLAG.CHOICE_MULTL_SELECT);

  const bw = (annotation.strokeWidth ?? 0) * scale;
  const fontSize = (annotation.fontSize ?? 12) * scale;
  const lineHeight = fontSize * 1.2;
  const fontCss = standardFontCssProperties(annotation.fontFamily);

  const containerStyle: CSSProperties = useMemo(
    () => ({
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: annotation.color ?? '#FFFFFF',
      borderStyle: 'solid',
      borderColor: annotation.strokeColor ?? '#000000',
      borderWidth: bw,
      boxSizing: 'border-box',
      overflow: 'auto',
      display: 'flex',
      flexDirection: 'column',
      outline: 'none',
    }),
    [annotation.color, annotation.strokeColor, bw],
  );

  const handleOptionClick = useCallback(
    (clickedIndex: number) => {
      if (isDisabled) return;
      const updatedOptions = options.map((opt, i) => ({
        ...opt,
        isSelected: isMultipleChoice
          ? i === clickedIndex
            ? !opt.isSelected
            : opt.isSelected
          : i === clickedIndex,
      }));
      onChangeField?.({ ...field, options: updatedOptions });
    },
    [isDisabled, isMultipleChoice, options, field, onChangeField],
  );

  return (
    <div
      ref={inputRef as (el: HTMLDivElement | null) => void}
      onBlur={onBlur}
      style={containerStyle}
    >
      {options.map((opt, i) => (
        <div
          key={i}
          onClick={() => handleOptionClick(i)}
          style={{
            padding: `0 ${4 * scale}px`,
            fontSize,
            lineHeight: `${lineHeight}px`,
            ...fontCss,
            color: opt.isSelected ? '#FFFFFF' : (annotation.fontColor ?? '#000000'),
            background: opt.isSelected ? 'rgba(0, 51, 113, 1)' : 'transparent',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: isDisabled ? 'default' : 'pointer',
          }}
        >
          {opt.label}
        </div>
      ))}
    </div>
  );
}
