/**
 * The dispatcher: the one serialized queue every tree rides. `execute` runs
 * a resolved tree; `dispatch` resolves a trigger inside the queued operation
 * (submission order is execution order) and fans out through the lifecycle
 * areas. `runAndEmit` is the shared per-tree unit: run, then `onExecuted`.
 *
 * A caller's signal skips an operation that hasn't started, stops a
 * trigger's reads, and stops a tree before its next node. `execute` then
 * rejects `operation-cancelled`; `dispatch` never rejects, so it resolves
 * `cancelled`.
 */
import { isPluginError, PluginError, type OperationOptions } from '@embedpdf/core';
import { annotationKey, type PdfActionTree } from '@embedpdf/engine-core/runtime';

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
import { readAnnotation } from '../services/annotation-rows';
import { foldSteps } from './fold';
import type { ActionsRunner } from './run';
import type { ActionsTriggers } from './triggers';

/** The source a trigger reports for: what its diagnostics carry before a tree is found. */
const sourceOfTrigger = (trigger: ActionTrigger): ActionSource => {
  switch (trigger.scope) {
    case 'activate':
    case 'annotation':
      return trigger.source ?? { kind: 'annotation', annotation: trigger.ref, page: trigger.page };
    case 'page':
      return { kind: 'page', page: trigger.page };
    case 'document':
      return { kind: 'document' };
  }
};

const cancelled = (operation: string, signal: AbortSignal | undefined) =>
  new PluginError('operation-cancelled', 'actions', `${operation} was cancelled`, {
    cause: signal?.reason,
  });

export function createDispatcher(
  ctx: ActionsContext,
  services: Pick<ActionsServices, 'events' | 'policy' | 'queue' | 'catalog' | 'authority'>,
  { run }: ActionsRunner,
  { triggerEnabled, lifecycleAnnotationsOf, planPageSteps }: ActionsTriggers,
  openSequence: Pick<ActionsOpenSequence, 'noteUserActivity' | 'claim' | 'run'>,
  { runDocumentEventOp }: Pick<ActionsDocumentEvents, 'runDocumentEventOp'>,
) {
  const { executed, reportDiagnostic } = services.events;
  const { decisionFor } = services.policy;
  const { allowsPrint } = services.authority;
  const { enqueue, budget } = services.queue;
  const { readDocumentActions, DOC_EVENT_TREES } = services.catalog;
  const { noteUserActivity } = openSequence;

  /** Run one tree and announce it: the shared per-tree unit (queued by
   *  `execute`; called inline per step by the queued trigger resolver). */
  const runAndEmit = async (
    tree: PdfActionTree,
    actionContext: ActionContext,
    signal?: AbortSignal,
  ): Promise<ActionDispatchResult> => {
    const result = await run(tree, actionContext, signal);
    executed.emit({ tree, result, source: actionContext.source });
    return result;
  };

  const execute = (
    tree: PdfActionTree,
    actionContext: ActionContext,
    options?: OperationOptions,
  ): Promise<ActionDispatchResult> => {
    const signal = options?.signal;
    // Before enqueueing: a real user gesture arms the open sequence (its
    // operation then lands ahead of this action in the queue) and resets the
    // cascade budget.
    if (actionContext.origin === 'user') noteUserActivity();
    return enqueue(async () => {
      budget.scriptNodes = 0; // one script budget per dispatch
      const result = await runAndEmit(tree, actionContext, signal);
      if (result.status === 'cancelled') throw cancelled('actions.execute', signal);
      return result;
    }, options);
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
    signal: AbortSignal | undefined,
  ): Promise<ActionTriggerResult> => {
    const results: ActionStepResult[] = [];
    for (const step of steps) {
      if (signal?.aborted) break;
      const result = await runAndEmit(step.tree, { origin, source: step.source, event }, signal);
      results.push({ source: step.source, tree: step.tree, result });
    }
    if (signal?.aborted) return { status: 'cancelled', steps: results, diagnostics };
    return foldSteps(results, diagnostics);
  };

  /** Everything a trigger needs, reads included, inside the queued operation:
   *  submission order is execution order. Never throws. */
  const resolveAndRun = async (
    trigger: ActionTrigger,
    signal: AbortSignal | undefined,
  ): Promise<ActionTriggerResult> => {
    const diagnostics: ActionDiagnostic[] = [];
    const diagnose = (diagnostic: ActionDiagnostic): void => {
      diagnostics.push(diagnostic);
      reportDiagnostic(diagnostic, { source: sourceOfTrigger(trigger) });
    };
    /** A read the caller's signal can stop. */
    const read = <T>(task: Promise<T>): Promise<T> => ctx.cancellable(signal, task);
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
          const annotation = await readAnnotation(ctx, trigger.ref, read);
          // ISO 32000-2 Table 197: "the A entry, if present, takes precedence
          // over [the /AA U entry]"; a shadowed U tree is silently inert,
          // exactly like an absent one.
          if (event === 'mouseUp' && annotation?.actions?.activate) {
            return { status: 'inert', steps: [], diagnostics };
          }
          const tree = annotation?.actions?.[event];
          if (!tree?.root && !tree?.incomplete) return { status: 'inert', steps: [], diagnostics };
          const source = sourceOfTrigger(trigger);
          return await runSteps([{ source, tree }], origin, eventOf(trigger), diagnostics, signal);
        }
        case 'page': {
          // A shared read other triggers may wait on too: never aborted, only not awaited further.
          const lifecycle = await lifecycleAnnotationsOf(trigger.page);
          const pageActions = ctx.getPage(trigger.page)?.actions;
          const steps = planPageSteps(trigger.event, trigger.page, pageActions, lifecycle);
          return await runSteps(steps, origin, eventOf(trigger), diagnostics, signal);
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
      if (isPluginError(error, 'operation-cancelled') && signal?.aborted) {
        return { status: 'cancelled', steps: [], diagnostics };
      }
      diagnose({
        code: 'trigger-failed',
        message: `trigger resolution failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return { status: 'refused', steps: [], diagnostics };
    }
  };

  const dispatch = (
    trigger: ActionTrigger,
    options?: OperationOptions,
  ): Promise<ActionTriggerResult> => {
    const signal = options?.signal;
    // A user-origin trigger is user activity (it arms the open sequence and
    // resets the cascade budget), noted before taking the queue slot, so an
    // armed open sequence runs first.
    if (triggerOriginOf(trigger) === 'user') noteUserActivity();
    return enqueue(() => {
      budget.scriptNodes = 0; // one script budget per dispatch
      return resolveAndRun(trigger, signal);
    }, options).catch(
      // Only a signal that fired while the trigger waited for its turn gets
      // here: resolveAndRun itself never throws.
      (): ActionTriggerResult => ({ status: 'cancelled', steps: [], diagnostics: [] }),
    );
  };

  /** The tree `executeNamed` runs, and its context: a click from your code unless `context` says otherwise. */
  const namedTree = (name: PdfNamedAction): PdfActionTree => ({
    root: { type: 'named', subtype: 'Named', name, next: [] },
    incomplete: false,
    warningFlags: 0,
    warnings: [],
  });
  const namedContext = (context?: Partial<ActionContext>): ActionContext => ({
    origin: 'user',
    source: { kind: 'api' },
    event: { scope: 'activate' },
    ...context,
  });

  const executeNamed = (
    name: PdfNamedAction,
    context?: Partial<ActionContext>,
    options?: OperationOptions,
  ): Promise<ActionDispatchResult> => execute(namedTree(name), namedContext(context), options);

  const canExecuteNamed = (name: PdfNamedAction, context?: Partial<ActionContext>): boolean =>
    canExecute(namedTree(name), namedContext(context)) && (name !== 'Print' || allowsPrint());

  /** The raw tree behind a source, read from the document, with no dispatch
   *  rules applied (the /A-shadows-U rule lives in `resolveAndRun`). */
  const readActionTree = async (source: ActionTreeSource): Promise<PdfActionTree | null> => {
    switch (source.kind) {
      case 'annotation': {
        const annotation = await readAnnotation(ctx, source.annotation);
        const tree = annotation?.actions?.[source.event ?? 'activate'];
        return tree ?? null;
      }
      case 'field': {
        const { fields } = await ctx.doc.forms.list();
        const target = source.field;
        const field = fields.find((candidate) =>
          target.kind === 'objectNumber'
            ? candidate.ref.kind === 'objectNumber' &&
              candidate.ref.objectNumber === target.objectNumber
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
      canExecuteNamed,
      getActionTree: (source, options) => ctx.cancellable(options?.signal, readActionTree(source)),
      dispatch,
      // The synchronous twin: the trigger family is enabled. Per-tree truth
      // stays per step in the results; resolution is async and never
      // previewed here.
      canDispatch: (trigger) => triggerEnabled(trigger),
      prepareClose: (options): Promise<ActionTriggerResult> =>
        dispatch({ scope: 'document', event: 'will-close' }, options),
    } satisfies Partial<ActionsCapability>,
  };
}
export type ActionsDispatcher = ReturnType<typeof createDispatcher>;
