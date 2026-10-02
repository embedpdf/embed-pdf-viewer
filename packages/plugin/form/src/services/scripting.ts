/**
 * The keystroke, validate, calculate and format script pipeline. Scripts run
 * in the actions plugin's per-document realm: when that realm offers a
 * transaction port, JavaScript is on (the switch is
 * `actionsPlugin({ javascript })`). The `validation` setting decides, at each
 * write, whether the pipeline runs; this plugin owns only the pipeline.
 */
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult } from '../contract';
import { createFormScriptingController, type FormScriptingController } from '../scripting/controller';
import type { FormContext } from './context';
import type { FormSiblings } from './siblings';

export function createScriptingSeam(ctx: FormContext, siblings: FormSiblings) {
  const actionsHost = siblings.actions;
  const realm = actionsHost?.scriptRealm ?? null;
  const pipeline = realm
    ? createFormScriptingController({
        doc: ctx.doc,
        document: () => ctx.document(),
        transaction: realm.transaction.bind(realm),
        budget: realm.budget,
      })
    : null;
  if (pipeline) ctx.cleanup(() => pipeline.dispose());
  const settings = ctx.settings();
  return {
    /** The script pipeline when the document's scripts run for this write, else `null`. */
    controller: (): FormScriptingController | null =>
      settings.get().validation === 'scripts' ? pipeline : null,
    /** Script results (UI effects, diagnostics, errors) are surfaced through the
     *  actions plugin, with the origin that caused them. */
    surface: (result: FormCommitResult, origin: ActionOrigin): void => {
      actionsHost?.surfaceScriptCommit(result, { origin, realm: 'document' });
    },
  };
}
export type FormScripting = ReturnType<typeof createScriptingSeam>;
