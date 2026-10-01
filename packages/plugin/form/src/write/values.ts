/**
 * Value writes: the validated path (through the document's scripts when they
 * are enabled), the raw passthrough, and the batch verbs, all on the one
 * write queue. The fields mirror applies each confirmed write; these verbs
 * only mark the field as in flight while the engine works.
 */
import { toPluginError, toPluginErrorInfo, type BatchResult } from '@embedpdf/core';
import type { FormFieldRef, FormFieldValue } from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormCommitResult, SetValueResult } from '../contract';
import { beginWrite, endWrite, fieldByKey } from '../model';
import type { FormContext, FormServices } from '../services';

export function createValueWrites(
  ctx: FormContext,
  services: Pick<
    FormServices,
    'events' | 'scripting' | 'enqueue' | 'keyOf' | 'fields'
  >,
) {
  const { validationRejected } = services.events;
  const { enqueue, keyOf, fields } = services;
  const scripting = services.scripting.controller;
  // A download waits for the values on their way.
  ctx.onSettle(() => enqueue.idle());
  const surfaceViaActions = services.scripting.surface;

  const commitValue = async (
    ref: FormFieldRef,
    value: FormFieldValue,
  ): Promise<FormCommitResult> => {
    if (scripting) {
      const result = await scripting.commit(ref, value);
      surfaceViaActions(result, 'user');
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

  const write = async (ref: FormFieldRef, value: FormFieldValue): Promise<SetValueResult> => {
    ctx.assertAllowed('doc.forms.fill', 'form.setValue');
    const key = keyOf(ref);
    return enqueue(async () => {
      ctx.state.update(beginWrite, key);
      try {
        const result = await commitValue(ref, value);
        if (result.status === 'rejected') {
          validationRejected.emit({ ref, issues: result.diagnostics });
        }
        return result;
      } catch (error) {
        throw toPluginError('form', error);
      } finally {
        ctx.state.update(endWrite, key);
      }
    });
  };

  const writeBatch = async <Entry>(
    entries: readonly Entry[],
    run: (entry: Entry) => Promise<SetValueResult>,
    refOf: (entry: Entry) => FormFieldRef,
  ): Promise<BatchResult<FormFieldRef, Entry>> => {
    const applied: FormFieldRef[] = [];
    const failed: { ref: Entry; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
    for (const entry of entries) {
      try {
        const result = await run(entry);
        if (result.status === 'rejected' || result.status === 'failed') {
          failed.push({
            ref: entry,
            error: {
              code: result.status === 'rejected' ? 'invalid-input' : 'operation-failed',
              message: result.error?.message ?? result.diagnostics[0]?.message ?? result.status,
              capability: 'form',
              permission: null,
            },
          });
        } else {
          applied.push(refOf(entry));
        }
      } catch (error) {
        failed.push({ ref: entry, error: toPluginErrorInfo(toPluginError('form', error)) });
      }
    }
    return { applied, skipped: [], failed };
  };

  return {
    api: {
      setValue: write,
      setText: (ref, text) => write(ref, { value: text }),
      setChecked: (ref, exportValue) => write(ref, { value: exportValue }),
      setChoice: (ref, values) =>
        write(
          ref,
          fieldByKey(fields.get(), keyOf(ref))?.family === 'combobox'
            ? { value: values[0] ?? null }
            : { selectedValues: [...values] },
        ),
      setValueRaw: (ref, value) => enqueue(() => ctx.doc.forms.setValue(ref, value)),
      setValues: async (entries) => {
        const result = await writeBatch(
          entries,
          (entry) => write(entry.ref, entry.value),
          (entry) => entry.ref,
        );
        return {
          applied: result.applied,
          skipped: [],
          failed: result.failed.map((failure) => ({ ref: failure.ref.ref, error: failure.error })),
        };
      },
      importValues: (values) =>
        writeBatch(
          Object.keys(values),
          (name) => write({ kind: 'fqn', name }, values[name]!),
          (name) => ({ kind: 'fqn', name }),
        ),
    } satisfies Partial<FormCapability>,
  };
}
