import { PdfWidgetAnnoOption, PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FormEvent, useCallback, useMemo } from '@framework';

import { RadioButtonFieldProps } from '../types';
import { buttonStyle } from './style';

export function RadioButtonField(props: RadioButtonFieldProps) {
  const { annotation, isEditable, onChangeField } = props;
  const field = annotation.field;

  const { flag, options } = field;
  const name = field.alternateName || field.name;

  const defaultValue = useMemo(() => {
    const option = options.find((option: PdfWidgetAnnoOption) => option.isSelected);
    return option?.label || field.value;
  }, [options, field.value]);

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
      type="radio"
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      value={defaultValue}
      checked={field.isChecked}
      onChange={handleChange}
      style={buttonStyle}
    />
  );
}
