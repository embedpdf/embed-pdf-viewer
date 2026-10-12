/**
 * The actions plugin's seams into the form plugin: the form-effects commit
 * sink (script `setValue`, `setDisplay` and reset effects are written through
 * the plugin that owns the fields, as one fill with the calculations they
 * cause) and the submit dataset resolver.
 */
import {
  formEffectOps,
  serializeError,
  type FormEffect,
  type FormFieldRef,
} from '@embedpdf/engine-core/runtime';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionSubmitRequest,
  SubmitIntent,
} from '@embedpdf/plugin-actions/contract';

import { buildSubmitEntries } from '../field-selection';
import type { FormHostCapability } from '../host-contract';
import { fieldByRef } from '../model';
import type { FormContext, FormServices } from '../services';
import type { Fills } from './fill';

/** The fields a script's effects write to. */
const refsOf = (effects: readonly FormEffect[]): FormFieldRef[] =>
  effects.flatMap((effect) => (effect.kind === 'reset' ? effect.refs : [effect.ref]));

export function createScriptEffects(
  ctx: FormContext,
  { fields, rights, enqueue }: Pick<FormServices, 'fields' | 'rights' | 'enqueue'>,
  { fillSoon }: Fills,
) {
  /**
   * The submit dataset: the fields as the user sees them once every fill on its way is
   * answered, then the pure ISO builder. Selection, veto and value semantics live in
   * `field-selection.ts`; this only supplies the fields and assembles the request.
   */
  const resolveSubmitDataset = async (
    intent: SubmitIntent,
    actionContext: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest> => {
    await enqueue.idle();
    await ctx.changes.whenSettled();
    if (!fields.view().snapshot) await fields.settled();
    return {
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      ...(intent.charSet === undefined ? {} : { charSet: intent.charSet }),
      entries: buildSubmitEntries(fields.view().snapshot?.fields ?? [], intent, diagnose),
      origin: actionContext.origin,
      event: actionContext.event,
    };
  };

  return {
    api: {
      resolveSubmitDataset,
      commitScriptFormEffects: async (effects) => {
        try {
          // A field the session may not fill in is refused here, at once: the script learns
          // its write failed, as it would from the engine.
          for (const ref of refsOf(effects)) {
            const field = fieldByRef(fields.view(), ref);
            if (field) rights.assertMayFill(field, 'form.fill');
          }
          // The script's realm transaction is still running: the effects show at once, and
          // the calculations a value causes run once it ends, in the same change.
          const recalculates = effects.some(
            (effect) => effect.kind === 'setValue' || effect.kind === 'reset',
          );
          fillSoon({
            ops: formEffectOps(effects),
            scripts: recalculates ? { kind: 'recalculate' } : null,
            origin: 'user',
          });
          return { status: 'applied' };
        } catch (error) {
          // The sink never throws: a change it can't stage reports why.
          return { status: 'failed', error: serializeError(error).message };
        }
      },
    } satisfies Partial<FormHostCapability>,
  };
}
