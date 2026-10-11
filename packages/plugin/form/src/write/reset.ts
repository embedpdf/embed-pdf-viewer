/**
 * Resets: one shared core (one fill: the reset, then the recalculation when the document's
 * scripts run) used by both the ResetForm action executor and the public `reset`, so the two
 * cannot diverge. A reset resets the fields it selects that the user may fill in: another
 * signer's fields stay as they are.
 */
import type { OperationOptions } from '@embedpdf/core';
import type { FormFieldDTO, FormFieldRef, PdfActionTargetRef } from '@embedpdf/engine-core/runtime';
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult } from '../contract';
import { resolveFieldSelection } from '../field-selection';
import type { FormHostCapability } from '../host-contract';
import { fieldByRef, fieldsWithChangedValues } from '../model';
import type { FormContext, FormServices } from '../services';
import type { FillOutcome, Fills } from './fill';

/** A reset of no fields: what the executor reports as inert. */
const NOTHING_RESET: FormCommitResult = {
  status: 'unchanged',
  scripted: false,
  uiEffects: [],
  diagnostics: [],
};

/** A field ref as an action's target: by object number, or by full name. */
const targetOf = (ref: FormFieldRef): PdfActionTargetRef =>
  ref.kind === 'objectNumber'
    ? { kind: 'objectNumber', objectNumber: ref.objectNumber }
    : { kind: 'name', name: ref.name };

export function createResetWrites(
  _ctx: FormContext,
  services: Pick<FormServices, 'fields' | 'rights'>,
  { fill }: Fills,
) {
  const { fields, rights } = services;

  /**
   * Whether a reset puts this field back: the engine refuses push button and
   * signature refs, and another signer's fields are theirs.
   */
  const resettable = (field: FormFieldDTO): boolean =>
    field.family !== 'pushbutton' && field.family !== 'signature' && rights.mayFill(field);

  /**
   * Reset the selected fields, then recalculate, as one change. `origin` is carried through to
   * the surfaced recalculation results, so a ResetForm run by a page or hover trigger never
   * reports its alerts as a user action. `null` when it selects nothing; a refused reset throws:
   * none of it was written.
   */
  const resetSelection = async (
    targets: PdfActionTargetRef[] | null,
    exclude: boolean,
    origin: ActionOrigin,
    options?: OperationOptions,
  ): Promise<FillOutcome | null> => {
    if (!fields.view().snapshot) await fields.settled();
    // ISO 32000-2 Tables 241/242: a parent name resets its descendants too.
    const { selected } = resolveFieldSelection(
      fields.view().snapshot?.fields ?? [],
      targets,
      exclude,
    );
    // An exclude-mode complement always includes the form's buttons. Zero refs must not reach
    // the engine (it refuses an empty reset); an include list of `[]` resets nothing.
    const refs = selected.filter(resettable).map((field) => field.ref);
    if (refs.length === 0) return null;
    return fill(
      {
        label: { key: 'form.reset', count: refs.length },
        ops: [{ type: 'forms.reset', fields: refs }],
        scripts: { kind: 'recalculate' },
        origin,
      },
      options,
    );
  };

  const reset: FormHostCapability['reset'] = async (refs, options) => {
    // A field you name is one you mean: one you may not fill in refuses the reset.
    for (const ref of refs ?? []) {
      const field = fieldByRef(fields.view(), ref);
      if (field) rights.assertMayFill(field, 'form.reset');
    }
    if (refs && refs.length === 0) return { fields: [] };
    const outcome = await resetSelection(refs ? refs.map(targetOf) : null, false, 'user', options);
    // What changed is what holds another value after the reset and its recalculation.
    return { fields: outcome ? fieldsWithChangedValues(outcome.before, outcome.after) : [] };
  };

  return {
    api: {
      reset,
      resetFormAction: async (targets, exclude, origin = 'user') => {
        const outcome = await resetSelection(targets, exclude, origin);
        if (!outcome) return NOTHING_RESET;
        // The action ran, even on fields already at their defaults.
        const { result } = outcome;
        return result.status === 'unchanged' ? { ...result, status: 'applied' } : result;
      },
    } satisfies Partial<FormHostCapability>,
  };
}
