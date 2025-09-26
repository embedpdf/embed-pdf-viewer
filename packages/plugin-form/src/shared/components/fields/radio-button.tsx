import { PdfWidgetAnnoOption, PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FormEvent, useCallback, useMemo } from '@framework';

import { FieldProps } from '../types';
import { buttonStyle } from './style';

/**
 *
 * @param props - properties of RadioButton field
 * @returns RadioButtonField component
 */
export function RadioButtonField(props: FieldProps) {
  const { field, isEditable, values, onChangeValues } = props;

  const { flag, options } = field;
  const name = field.alternateName || field.name;
  const defaultValue = useMemo(() => {
    const option = options.find((option: PdfWidgetAnnoOption) => {
      return option.isSelected;
    });
    return option?.label || field.value;
  }, [options]);

  const isChecked = useMemo(() => {
    if (values && values[0] && values[0].kind === 'checked') {
      return values[0].isChecked;
    }

    return field.isChecked;
  }, [field.isChecked, values[0]]);

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const isChecked = (evt.target as HTMLInputElement).checked;
      onChangeValues?.([{ kind: 'checked', isChecked }]);
    },
    [onChangeValues],
  );

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.READONLY);

  return (
    <input
      type="radio"
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      value={defaultValue}
      checked={isChecked}
      onChange={handleChange}
      style={buttonStyle}
    />
  );
}
