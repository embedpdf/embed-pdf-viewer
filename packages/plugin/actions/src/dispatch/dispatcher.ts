/**
 * The dispatcher: the one serialized queue every tree rides. `execute` runs
 * a resolved tree; `dispatch` resolves a trigger INSIDE the queued operation
 * (submission order is execution order) and fans out through the lifecycle
 * areas. `runAndEmit` is the shared per-tree unit: run + store bump + event.
 */
import type { PdfActionTree } from '@embedpdf/engine-core/runtime';

import { eventOf, triggerOriginOf } from '../contract';
import type {
  ActionContext,
  ActionDiagnostic,
  ActionDispatchResult,
  ActionOrigin,
  ActionsCapability,
  ActionSource,
  ActionStepResult,
  ActionTreeSource,
  ActionTrigger,
  ActionTriggerEvent,
  ActionTriggerResult,
  PdfNamedAction,
} from '../contract';
import type { ActionsDocumentEvents } from '../lifecycle/document-events';
import type { ActionsOpenSequence } from '../lifecycle/open-sequence';
import type { ActionsContext, ActionsServices } from '../services';
import { foldSteps } from './fold';
import type { ActionsRunner } from './run';
import { sameRef, type ActionsTriggers } from './triggers';

export function createDispatcher(
  ctx: ActionsContext,
  services: Pick<ActionsServices, 'events' | 'policy' | 'queue' | 'catalog'>,
  { run }: ActionsRunner,
  { triggerEnabled, lifecycleTreesFor, planPageSteps }: ActionsTriggers,
  openSequence: Pick<ActionsOpenSequence, 'noteUserActivity' | 'claim' | 'run'>,
  { runDocumentEventOp }: Pick<ActionsDocumentEvents, 'runDocumentEventOp'>,
) {
  const { actionHook, diagnosticHook } = services.events;
  const { decisionFor } = services.policy;
  const { enqueue, budget } = services.queue;
  const { readDocumentActions, DOC_EVENT_TREES } = services.catalog;
  const { noteUserActivity } = openSequence;

  /** run + seq + event — the shared per-tree unit (queued by execute; called
   *  inline per step by the queued trigger resolver). */
  const runAndEmit = async (
    tree: PdfActionTree,
    actionCtx: ActionContext,
  ): Promise<ActionDispatchResult> => {
    const result = await run(tree, actionCtx);
    ctx.dispatch({ type: 'ACTIONS_DISPATCHED' });
    actionHook.emit({ ctx: actionCtx, tree, result });
    return result;
  };

  const execute = (
    tree: PdfActionTree,
    actionCtx: ActionContext,
  ): Promise<ActionDispatchResult> => {
    // BEFORE enqueueing: a real user gesture arms the open-sequence latch
    // (its barrier op then lands ahead of this action in the queue) and
    // resets the cascade budget.
    if (actionCtx.origin === 'user') noteUserActivity();
    return enqueue(() => {
      budget.scriptNodes = 0; // D11: one aggregate per dispatch
      return runAndEmit(tree, actionCtx);
    });
  };

  const canExecute = (tree: PdfActionTree, actionCtx: ActionContext): boolean => {
    if (tree.incomplete || !tree.root) return false;
    const decision = decisionFor(tree.root, actionCtx.origin);
    return decision === 'allow' || decision === 'adapter';
  };

  const runSteps = async (
    steps: Array<{ source: ActionSource; tree: PdfActionTree }>,
    origin: ActionOrigin,
    event: ActionTriggerEvent,
    diagnostics: ActionDiagnostic[],
  ): Promise<ActionTriggerResult> => {
    const results: ActionStepResult[] = [];
    for (const step of steps) {
      const result = await runAndEmit(step.tree, { origin, source: step.source, event });
      results.push({ source: step.source, tree: step.tree, result });
    }
    return foldSteps(results, diagnostics);
  };

  /** Everything a trigger needs — reads included — INSIDE the queued op:
   *  submission order is execution order. Never throws. */
  const resolveAndRun = async (trigger: ActionTrigger): Promise<ActionTriggerResult> => {
    const diagnostics: ActionDiagnostic[] = [];
    const diagnose = (diagnostic: ActionDiagnostic): void => {
      diagnostics.push(diagnostic);
      diagnosticHook.emit(diagnostic);
    };
    try {
      const doc = ctx.doc;
      if (!doc) return { status: 'inert', steps: [], diagnostics };
      if (!triggerEnabled(trigger)) {
        diagnose({
          code: 'trigger-disabled',
          message: `${trigger.scope}: trigger family disabled by config`,
        });
        return { status: 'inert', steps: [], diagnostics };
      }
      const origin = triggerOriginOf(trigger);
      switch (trigger.scope) {
        case 'activate':
        case 'annotation': {
          const event = trigger.scope === 'activate' ? 'activate' : trigger.event;
          const { annotations } = await doc.page(trigger.page).annotations.list();
          const annotation = annotations.find((candidate) => sameRef(candidate.ref, trigger.ref));
          // ISO Table 197 (verified 2026-09-02): "the A entry, if present,
          // takes precedence over [the /AA U entry]" — a shadowed U tree is
          // silently inert, exactly like an absent one.
          if (event === 'mouseUp' && annotation?.actions?.activate) {
            return { status: 'inert', steps: [], diagnostics };
          }
          const tree = annotation?.actions?.[event];
          if (!tree?.root && !tree?.incomplete) return { status: 'inert', steps: [], diagnostics };
          const source: ActionSource = trigger.source ?? {
            kind: 'annotation',
            annotation: trigger.ref,
            page: trigger.page,
          };
          return await runSteps([{ source, tree }], origin, eventOf(trigger), diagnostics);
        }
        case 'page': {
          const pon = trigger.page.pageObjectNumber;
          const layout = ctx.document()?.pages.find((page) => page.ref.pageObjectNumber === pon);
          const lifecycle = await lifecycleTreesFor(pon);
          const steps = planPageSteps(trigger.event, pon, layout?.actions, lifecycle);
          return await runSteps(steps, origin, eventOf(trigger), diagnostics);
        }
        case 'document': {
          if (trigger.event !== 'open') {
            return await runDocumentEventOp(trigger.event, diagnostics, diagnose);
          }
          if (!openSequence.claim()) {
            diagnose({
              code: 'open-sequence-replayed',
              message: 'document open sequence already fired for this document',
            });
            return { status: 'inert', steps: [], diagnostics };
          }
          return await openSequence.run();
        }
      }
    } catch (error) {
      diagnose({
        code: 'trigger-failed',
        message: `trigger resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { status: 'refused', steps: [], diagnostics };
    }
  };

  const dispatch = (trigger: ActionTrigger): Promise<ActionTriggerResult> => {
    // A user-origin trigger is user activity (latch + cascade reset) — noted
    // BEFORE taking the queue slot, so an armed open sequence runs first.
    if (triggerOriginOf(trigger) === 'user') noteUserActivity();
    return enqueue(() => {
      budget.scriptNodes = 0; // D11: one aggregate per dispatch
      return resolveAndRun(trigger);
    });
  };

  const executeNamed = (
    name: PdfNamedAction,
    context?: Partial<ActionContext>,
  ): Promise<ActionDispatchResult> =>
    execute(
      {
        root: { type: 'named', subtype: 'Named', name, next: [] },
        incomplete: false,
        warningFlags: 0,
        warnings: [],
      },
      { origin: 'user', source: { kind: 'api' }, event: { scope: 'activate' }, ...context },
    );

  /** The raw tree behind a source, read from the document — no dispatch
   *  rules applied (the /A-shadows-U rule lives in `resolveAndRun`). */
  const getActionTree = async (source: ActionTreeSource): Promise<PdfActionTree | null> => {
    const doc = ctx.doc;
    if (!doc) return null;
    switch (source.kind) {
      case 'annotation': {
        const { annotations } = await doc.page(source.page).annotations.list();
        const annotation = annotations.find((candidate) =>
          sameRef(candidate.ref, source.annotation),
        );
        return annotation?.actions?.[source.event ?? 'activate'] ?? null;
      }
      case 'field': {
        const { fields } = await doc.forms.list();
        const target = source.field;
        const field = fields.find((candidate) =>
          target.kind === 'objectNumber'
            ? candidate.ref.kind === 'objectNumber' &&
              candidate.ref.fieldObjectNumber === target.fieldObjectNumber
            : candidate.name === target.name,
        );
        return field?.actions?.[source.event] ?? null;
      }
      case 'page': {
        const pon = source.page.pageObjectNumber;
        const layout = ctx.document()?.pages.find((page) => page.ref.pageObjectNumber === pon);
        return layout?.actions?.[source.event ?? 'open'] ?? null;
      }
      case 'document': {
        const snapshot = await readDocumentActions();
        if (!snapshot) return null;
        const event = source.event ?? 'open';
        return (event === 'open' ? snapshot.openAction : snapshot[DOC_EVENT_TREES[event]]) ?? null;
      }
    }
  };

  return {
    runAndEmit,
    dispatch,
    api: {
      execute,
      canExecute,
      executeNamed,
      getActionTree,
      dispatch,
      // Sync twin: family enabled ∧ document present (per-tree truth stays
      // per-step in results — resolution is async and never previewed here).
      canDispatch: (trigger) => triggerEnabled(trigger) && ctx.doc !== null,
      prepareClose: (): Promise<ActionTriggerResult> =>
        dispatch({ scope: 'document', event: 'will-close' }),
    } satisfies Partial<ActionsCapability>,
  };
}
export type ActionsDispatcher = ReturnType<typeof createDispatcher>;
