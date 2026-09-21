/**
 * The actions plane's seams into the form owner: the form-effects commit
 * sink (script `setValue` / `setDisplay` / reset effects land through the
 * owner, so the engine write and the visible model can never diverge) and
 * the submit dataset resolver (D7: a FRESH engine read, then the pure ISO
 * builder).
 */
import type { FormEffectsResult } from '@embedpdf/engine-core/runtime';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionSubmitRequest,
  SubmitIntent,
} from '@embedpdf/plugin-actions/contract';

import { buildSubmitEntries } from '../field-selection';
import type { FormHostCapability } from '../host-contract';
import type { FormContext, FormServices } from '../services';
import type { FormHydration } from '../sync/hydration';

export function createScriptEffects(
  ctx: FormContext,
  { siblings }: Pick<FormServices, 'siblings'>,
  hydration: FormHydration,
) {
  const annotationHost = siblings.annotation;
  const { refresh } = hydration;

  /**
   * The submit dataset resolver (Phase 4, D7): a FRESH engine read — never
   * the cached model, so no staleness class exists — then the pure ISO
   * builder. Selection/veto/value semantics live in `field-selection.ts`;
   * this door only supplies the live fields and assembles the request.
   */
  const resolveSubmitDataset = async (
    intent: SubmitIntent,
    actionCtx: ActionContext,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionSubmitRequest> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('no document');
    const snapshot = await doc.forms.list();
    return {
      url: intent.url,
      method: intent.method,
      format: intent.format,
      flagsRaw: intent.flagsRaw,
      ...(intent.charSet === undefined ? {} : { charSet: intent.charSet }),
      entries: buildSubmitEntries(snapshot.fields, intent, diagnose),
      origin: actionCtx.origin,
      event: actionCtx.event,
    };
  };

  return {
    api: {
      resolveSubmitDataset,
      commitScriptFormEffects: async (effects) => {
        const doc = ctx.doc;
        if (!doc?.forms.applyEffects) {
          // Sink contract: never throw — shape an all-failed batch honestly.
          return {
            results: effects.map((_, index) => ({
              index,
              status: 'failed' as const,
              fields: [],
              changedWidgets: [],
              error: { code: 'NotSupported', message: 'no form-effects batch door' } as never,
            })),
            changedWidgets: [],
            meta: null,
          };
        }
        let result: FormEffectsResult;
        try {
          result = await doc.forms.applyEffects(effects);
        } catch (error) {
          // Sink contract: never throw. An authority pre-check rejection
          // (PermissionDenied) becomes an all-failed batch, honestly.
          const message = error instanceof Error ? error.message : String(error);
          return {
            results: effects.map((_, index) => ({
              index,
              status: 'failed' as const,
              fields: [],
              changedWidgets: [],
              error: { code: 'Refused', message } as never,
            })),
            changedWidgets: [],
            meta: null,
          };
        }
        // Reconcile OUR model — the owner folds its own writes (the effects
        // listener deliberately ignores local events) — and the ANNOTATION
        // plane's view of any changed widgets (setDisplay flips widget /F
        // bits, and widget pixels live on that plane).
        await refresh();
        if (annotationHost) {
          const seen = new Set<number>();
          for (const widget of result.changedWidgets) {
            if (!widget.page || seen.has(widget.page.pageObjectNumber)) continue;
            seen.add(widget.page.pageObjectNumber);
            await annotationHost.reloadPage(widget.page);
          }
        }
        return result;
      },
    } satisfies Partial<FormHostCapability>,
  };
}
