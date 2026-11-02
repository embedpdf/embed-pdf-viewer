/**
 * The form page's State table as code: what `useFormState()` returns, and the
 * same fields in every other framework. One field's value has its own hook
 * (`useFormValue(ref)`), so a total in your own UI re-renders only when that
 * field changes.
 */
import { defineState, type ResourceStatus } from '@embedpdf/core';
import type { FormFieldDTO, FormKind } from '@embedpdf/engine-core/runtime';

import { FormToken } from './contract';

/** Every field, whether the form is read, what kind of form it is, the selected widget's field, and the field the cursor is in. */
export interface FormState {
  /** Every field. The same array while nothing changes. */
  readonly fields: readonly FormFieldDTO[];
  /** Whether the form is read. */
  readonly status: ResourceStatus;
  /** What the document has: `'none'`, `'acroform'` or `'xfa'`. */
  readonly formKind: FormKind;
  /** The field of the selected widget while one widget is selected (in design mode), or `null`. */
  readonly selectedField: FormFieldDTO | null;
  /** The field the cursor is in, or `null`. */
  readonly focusedField: FormFieldDTO | null;
}

const NO_FIELDS: readonly FormFieldDTO[] = Object.freeze([]);

export const formState = defineState(FormToken, {
  read: (form): FormState => ({
    fields: form.list(),
    status: form.getStatus(),
    formKind: form.getFormKind(),
    selectedField: form.getSelectedField(),
    focusedField: form.getFocusedField(),
  }),
  empty: {
    fields: NO_FIELDS,
    status: 'idle',
    formKind: 'none',
    selectedField: null,
    focusedField: null,
  },
});
