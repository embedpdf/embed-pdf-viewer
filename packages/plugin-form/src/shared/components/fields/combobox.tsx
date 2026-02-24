import { PdfWidgetAnnoOption, PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FormEvent, useCallback, useMemo, selectProps, optionProps } from '@framework';

import { FieldProps } from '../types';
import { selectStyle } from './style';

export function ComboboxField(props: FieldProps) {
  const { field, isEditable, values, onChangeValues, onBlur, autoFocus } = props;

  const { flag, options } = field;
  const name = field.alternateName || field.name;
  const defalutValues = useMemo(() => {
    return options
      .filter((option: PdfWidgetAnnoOption) => {
        return option.isSelected;
      })
      .map((option) => {
        return {
          kind: 'text',
          text: option.label,
        };
      });
  }, [options]);

  const selectedValues = values || defalutValues;

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isMultipleChoice = !!(flag & PDF_FORM_FIELD_FLAG.CHOICE_MULTL_SELECT);

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const value = (evt.target as HTMLSelectElement).value;
      onChangeValues?.([{ kind: 'text', text: value }]);
    },
    [onChangeValues],
  );

  const selectedTexts = selectedValues.map((value) => (value.kind === 'text' ? value.text : 'On'));

  return (
    <select
      required={isRequired}
      disabled={isDisabled}
      multiple={isMultipleChoice}
      name={name}
      aria-label={name}
      {...selectProps(isMultipleChoice, selectedTexts)}
      onChange={handleChange}
      onBlur={onBlur}
      autoFocus={autoFocus}
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
