import { PdfWidgetAnnoOption, PDF_FORM_FIELD_FLAG, FormFieldValue } from '@embedpdf/models';
import { FormEvent, useCallback, useMemo, selectProps, optionProps } from '@framework';

import { ComboboxFieldProps } from '../types';
import { selectStyle } from './style';

export function ComboboxField(props: ComboboxFieldProps) {
  const { field, isEditable, values, onChangeValues, onBlur, inputRef } = props;

  const { flag, options } = field;
  const name = field.alternateName || field.name;
  const defaultValues = useMemo(() => {
    return options.flatMap<FormFieldValue>((option, index) =>
      option.isSelected ? [{ kind: 'selection', index, isSelected: true }] : [],
    );
  }, [options]);

  const selectedValues = values && values.length > 0 ? values : defaultValues;

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.REQUIRED);
  const isMultipleChoice = !!(flag & PDF_FORM_FIELD_FLAG.CHOICE_MULTL_SELECT);

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const select = evt.target as HTMLSelectElement;
      if (isMultipleChoice) {
        const selected: FormFieldValue[] = [];
        for (let i = 0; i < select.options.length; i++) {
          if (select.options[i].selected) {
            selected.push({ kind: 'selection', index: i, isSelected: true });
          }
        }
        onChangeValues?.(selected);
      } else {
        onChangeValues?.([{ kind: 'selection', index: select.selectedIndex, isSelected: true }]);
      }
    },
    [onChangeValues, isMultipleChoice],
  );

  const selectedTexts = selectedValues.map((value) => {
    if (value.kind === 'selection') return options[value.index]?.label ?? '';
    if (value.kind === 'text') return value.text;
    return '';
  });

  return (
    <select
      ref={inputRef as (el: HTMLSelectElement | null) => void}
      required={isRequired}
      disabled={isDisabled}
      multiple={isMultipleChoice}
      name={name}
      aria-label={name}
      {...selectProps(isMultipleChoice, selectedTexts)}
      onChange={handleChange}
      onBlur={onBlur}
      style={selectStyle}
    >
      {options.map((option: PdfWidgetAnnoOption, index) => {
        return (
          <option
            key={index}
            value={option.label}
            {...optionProps(isMultipleChoice, selectedTexts, option.label)}
          >
            {option.label}
          </option>
        );
      })}
    </select>
  );
}
