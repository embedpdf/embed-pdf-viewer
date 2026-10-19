/** The plugin's events, disposed with it, and the one way a diagnostic is reported. */
import type { PdfActionType } from '@embedpdf/engine-core/runtime';

import type {
  ActionDiagnostic,
  ActionDiagnosticReportedEvent,
  ActionExecutedEvent,
  ActionSource,
  OpenSequenceCompletedEvent,
  ScriptDiagnosticReportedEvent,
  ScriptFailedEvent,
} from '../contract';
import type { ActionsContext } from './context';

/** Which action a diagnostic is about, and what started it, when one is concerned. */
export interface DiagnosticPlace {
  readonly action?: PdfActionType | null;
  readonly source?: ActionSource | null;
}

export function createEvents(ctx: ActionsContext) {
  const executed = ctx.events.source<ActionExecutedEvent>();
  const diagnosticReported = ctx.events.source<ActionDiagnosticReportedEvent>();
  return {
    executed,
    diagnosticReported,
    scriptDiagnosticReported: ctx.events.source<ScriptDiagnosticReportedEvent>(),
    scriptFailed: ctx.events.source<ScriptFailedEvent>(),
    openSequenceCompleted: ctx.events.source<OpenSequenceCompletedEvent>(),
    /** Fire `onDiagnosticReported` with the action and source it concerns (`null` for none). */
    reportDiagnostic(diagnostic: ActionDiagnostic, place: DiagnosticPlace = {}): void {
      diagnosticReported.emit({
        code: diagnostic.code,
        action: place.action ?? null,
        source: place.source ?? null,
      });
    },
  };
}
export type ActionsEvents = ReturnType<typeof createEvents>;
