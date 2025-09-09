import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FormEvent, useCallback, useMemo } from '@framework';

import { FieldProps } from '../types';
/**
 *
 * @param props - properties of Text field
 * @returns TextField component
 */
export function TextField(props: FieldProps) {
  const { field, isEditable, values, onChangeValues } = props;

  const { flag } = field;
  const name = field.alternateName || field.name;
  const value = useMemo(() => {
    if (values && values[0] && values[0].kind === 'text') {
      return values[0].text;
    }
    return field.value;
  }, [values, field.value]);

  const changeValue = useCallback(
    (evt: FormEvent) => {
      const value = (evt.target as HTMLInputElement).value;
      onChangeValues?.([
        {
          kind: 'text',
          text: value,
        },
      ]);
    },
    [onChangeValues],
  );

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);
  const isRequired = !!(flag & PDF_FORM_FIELD_FLAG.REQUIRED);
  const isPassword = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_PASSWORD);
  const isMultipleLine = !!(flag & PDF_FORM_FIELD_FLAG.TEXT_MULTIPLINE);

  return isMultipleLine ? (
    <textarea
      required={isRequired}
      disabled={isDisabled}
      name={name}
      aria-label={name}
      value={value}
      onChange={changeValue}
    />
  ) : (
    <input
      required={isRequired}
      disabled={isDisabled}
      type={isPassword ? 'password' : 'text'}
      name={name}
      aria-label={name}
      value={value}
      onChange={changeValue}
    />
  );
}
