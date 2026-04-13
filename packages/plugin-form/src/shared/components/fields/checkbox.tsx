import { PDF_FORM_FIELD_FLAG, isWidgetChecked } from '@embedpdf/models';
import { FormEvent, useCallback } from '@framework';

import { CheckboxFieldProps } from '../types';
import { checkboxStyle } from './style';

export function CheckboxField(props: CheckboxFieldProps) {
  const { annotation, isEditable, onChangeField } = props;
  const field = annotation.field;

  const { flag } = field;
  const name = field.alternateName || field.name;
  const checked = isWidgetChecked(annotation);

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const wantChecked = (evt.target as HTMLInputElement).checked;
      const newValue = wantChecked ? (annotation.exportValue ?? 'Yes') : 'Off';
      onChangeField?.({ ...field, value: newValue });
    },
    [onChangeField, field, annotation.exportValue],
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
      checked={checked}
      onChange={handleChange}
      style={checkboxStyle}
    />
  );
}
