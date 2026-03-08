import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FormEvent, useCallback } from '@framework';

import { CheckboxFieldProps } from '../types';
import { checkboxStyle } from './style';

export function CheckboxField(props: CheckboxFieldProps) {
  const { annotation, isEditable, onChangeField } = props;
  const field = annotation.field;

  const { flag } = field;
  const name = field.alternateName || field.name;

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const isChecked = (evt.target as HTMLInputElement).checked;
      onChangeField?.({ ...field, isChecked });
    },
    [onChangeField, field],
  );

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.REQUIRED);

  return (
    <input
      type="checkbox"
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      value={field.value}
      checked={field.isChecked}
      onChange={handleChange}
      style={checkboxStyle}
    />
  );
}
