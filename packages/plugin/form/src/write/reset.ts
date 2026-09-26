/**
 * Resets: the shared reset core (one effects batch → refresh → V/C/F
 * recalculation when the transaction port is present) ridden by BOTH doors —
 * the /ResetForm executor and the public `reset` / `resetAll` — so the two
 * can never diverge.
 */
import { PluginError, toPluginError, type BatchResult } from '@embedpdf/core';
import type { FormFieldRef, PdfActionTargetRef } from '@embedpdf/engine-core/runtime';
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult } from '../contract';
import { fieldByKey } from '../core/model';
import { resolveFieldSelection } from '../field-selection';
import type { FormHostCapability } from '../host-contract';
import type { FormContext, FormServices } from '../services';
import type { FormHydration } from '../sync/hydration';

export function createResetWrites(
  ctx: FormContext,
  services: Pick<FormServices, 'store' | 'authority' | 'scripting' | 'enqueue'>,
  hydration: FormHydration,
) {
  const { model, apply, keyOf } = services.store;
  const { assertFill } = services.authority;
  const scripting = services.scripting.controller;
  const surfaceViaActions = services.scripting.surface;
  const enqueueMutation = services.enqueue;
  const { refresh } = hydration;

  const NOT_SCRIPTED: FormCommitResult = {
    status: 'unchanged',
    scripted: false,
    effectsResult: null,
    uiEffects: [],
    diagnostics: [],
  };

  /**
   * The shared reset core: one effects batch → refresh → V/C/F
   * recalculation when the transaction port is present. Ridden by BOTH
   * doors — the /ResetForm executor and the public `reset(key)` — so the
   * two can never diverge again (the "reset() asymmetry" fix). `origin` is
   * PRESERVED through recalculation surfacing: a lifecycle/hover ResetForm
   * can no longer launder its alerts into user origin.
   */
  const applyResetBatch = async (
    refs: FormFieldRef[],
    origin: ActionOrigin,
  ): Promise<FormCommitResult> => {
    const doc = ctx.doc;
    if (!doc) throw new Error('no document');
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
    // Zero refs must NEVER reach the engine (the applier throws InvalidArg
    // on an empty reset) — `[] + include` is a valid action that resets
    // nothing. `effectsResult: null` tells the executor this was inert.
    if (refs.length === 0) return NOT_SCRIPTED;
    const effectsResult = await doc.forms.applyEffects([{ kind: 'reset', refs }]);
    // The batch is non-rollback-atomic and resolves with per-effect
    // statuses instead of throwing — reflect a rejected/failed reset
    // honestly (the executor maps 'failed' to a failed chain node).
    const resetFailed = effectsResult.results.some(
      (entry) => entry.status === 'failed' || entry.status === 'rejected',
    );
    await refresh();
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
      if (recalc.effectsResult !== null) await refresh();
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
    enqueueMutation(async () => {
      const doc = ctx.doc;
      if (!doc) throw new Error('no document');
      const snapshot = await doc.forms.list();
      // The shared ISO selection (Tables 241/242): a parent NAME resets its
      // descendants too — the exact-match resolution this replaces was a
      // conformance bug.
      const { selected } = resolveFieldSelection(snapshot.fields, targets, exclude);
      // ResetForm SKIPS fields with nothing to restore — the engine's batch
      // applier refuses pushbutton/signature refs outright (validateEffect),
      // and an exclude-mode complement always sweeps in the form's buttons.
      const resettable = selected.filter(
        (f) => f.family !== 'pushbutton' && f.family !== 'signature',
      );
      return applyResetBatch(
        resettable.map((f) => f.ref),
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
    const snapshot = model().snapshot ?? (await ctx.doc!.forms.list());
    const { selected } = resolveFieldSelection(snapshot.fields, targets, options.exclude ?? false);
    const refs = selected
      .filter((f) => f.family !== 'pushbutton' && f.family !== 'signature')
      .map((f) => f.ref);
    const result = await resetFormAction(targets, options.exclude ?? false, 'user');
    if (result.status === 'failed') {
      const failed = (result.effectsResult?.results ?? [])
        .filter((entry) => entry.status === 'failed' || entry.status === 'rejected')
        .flatMap((entry) => entry.fields.map((f) => f.ref));
      const failedKeys = new Set(failed.map(keyOf));
      return {
        applied: refs.filter((r) => !failedKeys.has(keyOf(r))),
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
        return enqueueMutation(async () => {
          const doc = ctx.doc;
          if (!doc) return;
          apply({ t: 'writeStart', key });
          try {
            if (doc.forms.applyEffects) {
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
              const field = fieldByKey(model(), key);
              if (field) apply({ t: 'writeDone', key, field });
              else apply({ t: 'writeFailed', key });
            } else {
              const result = await doc.forms.reset(ref);
              apply({ t: 'writeDone', key, field: result.field });
            }
          } catch (err) {
            apply({ t: 'writeFailed', key });
            throw toPluginError('form', err);
          }
        });
      },
      resetAll,
      resetFormAction,
    } satisfies Partial<FormHostCapability>,
  };
}
