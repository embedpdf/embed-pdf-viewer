/** Aggregate step statuses. A step failure never skips its siblings; this
 *  only folds what each step reported. Pure. */
import type { ActionDiagnostic, ActionStepResult, ActionTriggerResult } from '../contract';

export const foldSteps = (
  steps: ActionStepResult[],
  diagnostics: ActionDiagnostic[],
): ActionTriggerResult => {
  const statuses = steps.map((step) => step.result.status);
  const status: ActionTriggerResult['status'] =
    steps.length === 0
      ? 'inert'
      : statuses.every((stepStatus) => stepStatus === 'refused')
        ? 'refused'
        : statuses.every((stepStatus) => stepStatus === 'inert')
          ? 'inert'
          : statuses.every((stepStatus) => stepStatus === 'executed')
            ? 'executed'
            : 'partial';
  return { status, steps, diagnostics };
};
