/**
 * The keystroke, validate, calculate and format script pipeline. Scripts run
 * in the actions plugin's per-document realm: when that realm offers a
 * transaction port, JavaScript is on (the switch is
 * `actionsPlugin({ javascript })`). This plugin owns only the pipeline.
 */
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';

import type { FormCommitResult, FormConfig } from '../contract';
import { createFormScriptingController } from '../scripting/controller';
import type { FormContext } from './context';
import type { FormSiblings } from './siblings';

export function createScriptingSeam(ctx: FormContext, config: FormConfig, siblings: FormSiblings) {
  const actionsHost = siblings.actions;
  const realm = actionsHost?.scriptRealm ?? null;
  const scripting =
    realm && ctx.doc && config.validation !== 'none'
      ? createFormScriptingController({
          doc: ctx.doc,
          document: () => ctx.document(),
          transaction: realm.transaction.bind(realm),
          budget: realm.budget,
        })
      : null;
  if (scripting) ctx.cleanup(() => scripting.dispose());
  /** Script results (UI effects, diagnostics, errors) are surfaced through the
   *  actions plugin, with the origin that caused them. */
  const surfaceViaActions = (result: FormCommitResult, origin: ActionOrigin): void => {
    actionsHost?.surfaceScriptCommit(result, { origin, realm: 'document' });
  };
  return { controller: scripting, surface: surfaceViaActions };
}
export type FormScripting = ReturnType<typeof createScriptingSeam>;
