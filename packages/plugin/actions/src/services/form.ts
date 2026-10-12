/**
 * The form, as scripts and dispatch read it: the form plugin's view, its fields with this
 * session's pending fills, when it registered one (`registerFormReader`); the engine's
 * otherwise.
 */
import type { FormSnapshot } from '@embedpdf/engine-core/runtime';

import type { ActionsContext } from './context';
import type { ActionPorts } from './ports';

export interface ActionsForm {
  /** The form now. `read` wraps an engine read, so the caller's signal can stop it. */
  read(read?: <T>(task: Promise<T>) => Promise<T>): Promise<FormSnapshot>;
}

export function createForm(ctx: ActionsContext, ports: ActionPorts): ActionsForm {
  return {
    read: (read = (task) => task) => {
      const shown = ports.formReader?.();
      return shown ? Promise.resolve(shown) : read(ctx.doc.forms.list());
    },
  };
}
