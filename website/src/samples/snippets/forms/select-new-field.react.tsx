import { useFormEvent } from '@embedpdf/react/form';
import { selectField } from './editor';

export function SelectNewFields() {
  useFormEvent(
    (form) => form.onFieldCreated,
    ({ field }) => selectField(field),
  );

  return null;
}
