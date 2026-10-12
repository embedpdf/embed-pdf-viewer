/**
 * The scripting controller against an engine document, for direct controller tests: each call
 * reads the form from the engine, runs the scripts, and writes what they changed inside the same
 * transaction, as the plugin's fill path does against the view. It answers as the plugin's verbs
 * do (`FormCommitResult`).
 */
import {
  formEffectOps,
  type DocumentHandle,
  type FormFieldRef,
  type FormFieldValue,
  type FormSnapshot,
  type PdfActionTree,
} from '@embedpdf/engine-core/runtime';

import type { FormCommitResult } from '../../src/contract';
import {
  createFormScriptingController,
  type FormScriptingControllerOptions,
  type FormScriptResult,
  type FormScripts,
} from '../../src/scripting/controller';

export function engineScripts({
  doc,
  ...options
}: FormScriptingControllerOptions & { doc: DocumentHandle }) {
  const controller = createFormScriptingController(options);
  const through = (
    run: (scripts: FormScripts, form: FormSnapshot) => Promise<FormScriptResult>,
  ): Promise<FormCommitResult> =>
    controller.transaction(async (scripts) => {
      const result = await run(scripts, await doc.forms.list());
      const written =
        result.status === 'accepted'
          ? result.effects
          : result.status === 'rejected'
            ? result.bootEffects
            : [];
      const ops = formEffectOps(written);
      const undoable = ops.length > 0 && (await doc.apply({ ops })).meta.undoable;
      return {
        status: result.status === 'accepted' ? (undoable ? 'applied' : 'unchanged') : result.status,
        scripted: true,
        uiEffects: result.uiEffects,
        diagnostics: result.diagnostics,
        ...(result.error ? { error: result.error } : {}),
      };
    });
  return {
    commit: (ref: FormFieldRef, value: FormFieldValue) =>
      through((scripts, form) => scripts.commit(form, ref, value)),
    activate: (ref: FormFieldRef, action: PdfActionTree<unknown>) =>
      through((scripts, form) => scripts.activate(form, ref, action)),
    recalculate: () => through((scripts, form) => scripts.recalculate(form)),
    dispose: () => controller.dispose(),
  };
}
