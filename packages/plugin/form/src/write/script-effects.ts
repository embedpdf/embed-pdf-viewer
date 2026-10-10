/**
 * The actions plugin's seams into the form plugin: the form-effects commit
 * sink (script `setValue`, `setDisplay` and reset effects are written through
 * the plugin that owns the fields) and the submit dataset resolver.
 */
import { formEffectOps, serializeError } from '@embedpdf/engine-core/runtime';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionSubmitRequest,
  SubmitIntent,
} from '@embedpdf/plugin-actions/contract';

import { buildSubmitEntries } from '../field-selection';
import type { FormHostCapability } from '../host-contract';
import type { FormContext } from '../services';

export function createScriptEffects(ctx: FormContext) {
  /**
   * The submit dataset: the field tree read from the engine at submit time,
   * then the pure ISO builder. Selection, veto and value semantics live in
   * `field-selection.ts`; this only supplies the fields and assembles the
   * request.
   */
  const resolveSubmitDataset = async (
    intent: SubmitIntent,
    actionContext: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest> => {
    const snapshot = await ctx.doc.forms.list();
    return {
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      ...(intent.charSet === undefined ? {} : { charSet: intent.charSet }),
      entries: buildSubmitEntries(snapshot.fields, intent, diagnose),
      origin: actionContext.origin,
      event: actionContext.event,
    };
  };

  return {
    api: {
      resolveSubmitDataset,
      commitScriptFormEffects: async (effects) => {
        try {
          // One change: every effect is written, or none is. The fields
          // mirror applies them from the change's events.
          await ctx.doc.apply({ ops: formEffectOps(effects) });
          return { status: 'applied' };
        } catch (error) {
          // The sink never throws: a refused change (a permission refusal, a
          // missing field) reports why.
          return { status: 'failed', error: serializeError(error).message };
        }
      },
    } satisfies Partial<FormHostCapability>,
  };
}
