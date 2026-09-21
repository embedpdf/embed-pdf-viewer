/**
 * The §3.9 document-open sequence and its latch: fires once at the earliest
 * of a UI adapter installing or the first user-origin dispatch (`'auto'`),
 * at bringup (`'headless'`), or never (`'off'` — the page barrier still
 * releases). D1's open-ordering law: the sequence runs before the first
 * verb-shaped document event.
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
import type { ActionsContext, ActionsServices } from '../services';
import type { ActionsPageLifecycle } from './page-lifecycle';

export function createOpenSequence(
  ctx: ActionsContext,
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

  /** The §3.9 sequence body — runs INSIDE the queue (via dispatch or the
   *  latch's own enqueue; callers guarantee openFired was set). */
  const runOpenSequenceOp = async (): Promise<ActionTriggerResult> => {
    const diagnostics: ActionDiagnostic[] = [];
    const steps: ActionStepResult[] = [];
    const lifecycleCtx: ActionContext = {
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
          result: await runAndEmit(tree, lifecycleCtx),
        });
      }
      if (snapshot?.openAction?.root || snapshot?.openAction?.incomplete) {
        steps.push({
          source: { kind: 'document' },
          tree: snapshot.openAction,
          result: await runAndEmit(snapshot.openAction, lifecycleCtx),
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
      // Release AFTER the document steps, on EVERY path; page-open emission
      // enqueues BEHIND this op (never awaited here — awaiting our own
      // queue self-deadlocks).
      releaseBarrier(true);
    }
    const result = foldSteps(steps, diagnostics);
    openSequenceHook.emit({ result });
    return result;
  };

  /**
   * D1's open-ordering law: catalog `OpenAction` may never run AFTER a
   * WillSave/WillPrint/WillClose script. Before the first verb-shaped
   * document event, an armed-but-unfired open sequence runs inline (we are
   * already inside the queue; `runOpenSequenceOp` never enqueues). It does
   * NOT wait for the initial page `/O` — the guarantee is catalog-level.
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
        // An adapter arriving is the §3.9 latch's usual release.
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
