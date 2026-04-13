import { PDF_FORM_FIELD_FLAG } from '@embedpdf/models';
import { PushButtonFieldProps } from '../types';
import { buttonStyle } from './style';

export function PushButtonField(props: PushButtonFieldProps) {
  const { annotation, isEditable } = props;
  const field = annotation.field;

  const { flag } = field;
  const name = field.alternateName || field.name;

  const isDisabled = !isEditable || !!(flag & PDF_FORM_FIELD_FLAG.READONLY);

  return (
    <button disabled={isDisabled} aria-label={name} style={buttonStyle}>
      {name}
    </button>
  );
}
