/**
 * Resets: one shared core (an effects batch, then recalculation when the
 * document's scripts run) used by both the ResetForm action executor and the
 * public `reset`, so the two cannot diverge. A reset resets the fields it
 * selects that the user may fill in: another signer's fields stay as they are.
 */
import { PluginError, toPluginError } from '@embedpdf/core';
import type { FormFieldRef, PdfActionTargetRef } from '@embedpdf/engine-core/runtime';
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';

import type { FormFieldDTO } from '@embedpdf/engine-core/runtime';

import type { FormCommitResult, FormResetResult } from '../contract';
import { resolveFieldSelection } from '../field-selection';
import type { FormHostCapability } from '../host-contract';
import { fieldByRef, fieldsWithChangedValues } from '../model';
import type { FormContext, FormServices } from '../services';

const NOT_SCRIPTED: FormCommitResult = {
  status: 'unchanged',
  scripted: false,
  effectsResult: null,
  uiEffects: [],
  diagnostics: [],
};

/** A field ref as an action's target: by object number, or by full name. */
const targetOf = (ref: FormFieldRef): PdfActionTargetRef =>
  ref.kind === 'objectNumber'
    ? { kind: 'objectNumber', objectNumber: ref.objectNumber }
    : { kind: 'name', name: ref.name };

export function createResetWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'fields' | 'rights' | 'scripting' | 'enqueue'>,
) {
  const { fields, rights, enqueue, scripting } = services;

  /**
   * Whether a reset puts this field back: the engine refuses push button and
   * signature refs, and another signer's fields are theirs.
   */
  const resettable = (field: FormFieldDTO): boolean =>
    field.family !== 'pushbutton' && field.family !== 'signature' && rights.mayFill(field);

  /**
   * The shared reset core: one effects batch, then recalculation when the
   * document's scripts run. `origin` is carried through to the surfaced
   * recalculation results, so a ResetForm run by a page or hover trigger
   * never reports its alerts as a user action.
   */
  const applyResetBatch = async (
    refs: FormFieldRef[],
    origin: ActionOrigin,
  ): Promise<FormCommitResult> => {
    const doc = ctx.doc;
    if (!doc.forms.applyEffects) {
      const result: FormCommitResult = {
        ...NOT_SCRIPTED,
        diagnostics: [
          { code: 'unsupported-api', message: 'this engine has no form-effects batch door' },
        ],
      };
      scripting.surface(result, origin);
      return result;
    }
    // Zero refs must not reach the engine (it rejects an empty reset); an
    // include list of `[]` is a valid action that resets nothing.
    // `effectsResult: null` tells the executor this was inert.
    if (refs.length === 0) return NOT_SCRIPTED;
    const effectsResult = await doc.forms.applyEffects([{ kind: 'reset', refs }]);
    // The batch is not atomic and reports per-effect statuses instead of
    // throwing: report a rejected or failed reset as failed (the executor
    // maps that to a failed chain node).
    const resetFailed = effectsResult.results.some(
      (entry) => entry.status === 'failed' || entry.status === 'rejected',
    );
    if (resetFailed) {
      return { status: 'failed', scripted: false, effectsResult, uiEffects: [], diagnostics: [] };
    }
    // Acrobat recalculates after a reset; the document's open scripts run first, once.
    const pipeline = scripting.controller();
    let recalc: FormCommitResult | null = null;
    if (pipeline) {
      recalc = await pipeline.recalculate();
      scripting.surface(recalc, origin);
    }
    return {
      status: 'applied',
      scripted: recalc !== null,
      effectsResult,
      uiEffects: recalc?.uiEffects ?? [],
      diagnostics: recalc?.diagnostics ?? [],
      ...(recalc?.error ? { error: recalc.error } : {}),
    };
  };

  /** Reset the selected fields, inside the write queue. */
  const resetSelection = async (
    targets: PdfActionTargetRef[] | null,
    exclude: boolean,
    origin: ActionOrigin,
  ): Promise<FormCommitResult> => {
    // Read the field tree from the engine inside the queue: the selection
    // must see every write queued before this one.
    const snapshot = await ctx.doc.forms.list();
    // ISO 32000-2 Tables 241/242: a parent name resets its descendants too.
    const { selected } = resolveFieldSelection(snapshot.fields, targets, exclude);
    // An exclude-mode complement always includes the form's buttons.
    return applyResetBatch(
      selected.filter(resettable).map((field) => field.ref),
      origin,
    );
  };

  const reset: FormHostCapability['reset'] = async (refs, options) => {
    // A field you name is one you mean: one you may not fill in refuses the reset.
    for (const ref of refs ?? []) {
      const field = fieldByRef(fields.get(), ref);
      if (field) rights.assertMayFill(field, 'form.reset');
    }
    return enqueue(async (): Promise<FormResetResult> => {
      try {
        if (refs && refs.length === 0) return { fields: [] };
        // An engine without the effects batch resets on its own, without recalculating.
        if (!ctx.doc.forms.applyEffects) {
          const mine = (fields.get().snapshot?.fields ?? [])
            .filter(resettable)
            .map((field) => field.ref);
          const result = await ctx.cancellable(
            options?.signal,
            ctx.doc.forms.reset(refs ? [...refs] : mine),
          );
          return { fields: result.fields };
        }
        // What changed is what holds another value after the reset and the
        // recalculation that follows it: the mirror has both when they land.
        const before = fields.get();
        const result = await ctx.cancellable(
          options?.signal,
          resetSelection(refs ? refs.map(targetOf) : null, false, 'user'),
        );
        if (result.status === 'failed') {
          throw new PluginError(
            'operation-failed',
            'form',
            result.effectsResult?.results.find(
              (entry) => entry.status === 'failed' || entry.status === 'rejected',
            )?.error?.message ?? 'the reset failed',
          );
        }
        return { fields: fieldsWithChangedValues(before, fields.get()) };
      } catch (error) {
        throw toPluginError('form', error);
      }
    }, options);
  };

  return {
    api: {
      reset,
      resetFormAction: (targets, exclude, origin = 'user') =>
        enqueue(() => resetSelection(targets, exclude, origin)),
    } satisfies Partial<FormHostCapability>,
  };
}
