/** Value writes: the validated path (scripts when enabled), the raw
 *  passthrough, and the batch doors — every one through the serial queue. */
import { PluginError, toPluginError, toPluginErrorInfo, type BatchResult } from '@embedpdf/core';
import type { FormFieldRef, FormFieldValue } from '@embedpdf/engine-core/runtime';

import type { FormCapability, FormCommitResult, SetValueResult } from '../contract';
import type { FormContext, FormServices } from '../services';
import type { FormHydration } from '../sync/hydration';

export function createValueWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'store' | 'events' | 'authority' | 'scripting' | 'enqueue'>,
  hydration: FormHydration,
) {
  const { keyOf, apply } = services.store;
  const { validationRejected } = services.events;
  const { assertFill } = services.authority;
  const scripting = services.scripting.controller;
  const surfaceViaActions = services.scripting.surface;
  const enqueueMutation = services.enqueue;
  const { refresh } = hydration;

  // ── typed writes: writeStart → engine → writeDone/writeFailed ──────────
  const commitValue = async (
    ref: FormFieldRef,
    value: FormFieldValue,
  ): Promise<FormCommitResult> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('no document');
    if (scripting) {
      const result = await scripting.commit(ref, value);
      surfaceViaActions(result, 'user');
      // A native partial/failed effects result can still have mutated state.
      if (result.effectsResult !== null) await refresh();
      return result;
    }

    const result = await doc.forms.setValue(ref, value);
    await refresh();
    return {
      status: result.changedWidgets.length > 0 ? 'applied' : 'unchanged',
      scripted: false,
      effectsResult: null,
      uiEffects: [],
      diagnostics: [],
    };
  };
  const write = async (ref: FormFieldRef, value: FormFieldValue): Promise<SetValueResult> => {
    assertFill('form.setValue');
    const key = keyOf(ref);
    return enqueueMutation(async () => {
      const doc = ctx.doc;
      if (!doc) throw new PluginError('not-ready', 'form', 'no document');
      apply({ t: 'writeStart', key });
      try {
        const result = await commitValue(ref, value);
        if (result.status === 'rejected' || result.status === 'failed') {
          apply({ t: 'writeFailed', key });
        } else if (result.effectsResult === null && result.scripted) {
          // A scripted no-op has no engine read-back to clear the spinner.
          apply({ t: 'writeFailed', key });
        }
        if (result.status === 'rejected') {
          validationRejected.emit({ ref, issues: result.diagnostics });
        }
        return result;
      } catch (err) {
        apply({ t: 'writeFailed', key });
        throw toPluginError('form', err);
      }
    });
  };
  const writeBatch = async <R>(
    entries: readonly R[],
    run: (entry: R) => Promise<SetValueResult>,
    refOf: (entry: R) => FormFieldRef,
  ): Promise<BatchResult<FormFieldRef, R>> => {
    const applied: FormFieldRef[] = [];
    const failed: { ref: R; error: ReturnType<typeof toPluginErrorInfo> }[] = [];
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
            },
          });
        } else applied.push(refOf(entry));
      } catch (error) {
        failed.push({ ref: entry, error: toPluginErrorInfo(toPluginError('form', error)) });
      }
    }
    return { applied, skipped: [], failed };
  };

  return {
    write,
    api: {
      setValue: write,
      setText: (ref, text) => write(ref, { type: 'text', value: text }),
      setChecked: (ref, onState) => write(ref, { type: 'toggle', state: onState }),
      setChoice: (ref, values) => write(ref, { type: 'choice', values: [...values] }),
      setValueRaw: (ref, value) =>
        enqueueMutation(async () => {
          const doc = ctx.doc;
          if (!doc) throw new PluginError('not-ready', 'form', 'no document');
          const result = await doc.forms.setValue(ref, value);
          await refresh();
          return result;
        }),
      setValues: async (entries) => {
        const result = await writeBatch(
          entries,
          (entry) => write(entry.ref, entry.value),
          (entry) => entry.ref,
        );
        const out: BatchResult<FormFieldRef, FormFieldRef> = {
          applied: result.applied,
          skipped: [],
          failed: result.failed.map((f) => ({ ref: f.ref.ref, error: f.error })),
        };
        return out;
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
