/**
 * Resets: one shared core (an effects batch, then recalculation when the
 * document's scripts are enabled) used by both the /ResetForm action executor
 * and the public `reset` / `resetAll`, so the two cannot diverge.
 */
import { PluginError, toPluginError, type BatchResult } from '@embedpdf/core';
import type { FormFieldRef, PdfActionTargetRef } from '@embedpdf/engine-core/runtime';
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult } from '../contract';
import { resolveFieldSelection } from '../field-selection';
import type { FormHostCapability } from '../host-contract';
import { beginWrite, endWrite } from '../model';
import type { FormContext, FormServices } from '../services';

export function createResetWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'fields' | 'authority' | 'scripting' | 'enqueue' | 'keyOf'>,
) {
  const { fields, keyOf, enqueue } = services;
  const { assertFill } = services.authority;
  const scripting = services.scripting.controller;
  const surfaceViaActions = services.scripting.surface;

  const NOT_SCRIPTED: FormCommitResult = {
    status: 'unchanged',
    scripted: false,
    effectsResult: null,
    uiEffects: [],
    diagnostics: [],
  };

  /**
   * The shared reset core: one effects batch, then recalculation when the
   * document's scripts are enabled. `origin` is carried through to the
   * surfaced recalculation results, so a ResetForm run by a page or hover
   * trigger never reports its alerts as a user action.
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
      surfaceViaActions(result, origin);
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
      return {
        status: 'failed',
        scripted: false,
        effectsResult,
        uiEffects: [],
        diagnostics: [],
      };
    }
    // Acrobat recalculates after a reset; boot rides along lazily.
    let recalc: FormCommitResult | null = null;
    if (scripting) {
      recalc = await scripting.recalculate();
      surfaceViaActions(recalc, origin);
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

  const resetFormAction = (
    targets: PdfActionTargetRef[] | null,
    exclude: boolean,
    origin: ActionOrigin = 'user',
  ): Promise<FormCommitResult> =>
    enqueue(async () => {
      // Read the field tree from the engine inside the queue: the selection
      // must see every write queued before this action.
      const snapshot = await ctx.doc.forms.list();
      // ISO 32000-2 Tables 241/242: a parent name resets its descendants too.
      const { selected } = resolveFieldSelection(snapshot.fields, targets, exclude);
      // Skip fields with nothing to restore: the engine refuses pushbutton
      // and signature refs, and an exclude-mode complement always includes
      // the form's buttons.
      const resettable = selected.filter(
        (field) => field.family !== 'pushbutton' && field.family !== 'signature',
      );
      return applyResetBatch(
        resettable.map((field) => field.ref),
        origin,
      );
    });

  const resetAll = async (
    options: { fields?: readonly FormFieldRef[]; exclude?: boolean } = {},
  ): Promise<BatchResult<FormFieldRef, FormFieldRef>> => {
    assertFill('form.resetAll');
    const targets =
      options.fields?.map(
        (ref): PdfActionTargetRef =>
          ref.kind === 'objectNumber'
            ? { kind: 'objectNumber', objectNumber: ref.fieldObjectNumber }
            : { kind: 'name', name: ref.name },
      ) ?? null;
    const snapshot = fields.get().snapshot ?? (await ctx.doc.forms.list());
    const { selected } = resolveFieldSelection(snapshot.fields, targets, options.exclude ?? false);
    const refs = selected
      .filter((field) => field.family !== 'pushbutton' && field.family !== 'signature')
      .map((field) => field.ref);
    const result = await resetFormAction(targets, options.exclude ?? false, 'user');
    if (result.status === 'failed') {
      const failed = (result.effectsResult?.results ?? [])
        .filter((entry) => entry.status === 'failed' || entry.status === 'rejected')
        .flatMap((entry) => entry.fields.map((field) => field.ref));
      const failedKeys = new Set(failed.map(keyOf));
      return {
        applied: refs.filter((ref) => !failedKeys.has(keyOf(ref))),
        skipped: [],
        failed: failed.map((ref) => ({
          ref,
          error: { code: 'operation-failed' as const, message: 'reset failed', capability: 'form' },
        })),
      };
    }
    return { applied: refs, skipped: [], failed: [] };
  };

  return {
    api: {
      reset: async (ref) => {
        assertFill('form.reset');
        const key = keyOf(ref);
        return enqueue(async () => {
          const doc = ctx.doc;
          ctx.state.update(beginWrite, key);
          try {
            if (!doc.forms.applyEffects) {
              await doc.forms.reset(ref);
              return;
            }
            const result = await applyResetBatch([ref], 'user');
            if (result.status === 'failed') {
              throw new PluginError(
                'operation-failed',
                'form',
                result.effectsResult?.results.find(
                  (entry) => entry.status === 'failed' || entry.status === 'rejected',
                )?.error?.message ?? 'reset failed',
              );
            }
          } catch (error) {
            throw toPluginError('form', error);
          } finally {
            ctx.state.update(endWrite, key);
          }
        });
      },
      resetAll,
      resetFormAction,
    } satisfies Partial<FormHostCapability>,
  };
}
