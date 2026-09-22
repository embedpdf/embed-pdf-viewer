/**
 * The verb-shaped document events (/WC, /WS, /DS, /WP, /DP) and the print
 * door: one catalog lifecycle tree per event, run inside the current queue
 * operation and never throwing (a broken script must not cancel the user's
 * save or print), and the adapter print wrapped /WP → print → /DP under the
 * print latch.
 */
import type {
  ActionContext,
  ActionDiagnostic,
  ActionNodeStatus,
  ActionOrigin,
  ActionsCapability,
  ActionsConfig,
  ActionStepResult,
  ActionTriggerResult,
  DocumentTriggerEvent,
} from '../contract';
import type { DispatchCore } from '../dispatch/core';
import { foldSteps } from '../dispatch/fold';
import type { ActionsServices } from '../services';
import type { ActionsOpenSequence } from './open-sequence';

export function createDocumentEvents(
  services: Pick<
    ActionsServices,
    'events' | 'catalog' | 'queue' | 'ports' | 'authority' | 'printLatch'
  >,
  config: ActionsConfig,
  {
    ensureOpenSequenceBeforeDocEvent,
  }: Pick<ActionsOpenSequence, 'ensureOpenSequenceBeforeDocEvent'>,
  { runAndEmit }: DispatchCore,
) {
  const { diagnosticHook } = services.events;
  const { readDocumentActions, DOC_EVENT_TREES } = services.catalog;
  const { enqueue, budget } = services.queue;
  const ports = services.ports.slots;
  const { allowsPrint } = services.authority;
  const printLatch = services.printLatch;

  /**
   * Run one catalog lifecycle tree inside the current queue operation, shared
   * by the dispatch path, `runDocumentVerb` and the print wrapper. Never
   * throws: a read or resolution failure degrades to a diagnostic, because a
   * broken script must not cancel the user's save or print.
   */
  const runDocEventTreeSafe = async (
    event: Exclude<DocumentTriggerEvent, 'open'>,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionStepResult | null> => {
    if (config.triggers?.document === false) return null;
    try {
      await ensureOpenSequenceBeforeDocEvent();
      const snapshot = await readDocumentActions();
      const tree = snapshot?.[DOC_EVENT_TREES[event]];
      if (!tree?.root && !tree?.incomplete) return null;
      const actionContext: ActionContext = {
        origin: 'lifecycle',
        source: { kind: 'document' },
        event: { scope: 'document', name: event },
      };
      return { source: { kind: 'document' }, tree, result: await runAndEmit(tree, actionContext) };
    } catch (error) {
      diagnose({
        code: 'trigger-failed',
        message: `${event}: ${error instanceof Error ? error.message : String(error)}`,
      });
      return null;
    }
  };

  /** The dispatch-path body for a verb-shaped document event. */
  const runDocumentEventOp = async (
    event: Exclude<DocumentTriggerEvent, 'open'>,
    diagnostics: ActionDiagnostic[],
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<ActionTriggerResult> => {
    const step = await runDocEventTreeSafe(event, diagnose);
    return foldSteps(step ? [step] : [], diagnostics);
  };

  /**
   * Both adapter print paths (the Named Print verb, and script `doc.print()`
   * effects from the actions plane) go through here: /WP →
   * `ports.uiAdapter.print` exactly once → /DP, with the latch reset in
   * `finally`. While the latch is held (including `runDocumentVerb('print')`'s
   * body) a nested request is suppressed with `reentrant-print`. An adapter
   * throw skips /DP (the latch still resets). /DP fires when the adapter call
   * returns, since a browser cannot observe dialog completion.
   */
  const firePrintThroughAdapter = async (
    uiContext: { origin: ActionOrigin; phase: 'boot' | 'user' } | undefined,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
    if (printLatch.active) {
      diagnose({
        code: 'reentrant-print',
        message:
          'print request during a document print event — suppressed (one dialog per request)',
      });
      return { status: 'blocked', detail: 'reentrant print suppressed' };
    }
    if (!allowsPrint()) {
      diagnose({ code: 'blocked', message: 'print: doc.print is not allowed' });
      return { status: 'blocked', detail: 'doc.print is not allowed' };
    }
    if (!ports.uiAdapter) {
      diagnose({ code: 'no-adapter', message: 'print: no UI adapter installed' });
      return { status: 'no-executor', detail: 'no UI adapter installed' };
    }
    printLatch.active = true;
    try {
      await runDocEventTreeSafe('will-print', diagnose);
      const adapter = ports.uiAdapter;
      if (!adapter) return { status: 'no-executor', detail: 'UI adapter uninstalled mid-print' };
      if (uiContext) adapter.print(uiContext);
      else adapter.print();
      await runDocEventTreeSafe('did-print', diagnose);
      return { status: 'executed' };
    } finally {
      printLatch.active = false;
    }
  };

  return {
    runDocumentEventOp,
    firePrintThroughAdapter,
    api: {
      runDocumentVerb: <T>(verb: 'save' | 'print', operation: () => Promise<T> | T): Promise<T> =>
        enqueue(async () => {
          budget.scriptNodes = 0; // one script budget for the whole verb operation
          const diagnose = (diagnostic: ActionDiagnostic): void => diagnosticHook.emit(diagnostic);
          const before = verb === 'save' ? ('will-save' as const) : ('will-print' as const);
          const after = verb === 'save' ? ('did-save' as const) : ('did-print' as const);
          const body = async (): Promise<T> => {
            // A before-event failure never cancels the user's verb;
            // runDocEventTreeSafe already degrades to diagnostics.
            await runDocEventTreeSafe(before, diagnose);
            // `operation()` throwing skips the after-event and rethrows: no
            // /DS for a failed save.
            const value = await operation();
            await runDocEventTreeSafe(after, diagnose);
            return value;
          };
          if (verb !== 'print') return body();
          // The print verb holds the print latch for its whole body, so a /WP
          // or /DP script calling doc.print() is suppressed instead of
          // opening a second dialog.
          printLatch.active = true;
          try {
            return await body();
          } finally {
            printLatch.active = false;
          }
        }),
    } satisfies Partial<ActionsCapability>,
  };
}
export type ActionsDocumentEvents = ReturnType<typeof createDocumentEvents>;
