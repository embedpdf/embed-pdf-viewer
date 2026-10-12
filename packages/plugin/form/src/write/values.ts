/**
 * Value writes, each one fill (write/fill.ts): one field through the form's scripts (when the
 * `validation` setting runs them), and the batch verbs, whose plain values go as one change
 * with one recalculation, as a script's `field.value` assignments do in Acrobat.
 */
import {
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type OperationOptions,
  type PluginErrorInfo,
} from '@embedpdf/core';
import {
  fieldValueWriteOf,
  type ChangeOp,
  type FormFieldRef,
  type FormFieldValue,
} from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormSetValueResult } from '../contract';
import { fieldByRef } from '../model';
import { writeOfPlainValue } from '../read/fields';
import type { FormContext, FormServices } from '../services';
import { failedFill, type Fills } from './fill';

/** A batch that stops when its caller cancels it. */
function throwIfCancelled(options?: OperationOptions): void {
  if (options?.signal?.aborted) {
    throw new PluginError('operation-cancelled', 'form', 'operation cancelled', {
      cause: options.signal.reason,
    });
  }
}

const setValueOp = (field: FormFieldRef, value: FormFieldValue): ChangeOp => ({
  type: 'forms.setValue',
  field,
  value,
});

export function createValueWrites(
  _ctx: FormContext,
  services: Pick<FormServices, 'events' | 'fields' | 'rights'>,
  { fill }: Fills,
) {
  const { validationRejected } = services.events;
  const { fields, rights } = services;

  /** One field's value through its scripts: shown at once, written as one change. */
  const commit = async (
    ref: FormFieldRef,
    value: FormFieldValue,
    operation: string,
    options?: OperationOptions,
  ): Promise<FormSetValueResult> => {
    const known = fieldByRef(fields.view(), ref);
    // A field the form doesn't show yet is the engine's to answer (`not-found`).
    if (known) rights.assertMayFill(known, operation);
    const { result } = await fill(
      {
        ops: [setValueOp(ref, value)],
        scripts: { kind: 'commit', field: ref, value },
        origin: 'user',
      },
      options,
    );
    if (result.status === 'failed') throw failedFill(result);
    const field = fieldByRef(fields.get(), ref);
    if (!field) throw new PluginError('not-found', 'form', 'no form field has this ref');
    if (result.status === 'rejected') {
      validationRejected.emit({ field, issues: result.diagnostics });
      return { field, status: 'rejected' };
    }
    return { field, status: result.status };
  };

  /**
   * Plain values for several fields, as one change with one recalculation. A value its field
   * can't take, or a field the session may not fill in, fails on its own; the rest go together,
   * and fail together when the engine refuses them.
   */
  const fillPlain = async (
    entries: readonly { readonly ref: FormFieldRef; readonly value: FormFieldValue }[],
    options?: OperationOptions,
  ): Promise<{
    applied: FormFieldRef[];
    failed: { ref: FormFieldRef; error: PluginErrorInfo }[];
  }> => {
    if (!fields.view().snapshot) await fields.settled();
    const index = fields.view();
    const accepted: { ref: FormFieldRef; value: FormFieldValue }[] = [];
    const failed: { ref: FormFieldRef; error: PluginErrorInfo }[] = [];
    for (const entry of entries) {
      try {
        const field = fieldByRef(index, entry.ref);
        if (!field) throw new PluginError('not-found', 'form', 'no form field has this ref');
        rights.assertMayFill(field, 'form.setValues');
        fieldValueWriteOf(field, entry.value);
        accepted.push({ ref: field.ref, value: entry.value });
      } catch (error) {
        failed.push({ ref: entry.ref, error: toPluginErrorInfo(toPluginError('form', error)) });
      }
    }
    if (accepted.length === 0) return { applied: [], failed };
    throwIfCancelled(options);
    try {
      const { result } = await fill(
        {
          ops: accepted.map((entry) => setValueOp(entry.ref, entry.value)),
          scripts: { kind: 'recalculate' },
          origin: 'user',
        },
        options,
      );
      if (result.status === 'failed') throw failedFill(result);
      return { applied: accepted.map((entry) => entry.ref), failed };
    } catch (error) {
      const info = toPluginErrorInfo(toPluginError('form', error));
      return {
        applied: [],
        failed: [...failed, ...accepted.map(({ ref }) => ({ ref, error: info }))],
      };
    }
  };

  const setValues: FormCapability['setValues'] = async (entries, options) => {
    throwIfCancelled(options);
    const { applied, failed } = await fillPlain(entries, options);
    return { applied, skipped: [], failed };
  };

  const importValues: FormCapability['importValues'] = async (values, options) => {
    throwIfCancelled(options);
    if (!fields.view().snapshot) await fields.settled();
    const index = fields.view();
    const skipped: { ref: string; reason: string }[] = [];
    const entries: { ref: FormFieldRef; value: FormFieldValue }[] = [];
    const names = new Map<string, string>();
    for (const [name, plain] of Object.entries(values)) {
      const field = fieldByRef(index, { kind: 'fqn', name });
      if (!field) {
        skipped.push({ ref: name, reason: 'the form has no field with this name' });
        continue;
      }
      if (!rights.mayFill(field)) {
        skipped.push({ ref: name, reason: 'you may not fill in this field' });
        continue;
      }
      const value = writeOfPlainValue(field, plain);
      if (!value) {
        skipped.push({ ref: name, reason: `a ${field.family} field can't take this value` });
        continue;
      }
      entries.push({ ref: field.ref, value });
      names.set(JSON.stringify(field.ref), name);
    }
    const { applied, failed } = await fillPlain(entries, options);
    return {
      applied,
      skipped,
      failed: failed.map(({ ref, error }) => ({
        ref: names.get(JSON.stringify(ref)) ?? '',
        error,
      })),
    } satisfies BatchResult<FormFieldRef, string>;
  };

  return {
    /** A text field's write, for the text being typed (write/typing.ts). */
    setText: (ref: FormFieldRef, text: string): Promise<FormSetValueResult> =>
      commit(ref, { value: text }, 'form.setValue'),
    api: {
      setValue: (ref, value, options) => commit(ref, value, 'form.setValue', options),
      setValues,
      importValues,
    } satisfies Partial<FormCapability>,
  };
}
