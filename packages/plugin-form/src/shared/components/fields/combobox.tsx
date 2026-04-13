import { PdfWidgetAnnoOption, PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FormEvent, useCallback, selectProps, optionProps } from '@framework';

import { ComboboxFieldProps } from '../types';
import { selectStyle } from './style';

export function ComboboxField(props: ComboboxFieldProps) {
  const { annotation, isEditable, onChangeField, onBlur, inputRef } = props;
  const field = annotation.field;

  const { flag, options } = field;
  const name = field.alternateName || field.name;

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.REQUIRED);

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const select = evt.target as HTMLSelectElement;
      const updatedOptions = options.map((opt, i) => ({
        ...opt,
        isSelected: i === select.selectedIndex,
      }));
      onChangeField?.({ ...field, options: updatedOptions });
    },
    [onChangeField, field, options],
  );

  const selectedTexts = options.filter((opt) => opt.isSelected).map((opt) => opt.label);

  return (
    <select
      ref={inputRef as (el: HTMLSelectElement | null) => void}
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      {...selectProps(false, selectedTexts)}
      onChange={handleChange}
      onBlur={onBlur}
      style={{ ...selectStyle, opacity: 0 }}
    >
      {options.map((option: PdfWidgetAnnoOption, index) => {
        return (
          <option
            key={index}
            value={option.label}
            {...optionProps(false, selectedTexts, option.label)}
          >
            {option.label}
          </option>
        );
      })}
    </select>
  );
}
