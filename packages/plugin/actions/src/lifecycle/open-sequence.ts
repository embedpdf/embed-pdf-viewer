/**
 * The document-open sequence and its latch. The sequence runs the open
 * destination (as a lifecycle GoTo), then the catalog /OpenAction, and only
 * then releases the page-lifecycle barrier, so the first page /O fires after
 * both. It fires once: at the earliest of a UI adapter installing or the
 * first user-origin dispatch (`'auto'`), at bringup (`'headless'`), or never
 * (`'off'`, which still releases the barrier). Unless it is off, it runs
 * before the first verb-shaped document event (/WS, /WP, /WC, …).
 */
import type { Unsubscribe } from '@embedpdf/core';
import type { PdfActionTree } from '@embedpdf/engine-core/runtime';

import type {
  ActionContext,
  ActionDiagnostic,
  ActionsCapability,
  ActionsConfig,
  ActionStepResult,
  ActionTriggerResult,
} from '../contract';
import type { DispatchCore } from '../dispatch/core';
import { foldSteps } from '../dispatch/fold';
import type { ActionsServices } from '../services';
import type { ActionsPageLifecycle } from './page-lifecycle';

export function createOpenSequence(
  services: Pick<ActionsServices, 'events' | 'catalog' | 'queue' | 'ports'>,
  config: ActionsConfig,
  { releaseBarrier, resetCascade }: Pick<ActionsPageLifecycle, 'releaseBarrier' | 'resetCascade'>,
  { runAndEmit }: DispatchCore,
) {
  const { diagnosticHook, openSequenceHook } = services.events;
  const { readDocumentActions } = services.catalog;
  const { enqueue } = services.queue;
  const ports = services.ports.slots;
  let openFired = false;
  let sawUserActivity = false;

  /** The sequence body. Runs inside the queue (through dispatch or the
   *  latch's own enqueue); callers guarantee `openFired` was set. */
  const runOpenSequenceOp = async (): Promise<ActionTriggerResult> => {
    const diagnostics: ActionDiagnostic[] = [];
    const steps: ActionStepResult[] = [];
    const openContext: ActionContext = {
      origin: 'lifecycle',
      source: { kind: 'document' },
      event: { scope: 'document', name: 'open' },
    };
    try {
      const snapshot = await readDocumentActions();
      if (snapshot?.openDestination) {
        // The initial view reuses the whole spine (stage's goto executor,
        // policy included) as a synthesized lifecycle goto.
        const tree: PdfActionTree = {
          root: {
            type: 'goto',
            subtype: 'GoTo',
            destination: snapshot.openDestination,
            next: [],
          },
          incomplete: false,
          warningFlags: 0,
          warnings: [],
        };
        steps.push({
          source: { kind: 'document' },
          tree,
          result: await runAndEmit(tree, openContext),
        });
      }
      if (snapshot?.openAction?.root || snapshot?.openAction?.incomplete) {
        steps.push({
          source: { kind: 'document' },
          tree: snapshot.openAction,
          result: await runAndEmit(snapshot.openAction, openContext),
        });
      }
    } catch (error) {
      const diagnostic: ActionDiagnostic = {
        code: 'trigger-failed',
        message: `open sequence failed: ${error instanceof Error ? error.message : String(error)}`,
      };
      diagnostics.push(diagnostic);
      diagnosticHook.emit(diagnostic);
    } finally {
      // Release after the document steps, on every path; page-open emission
      // enqueues behind this operation (never awaited here: awaiting our own
      // queue would deadlock).
      releaseBarrier(true);
    }
    const result = foldSteps(steps, diagnostics);
    openSequenceHook.emit({ result });
    return result;
  };

  /**
   * The catalog /OpenAction never runs after a /WS, /WP or /WC script: before
   * the first verb-shaped document event, an armed but unfired open sequence
   * runs inline (the caller is already inside the queue; `runOpenSequenceOp`
   * never enqueues). It does not wait for the initial page /O: the guarantee
   * is catalog-level.
   */
  const ensureOpenSequenceBeforeDocEvent = async (): Promise<void> => {
    if (openFired || config.openSequence === 'off') return;
    openFired = true;
    await runOpenSequenceOp();
  };

  const maybeFireOpenSequence = (): void => {
    if (openFired) return;
    if (config.openSequence === 'off') {
      // The sequence never runs, but feeds must not buffer forever.
      openFired = true;
      releaseBarrier(false);
      return;
    }
    if (!ports.uiAdapter && config.openSequence !== 'headless' && !sawUserActivity) return;
    openFired = true;
    void enqueue(() => runOpenSequenceOp());
  };

  const noteUserActivity = (): void => {
    resetCascade();
    if (!sawUserActivity) {
      sawUserActivity = true;
      maybeFireOpenSequence();
    }
  };

  /** Claim the one-shot open for a dispatched document-open trigger: false
   *  when it already fired (the caller reports a replay). */
  const claim = (): boolean => {
    if (openFired) return false;
    openFired = true;
    return true;
  };

  return {
    run: runOpenSequenceOp,
    ensureOpenSequenceBeforeDocEvent,
    noteUserActivity,
    claim,
    /** Arm the latch at bringup: fires immediately for 'headless', releases
     *  the barrier for 'off', waits for an adapter or user activity for 'auto'. */
    arm: maybeFireOpenSequence,
    api: {
      setUiAdapter: (adapter): Unsubscribe => {
        ports.uiAdapter = adapter;
        // An adapter arriving is the usual trigger of the open sequence.
        if (adapter) maybeFireOpenSequence();
        return () => {
          // Identity-safe: never wipe a successor installed after us.
          if (ports.uiAdapter === adapter) ports.uiAdapter = null;
        };
      },
    } satisfies Partial<ActionsCapability>,
  };
}
export type ActionsOpenSequence = ReturnType<typeof createOpenSequence>;
