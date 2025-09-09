import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FormEvent, useCallback, useMemo } from '@framework';

import { FieldProps } from '../types';

/**
 *
 * @param props - properties of Checkbox field
 * @returns CheckboxField component
 */
export function CheckboxField(props: FieldProps) {
  const { field, isEditable, values, onChangeValues } = props;

  const { flag } = field;
  const name = field.alternateName || field.name;

  const handleChange = useCallback(
    (evt: FormEvent) => {
      const isChecked = (evt.target as HTMLInputElement).checked;
      onChangeValues?.([{ kind: 'checked', isChecked }]);
    },
    [onChangeValues],
  );

  const isChecked = useMemo(() => {
    if (values && values[0] && values[0].kind === 'checked') {
      return values[0].isChecked;
    }

    return field.isChecked;
  }, [field.isChecked, values[0]]);

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.READONLY);

  return (
    <input
      type="checkbox"
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      value={field.value}
      checked={isChecked}
      onChange={handleChange}
    />
  );
}
