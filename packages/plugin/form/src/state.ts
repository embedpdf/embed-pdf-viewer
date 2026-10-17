/**
 * The form page's State table as code: what `useFormState()` returns, and the
 * same fields in every other framework. One field's value has its own hook
 * (`useFormValue(ref)`), so a total in your own UI re-renders only when that
 * field changes.
 */
import { defineState } from '@embedpdf/core';
import type { FormFieldDTO } from '@embedpdf/engine-core/runtime';

import { FormToken } from './contract';

const NO_FIELDS: readonly FormFieldDTO[] = Object.freeze([]);

export const formState = defineState(FormToken, {
  read: (form) => ({
    fields: form.list(),
    status: form.getStatus(),
    formKind: form.getFormKind(),
    selectedField: form.getSelectedField(),
  }),
  empty: {
    fields: NO_FIELDS,
    status: 'idle',
    formKind: 'none',
    selectedField: null,
  },
});
