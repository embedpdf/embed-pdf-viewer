import { useFormEvent } from '@embedpdf/react/form';
import { autosave } from './api';

export function Autosave() {
  useFormEvent(
    (form) => form.onValueChanged,
    ({ field }) => autosave(field.name),
  );

  return null;
}
