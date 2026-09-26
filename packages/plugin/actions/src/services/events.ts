/** The five observability hooks; disposed with the plugin. */
import { createEventHook } from '@embedpdf/core';
import type { ScriptDiagnostic, ScriptExecutionError } from '@embedpdf/core-acrojs';

import type {
  ActionDiagnostic,
  ActionDispatchEvent,
  OpenSequenceCompletedEvent,
} from '../contract';
import type { ActionsContext } from './context';

export function createEvents(ctx: ActionsContext) {
  const actionHook = createEventHook<ActionDispatchEvent>((error) =>
    globalThis.console?.error('[actions] onExecuted observer failed:', error),
  );
  const openSequenceHook = createEventHook<OpenSequenceCompletedEvent>((error) =>
    console.error('[actions] onOpenSequenceCompleted listener threw', error),
  );
  const diagnosticHook = createEventHook<ActionDiagnostic>((error) =>
    globalThis.console?.error('[actions] onDiagnostic observer failed:', error),
  );
  const scriptDiagnosticHook = createEventHook<ScriptDiagnostic>((error) =>
    globalThis.console?.error('[actions] onScriptDiagnostic observer failed:', error),
  );
  const scriptErrorHook = createEventHook<ScriptExecutionError>((error) =>
    globalThis.console?.error('[actions] onScriptError observer failed:', error),
  );
  ctx.cleanup(() => {
    actionHook.dispose();
    diagnosticHook.dispose();
    scriptDiagnosticHook.dispose();
    scriptErrorHook.dispose();
    openSequenceHook.dispose();
  });
  return { actionHook, openSequenceHook, diagnosticHook, scriptDiagnosticHook, scriptErrorHook };
}
export type ActionsEvents = ReturnType<typeof createEvents>;
