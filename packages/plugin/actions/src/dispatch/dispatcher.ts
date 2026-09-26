/**
 * The dispatcher: the one serialized queue every tree rides. `execute` runs
 * a resolved tree; `dispatch` resolves a trigger inside the queued operation
 * (submission order is execution order) and fans out through the lifecycle
 * areas. `runAndEmit` is the shared per-tree unit: run, then `onExecuted`.
 */
import type { PluginContext } from '@embedpdf/core';
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
import type { ActionsServices } from '../services';
import { foldSteps } from './fold';
import type { ActionsRunner } from './run';
import { sameRef, type ActionsTriggers } from './triggers';

export function createDispatcher(
  ctx: PluginContext<void>,
  services: Pick<ActionsServices, 'events' | 'policy' | 'queue' | 'catalog'>,
  { run }: ActionsRunner,
  { triggerEnabled, lifecycleAnnotationsOf, planPageSteps }: ActionsTriggers,
  openSequence: Pick<ActionsOpenSequence, 'noteUserActivity' | 'claim' | 'run'>,
  { runDocumentEventOp }: Pick<ActionsDocumentEvents, 'runDocumentEventOp'>,
) {
  const { actionHook, diagnosticHook } = services.events;
  const { decisionFor } = services.policy;
  const { enqueue, budget } = services.queue;
  const { readDocumentActions, DOC_EVENT_TREES } = services.catalog;
  const { noteUserActivity } = openSequence;

  /** Run one tree and announce it: the shared per-tree unit (queued by
   *  `execute`; called inline per step by the queued trigger resolver). */
  const runAndEmit = async (
    tree: PdfActionTree,
    actionContext: ActionContext,
  ): Promise<ActionDispatchResult> => {
    const result = await run(tree, actionContext);
    actionHook.emit({ ctx: actionContext, tree, result });
    return result;
  };

  const execute = (
    tree: PdfActionTree,
    actionContext: ActionContext,
  ): Promise<ActionDispatchResult> => {
    // Before enqueueing: a real user gesture arms the open sequence (its
    // operation then lands ahead of this action in the queue) and resets the
    // cascade budget.
    if (actionContext.origin === 'user') noteUserActivity();
    return enqueue(() => {
      budget.scriptNodes = 0; // one script budget per dispatch
      return runAndEmit(tree, actionContext);
    });
  };

  const canExecute = (tree: PdfActionTree, actionContext: ActionContext): boolean => {
    if (tree.incomplete || !tree.root) return false;
    const decision = decisionFor(tree.root, actionContext.origin);
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

  /** Everything a trigger needs, reads included, inside the queued operation:
   *  submission order is execution order. Never throws. */
  const resolveAndRun = async (trigger: ActionTrigger): Promise<ActionTriggerResult> => {
    const diagnostics: ActionDiagnostic[] = [];
    const diagnose = (diagnostic: ActionDiagnostic): void => {
      diagnostics.push(diagnostic);
      diagnosticHook.emit(diagnostic);
    };
    try {
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
          const { annotations } = await ctx.doc.page(trigger.page).annotations.list();
          const annotation = annotations.find((candidate) => sameRef(candidate.ref, trigger.ref));
          // ISO 32000-2 Table 197: "the A entry, if present, takes precedence
          // over [the /AA U entry]"; a shadowed U tree is silently inert,
          // exactly like an absent one.
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
          const lifecycle = await lifecycleAnnotationsOf(trigger.page);
          const pageActions = ctx.getPage(trigger.page)?.actions;
          const steps = planPageSteps(trigger.event, trigger.page, pageActions, lifecycle);
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
    // A user-origin trigger is user activity (it arms the open sequence and
    // resets the cascade budget), noted before taking the queue slot, so an
    // armed open sequence runs first.
    if (triggerOriginOf(trigger) === 'user') noteUserActivity();
    return enqueue(() => {
      budget.scriptNodes = 0; // one script budget per dispatch
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

  /** The raw tree behind a source, read from the document, with no dispatch
   *  rules applied (the /A-shadows-U rule lives in `resolveAndRun`). */
  const getActionTree = async (source: ActionTreeSource): Promise<PdfActionTree | null> => {
    switch (source.kind) {
      case 'annotation': {
        const { annotations } = await ctx.doc.page(source.page).annotations.list();
        const annotation = annotations.find((candidate) =>
          sameRef(candidate.ref, source.annotation),
        );
        return annotation?.actions?.[source.event ?? 'activate'] ?? null;
      }
      case 'field': {
        const { fields } = await ctx.doc.forms.list();
        const target = source.field;
        const field = fields.find((candidate) =>
          target.kind === 'objectNumber'
            ? candidate.ref.kind === 'objectNumber' &&
              candidate.ref.fieldObjectNumber === target.fieldObjectNumber
            : candidate.name === target.name,
        );
        return field?.actions?.[source.event] ?? null;
      }
      case 'page':
        return ctx.getPage(source.page)?.actions?.[source.event ?? 'open'] ?? null;
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
      // The synchronous twin: the trigger family is enabled. Per-tree truth
      // stays per step in the results; resolution is async and never
      // previewed here.
      canDispatch: (trigger) => triggerEnabled(trigger),
      prepareClose: (): Promise<ActionTriggerResult> =>
        dispatch({ scope: 'document', event: 'will-close' }),
    } satisfies Partial<ActionsCapability>,
  };
}
export type ActionsDispatcher = ReturnType<typeof createDispatcher>;
