/** Aggregate step statuses. A step failure never skips its siblings; this
 *  only FOLDS what each step reported. Pure. */
import type { ActionDiagnostic, ActionStepResult, ActionTriggerResult } from '../contract';

export const foldSteps = (
  steps: ActionStepResult[],
  diagnostics: ActionDiagnostic[],
): ActionTriggerResult => {
  const statuses = steps.map((s) => s.result.status);
  const status: ActionTriggerResult['status'] =
    steps.length === 0
      ? 'inert'
      : statuses.every((s) => s === 'refused')
        ? 'refused'
        : statuses.every((s) => s === 'inert')
          ? 'inert'
          : statuses.every((s) => s === 'executed')
            ? 'executed'
            : 'partial';
  return { status, steps, diagnostics };
};
