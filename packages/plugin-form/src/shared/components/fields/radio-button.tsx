import { PdfWidgetAnnoOption, PDF_FORM_FIELD_FLAG, isWidgetChecked } from '@embedpdf/models';
import { FormEvent, useCallback, useMemo } from '@framework';

import { RadioButtonFieldProps } from '../types';
import { buttonStyle } from './style';

export function RadioButtonField(props: RadioButtonFieldProps) {
  const { annotation, isEditable, onChangeField } = props;
  const field = annotation.field;

  const { flag, options } = field;
  const name = field.alternateName || field.name;
  const checked = isWidgetChecked(annotation);

  const defaultValue = useMemo(() => {
    const option = options.find((option: PdfWidgetAnnoOption) => option.isSelected);
    return option?.label || field.value;
  }, [options, field.value]);

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const wantChecked = (evt.target as HTMLInputElement).checked;
      if (wantChecked && annotation.exportValue) {
        onChangeField?.({ ...field, value: annotation.exportValue });
      }
    },
    [onChangeField, field, annotation.exportValue],
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
      checked={checked}
      onChange={handleChange}
      style={buttonStyle}
    />
  );
}
