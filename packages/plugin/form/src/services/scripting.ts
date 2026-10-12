/**
 * The keystroke, validate, calculate and format script pipeline. Scripts run
 * in the actions plugin's per-document realm: when that realm offers a
 * transaction port, JavaScript is on (the switch is
 * `actionsPlugin({ javascript })`). The `validation` setting decides, at each
 * write, whether the pipeline runs; this plugin owns only the pipeline.
 */
import type { ActionOrigin } from '@embedpdf/plugin-actions/contract';
import type { ScriptCommitSurface } from '@embedpdf/plugin-actions/contract/host';

import { formHasScripts, type FieldIndex } from '../model';
import {
  createFormScriptingController,
  type FormScriptingController,
} from '../scripting/controller';
import type { FormContext } from './context';
import type { FormSiblings } from './siblings';

export function createScriptingSeam(ctx: FormContext, siblings: FormSiblings) {
  const actionsHost = siblings.actions;
  const realm = actionsHost?.scriptRealm ?? null;
  const pipeline = realm
    ? createFormScriptingController({
        document: () => ctx.document(),
        transaction: realm.transaction.bind(realm),
        budget: realm.budget,
      })
    : null;
  if (pipeline) ctx.cleanup(() => pipeline.dispose());
  const settings = ctx.settings();
  const controller = (): FormScriptingController | null =>
    settings.get().validation === 'scripts' ? pipeline : null;

  // A one-shot developer hint: a form with scripts and no realm fills without them.
  let warnedNoRealm = false;
  const scriptsFor = (form: FieldIndex): FormScriptingController | null => {
    if (!formHasScripts(form)) return null;
    if (!realm && !warnedNoRealm && settings.get().validation === 'scripts') {
      warnedNoRealm = true;
      console.warn(
        "[form] this form has scripts, but they don't run: add the actions plugin with " +
          'JavaScript on (`actionsPlugin({ javascript: { enabled: true, sandboxFactory } })`), ' +
          "or set the form's `validation` to 'none' to fill it in without them.",
      );
    }
    return controller();
  };

  let warmed = false;
  return {
    /** The script pipeline when the document's scripts run, else `null`. */
    controller,
    /** The script pipeline for a write to this form: `null` too when no field has a script. */
    scriptsFor,
    /** Start the realm before the first write needs it, once, when the form has scripts. */
    warm(form: FieldIndex): void {
      if (warmed || !form.snapshot) return;
      const scripts = scriptsFor(form);
      if (!scripts) return;
      warmed = true;
      void scripts.warm(form.snapshot).catch(() => {
        /* the first write starts the realm, and reports why it can't */
      });
    },
    /** Script results (UI effects, diagnostics, errors) are surfaced through the
     *  actions plugin, with the origin that caused them. */
    surface: (result: ScriptCommitSurface, origin: ActionOrigin): void => {
      actionsHost?.surfaceScriptCommit(result, { origin, realm: 'document' });
    },
  };
}
export type FormScripting = ReturnType<typeof createScriptingSeam>;
