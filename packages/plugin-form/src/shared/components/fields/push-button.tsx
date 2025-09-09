import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { FieldProps } from '../types';

/**
 *
 * @param props - properties of PushButton field
 * @returns PushButtonField component
 */
export function PushButtonField(props: FieldProps) {
  const { field, isEditable } = props;

  const { flag } = field;
  const name = field.alternateName || field.name;

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);

  return (
    <button disabled={isDisabled} aria-label={name}>
      {name}
    </button>
  );
}
