/**
 * Value writes, all on the one write queue: one field through the form's
 * scripts (when the `validation` setting runs them), and the batch verbs
 * built on it. The fields mirror applies each confirmed write; these verbs
 * only mark the field as in flight while the engine works.
 */
import {
  PluginError,
  toPluginError,
  toPluginErrorInfo,
  type BatchResult,
  type OperationOptions,
  type PluginErrorInfo,
} from '@embedpdf/core';
import type { FormFieldRef, FormFieldValue } from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormCommitResult, FormSetValueResult } from '../contract';
import { beginWrite, endWrite, fieldByRef } from '../model';
import { writeOfPlainValue } from '../read/fields';
import type { FormContext, FormServices } from '../services';

const FILL = 'doc.forms.fill';

/** A batch that stops when its caller cancels it. */
function throwIfCancelled(options?: OperationOptions): void {
  if (options?.signal?.aborted) {
    throw new PluginError('operation-cancelled', 'form', 'operation cancelled', {
      cause: options.signal.reason,
    });
  }
}

/** Why the form refused a value, as a batch reports it. */
const rejection = (result: FormSetValueResult): PluginErrorInfo => ({
  code: 'invalid-input',
  message: `the form refused the value of '${result.field.name}'`,
  capability: 'form',
  permission: null,
});

export function createValueWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'events' | 'scripting' | 'enqueue' | 'keyOf' | 'fields'>,
) {
  const { validationRejected } = services.events;
  const { enqueue, keyOf, fields, scripting } = services;
  // A download waits for the values on their way.
  ctx.onSettle(() => enqueue.idle());

  const commitValue = async (
    ref: FormFieldRef,
    value: FormFieldValue,
  ): Promise<FormCommitResult> => {
    const pipeline = scripting.controller();
    if (pipeline) {
      const result = await pipeline.commit(ref, value);
      scripting.surface(result, 'user');
      return result;
    }
    const result = await ctx.doc.forms.setValue(ref, value);
    return {
      status: result.meta.changedWidgets.length > 0 ? 'applied' : 'unchanged',
      scripted: false,
      effectsResult: null,
      uiEffects: [],
      diagnostics: [],
    };
  };

  /** One value write, already allowed: queued behind every write before it. */
  const write = (
    ref: FormFieldRef,
    value: FormFieldValue,
    options?: OperationOptions,
  ): Promise<FormSetValueResult> => {
    const key = keyOf(ref);
    return enqueue(async () => {
      ctx.state.update(beginWrite, key);
      try {
        const result = await ctx.cancellable(options?.signal, commitValue(ref, value));
        if (result.status === 'failed') {
          throw new PluginError(
            'operation-failed',
            'form',
            result.error?.message ?? result.diagnostics[0]?.message ?? 'the write failed',
          );
        }
        const field = fieldByRef(fields.get(), ref);
        if (!field) throw new PluginError('not-found', 'form', 'no form field has this ref');
        if (result.status === 'rejected') {
          validationRejected.emit({ field, issues: result.diagnostics });
        }
        return { field, status: result.status };
      } catch (error) {
        throw toPluginError('form', error);
      } finally {
        ctx.state.update(endWrite, key);
      }
    }, options);
  };

  const setValues: FormCapability['setValues'] = async (entries, options) => {
    ctx.assertAllowed(FILL, 'form.setValues');
    const applied: FormFieldRef[] = [];
    const failed: { ref: FormFieldRef; error: PluginErrorInfo }[] = [];
    for (const entry of entries) {
      throwIfCancelled(options);
      try {
        const result = await write(entry.ref, entry.value, options);
        if (result.status === 'rejected') failed.push({ ref: entry.ref, error: rejection(result) });
        else applied.push(entry.ref);
      } catch (error) {
        failed.push({ ref: entry.ref, error: toPluginErrorInfo(toPluginError('form', error)) });
      }
    }
    return { applied, skipped: [], failed };
  };

  const importValues: FormCapability['importValues'] = async (values, options) => {
    ctx.assertAllowed(FILL, 'form.importValues');
    const result: {
      applied: FormFieldRef[];
      skipped: { ref: string; reason: string }[];
      failed: { ref: string; error: PluginErrorInfo }[];
    } = { applied: [], skipped: [], failed: [] };
    for (const [name, plain] of Object.entries(values)) {
      throwIfCancelled(options);
      const field = fieldByRef(fields.get(), { kind: 'fqn', name });
      if (!field) {
        result.skipped.push({ ref: name, reason: 'the form has no field with this name' });
        continue;
      }
      const value = writeOfPlainValue(field, plain);
      if (!value) {
        result.skipped.push({ ref: name, reason: `a ${field.family} field can't take this value` });
        continue;
      }
      try {
        const written = await write(field.ref, value, options);
        if (written.status === 'rejected') {
          result.failed.push({ ref: name, error: rejection(written) });
        } else {
          result.applied.push(field.ref);
        }
      } catch (error) {
        result.failed.push({ ref: name, error: toPluginErrorInfo(toPluginError('form', error)) });
      }
    }
    return result satisfies BatchResult<FormFieldRef, string>;
  };

  return {
    /** A text field's write, for the text being typed (write/typing.ts). */
    setText: async (ref: FormFieldRef, text: string): Promise<FormSetValueResult> => {
      ctx.assertAllowed(FILL, 'form.setValue');
      return write(ref, { value: text });
    },
    api: {
      setValue: async (ref, value, options) => {
        ctx.assertAllowed(FILL, 'form.setValue');
        return write(ref, value, options);
      },
      setValues,
      importValues,
    } satisfies Partial<FormCapability>,
  };
}
