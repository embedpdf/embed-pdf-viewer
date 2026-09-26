/** The five observability events, disposed with the plugin. */
import type { PluginContext } from '@embedpdf/core';
import type { ScriptDiagnostic, ScriptExecutionError } from '@embedpdf/core-acrojs';

import type {
  ActionDiagnostic,
  ActionDispatchEvent,
  OpenSequenceCompletedEvent,
} from '../contract';

export function createEvents(ctx: PluginContext<void>) {
  return {
    actionHook: ctx.events.source<ActionDispatchEvent>(),
    openSequenceHook: ctx.events.source<OpenSequenceCompletedEvent>(),
    diagnosticHook: ctx.events.source<ActionDiagnostic>(),
    scriptDiagnosticHook: ctx.events.source<ScriptDiagnostic>(),
    scriptErrorHook: ctx.events.source<ScriptExecutionError>(),
  };
}
export type ActionsEvents = ReturnType<typeof createEvents>;
