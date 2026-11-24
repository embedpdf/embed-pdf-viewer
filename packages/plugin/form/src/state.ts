/**
 * The form page's State table as code: what `useFormState()` returns, and the
 * same fields in every other framework. One field's value has its own hook
 * (`useFormValue(ref)`), so a total in your own UI re-renders only when that
 * field changes.
 */
import { defineState, type ResourceStatus } from '@embedpdf/core';
import type { FormField, FormKind } from '@embedpdf/engine-core/runtime';

import { FormToken, type FormGroup } from './contract';

/**
 * Every field, whether the form is read, what kind of form it is, the selected widget's field,
 * every selected field, the field the cursor is in, the document's groups, and the group new
 * fields are placed for.
 */
export interface FormState {
  /** Every field. The same array while nothing changes. */
  readonly fields: readonly FormField[];
  /** Whether the form is read. */
  readonly status: ResourceStatus;
  /** What the document has: `'none'`, `'acroform'` or `'xfa'`. */
  readonly formKind: FormKind;
  /** The field of the selected widget while one widget is selected (in design mode), or `null`. */
  readonly selectedField: FormField | null;
  /** The field the cursor is in, or `null`. */
  readonly focusedField: FormField | null;
  /** Every field with a selected widget (in design mode). The same array while nothing changes. */
  readonly selectedFields: readonly FormField[];
  /** Every group the app named or the form's fields are in. The same array while nothing changes. */
  readonly groups: readonly FormGroup[];
  /** The group that fields placed with a tool go in (in design mode), or `null` when it names none. */
  readonly designGroup: string | null;
}

const NO_FIELDS: readonly FormField[] = Object.freeze([]);
const NO_GROUPS: readonly FormGroup[] = Object.freeze([]);

export const formState = defineState(FormToken, {
  read: (form): FormState => ({
    fields: form.list(),
    status: form.getStatus(),
    formKind: form.getFormKind(),
    selectedField: form.getSelectedField(),
    focusedField: form.getFocusedField(),
    selectedFields: form.listSelectedFields(),
    groups: form.listGroups(),
    designGroup: form.getDesignGroup(),
  }),
  empty: {
    fields: NO_FIELDS,
    status: 'idle',
    formKind: 'none',
    selectedField: null,
    focusedField: null,
    selectedFields: NO_FIELDS,
    groups: NO_GROUPS,
    designGroup: null,
  },
});
