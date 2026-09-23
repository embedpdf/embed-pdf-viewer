/**
 * The actions plugin's seams into the form plugin: the form-effects commit
 * sink (script `setValue`, `setDisplay` and reset effects are written through
 * the plugin that owns the fields) and the submit dataset resolver.
 */
import {
  EngineError,
  EngineErrorCode,
  serializeError,
  type FormEffectsResult,
} from '@embedpdf/engine-core/runtime';
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
        const doc = ctx.doc;
        if (!doc.forms.applyEffects) {
          // The sink never throws: report every effect as failed instead.
          return {
            results: effects.map((_, index) => ({
              index,
              status: 'failed' as const,
              fields: [],
              changedWidgets: [],
              error: serializeError(
                new EngineError(EngineErrorCode.NotImplemented, 'no form-effects batch door'),
              ),
            })),
            changedWidgets: [],
            meta: null,
          };
        }
        let result: FormEffectsResult;
        try {
          result = await doc.forms.applyEffects(effects);
        } catch (error) {
          // The sink never throws: a refused batch (for example a permission
          // refusal) reports every effect as failed.
          const refusal = serializeError(error);
          return {
            results: effects.map((_, index) => ({
              index,
              status: 'failed' as const,
              fields: [],
              changedWidgets: [],
              error: refusal,
            })),
            changedWidgets: [],
            meta: null,
          };
        }
        // The fields mirror and the annotation plugin apply the confirmed
        // effects from the `form.effectsApplied` event.
        return result;
      },
    } satisfies Partial<FormHostCapability>,
  };
}
