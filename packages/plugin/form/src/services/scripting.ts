/**
 * The K/V/C/F seam. Scripting rides the actions plugin's per-document realm:
 * the transaction port's PRESENCE is the "JavaScript is on" signal (D8 — the
 * switch lives on `actionsPlugin({ javascript })`; form owns only the
 * keystroke / validate / calculate / format pipeline).
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
  /** Every script surface (UI effects, diagnostics, errors) flows through
   *  the actions plugin's ONE port — origin/phase attached (D9). */
  const surfaceViaActions = (result: FormCommitResult, origin: ActionOrigin): void => {
    actionsHost?.surfaceScriptCommit(result, { origin, realm: 'document' });
  };
  return { controller: scripting, surface: surfaceViaActions };
}
export type FormScripting = ReturnType<typeof createScriptingSeam>;
