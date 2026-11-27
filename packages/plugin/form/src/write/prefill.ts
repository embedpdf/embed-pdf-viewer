/**
 * The values the app already has: `prefill()` writes them into the session's own empty fields,
 * by each field's purpose (`services/purposes.ts`). It is what a signer's page calls when the
 * person starts, so the values are real ones from then on: they show, they count as filled in,
 * and the person changes them unless the field is read-only. One change, so one step to undo.
 * A text field and a dropdown take such a value; another kind of field has none to prefill. A
 * field anyone fills in is left (`'for-anyone'`): a name, an address or a day of signing is one
 * signer's, and the first to open the document would put theirs there for everyone.
 */
import { PluginError, type OperationOptions } from '@embedpdf/core';
import type { FormFieldRef, FormFieldValue } from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormPrefillResult, FormPrefillSkipReason } from '../contract';
import { isEmpty } from '../read/fields';
import type { FormContext, FormServices } from '../services';

/** The plain-values write of `write/values.ts`: one change for every entry it accepts. */
type FillPlain = (
  entries: readonly { readonly ref: FormFieldRef; readonly value: FormFieldValue }[],
  options?: OperationOptions,
  operation?: string,
) => Promise<Pick<FormPrefillResult, 'applied' | 'failed'>>;

export function createPrefill(
  _ctx: FormContext,
  { fields, rights, purposes }: Pick<FormServices, 'fields' | 'rights' | 'purposes'>,
  fillPlain: FillPlain,
) {
  const prefill: FormCapability['prefill'] = async (options) => {
    if (options?.signal?.aborted) {
      throw new PluginError('operation-cancelled', 'form', 'operation cancelled', {
        cause: options.signal.reason,
      });
    }
    if (!fields.view().snapshot) await fields.settled();
    const entries: { ref: FormFieldRef; value: FormFieldValue }[] = [];
    const skipped: { ref: FormFieldRef; reason: FormPrefillSkipReason }[] = [];
    for (const field of fields.view().snapshot?.fields ?? []) {
      if (field.kind !== 'text' && field.kind !== 'combobox') continue;
      // Another person's field is theirs to fill in.
      if (!rights.mayFill(field)) continue;
      const value = purposes.valueFor(field);
      if (value === undefined) continue;
      if (field.assignment.kind === 'anyone')
        skipped.push({ ref: field.ref, reason: 'for-anyone' });
      else if (!isEmpty(field)) skipped.push({ ref: field.ref, reason: 'filled' });
      else if (value === null || value === '') skipped.push({ ref: field.ref, reason: 'no-value' });
      else entries.push({ ref: field.ref, value: { value } });
    }
    if (entries.length === 0) return { applied: [], skipped, failed: [] };
    const { applied, failed } = await fillPlain(entries, options, 'form.prefill');
    return { applied, skipped, failed } satisfies FormPrefillResult;
  };

  return { api: { prefill } satisfies Partial<FormCapability> };
}
