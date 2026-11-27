import { useState } from 'react';
import { Anchored } from '@embedpdf/react/anchored';
import {
  formatDate,
  useForm,
  useFormEvent,
  useFormWidgetAnchor,
  type DatePartsInput,
  type FormFocusChangedEvent,
} from '@embedpdf/react/form';
import { Calendar } from './calendar'; // your own

export function DatePicker() {
  const form = useForm();
  const [focus, setFocus] = useState<FormFocusChangedEvent | null>(null);
  useFormEvent((form) => form.onFocusChanged, setFocus);
  const anchor = useFormWidgetAnchor(focus?.widget ?? null);

  const field = focus?.field;
  const format = field && 'format' in field ? field.format : null;
  if (!field || format?.kind !== 'date') return null;

  const pick = (day: DatePartsInput) => {
    // A text box writes what was typed when the cursor leaves it: the picked day goes in after.
    (document.activeElement as HTMLElement | null)?.blur();
    void form.setValue(field.ref, { value: formatDate(day, format.pattern) });
  };

  return (
    <Anchored anchor={anchor} placement="bottom-start">
      {/* A press on the calendar leaves the cursor in the field until a day is picked. */}
      <div onMouseDown={(event) => event.preventDefault()}>
        <Calendar onPick={pick} />
      </div>
    </Anchored>
  );
}
