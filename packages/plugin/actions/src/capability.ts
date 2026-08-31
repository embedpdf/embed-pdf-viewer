import {
  createEventHook,
  createSerialQueue,
  DocumentsToken,
  type PluginContext,
  type Unsubscribe,
} from '@embedpdf/core';
import type {
  AnnotationRef,
  PdfActionNode,
  PdfActionTree,
  PdfActionType,
} from '@embedpdf/engine-core/runtime';

import type {
  ActionContext,
  ActionDiagnostic,
  ActionDispatchResult,
  ActionExecutor,
  ActionNodeResult,
  ActionNodeStatus,
  ActionOrigin,
  ActionPolicy,
  ActionPolicyDecision,
  ActionPolicyRow,
  ActionsAction,
  ActionsCapability,
  ActionsHostCapability,
  ActionsPluginConfig,
  ActionsState,
  ActionTrigger,
  ActionUiAdapter,
  SessionEffectSink,
  TriggerSource,
} from './types';

const ALLOW_ALL: ActionPolicyRow = { user: 'allow', hover: 'allow', lifecycle: 'allow' };

const DEFAULT_POLICY: ActionPolicy = {
  goto: ALLOW_ALL,
  named: ALLOW_ALL,
  hide: ALLOW_ALL,
  'reset-form': ALLOW_ALL,
  javascript: ALLOW_ALL,
  // No auto-opened tabs: only a real user activation reaches the adapter.
  uri: { user: 'adapter', hover: 'report', lifecycle: 'report' },
  // The Named Print verb: adapter on user gestures, blocked otherwise.
  print: { user: 'adapter', hover: 'block', lifecycle: 'block' },
};

/** Never executable, not configurable — diagnostics only. */
const NEVER_TYPES: ReadonlySet<PdfActionType> = new Set([
  'launch',
  'goto-remote',
  'goto-embedded',
  'sound',
  'movie',
  'import-data',
]);

/** Recognized types with no Phase-1 interpreter. */
const UNSUPPORTED_TYPES: ReadonlySet<PdfActionType> = new Set([
  'rendition',
  'thread',
  'set-ocg-state',
  'transition',
  'goto-3d-view',
  'unknown',
]);

/** Document-lifetime node types: engine mutations, committed in walk order. */
const DOCUMENT_TYPES: ReadonlySet<PdfActionType> = new Set(['reset-form', 'javascript']);

const sameRef = (left: AnnotationRef, right: AnnotationRef): boolean => {
  if (left.kind === 'objectNumber' && right.kind === 'objectNumber') {
    return left.annotObjectNumber === right.annotObjectNumber;
  }
  if (left.kind === 'nm' && right.kind === 'nm') {
    return left.pageObjectNumber === right.pageObjectNumber && left.nm === right.nm;
  }
  if (left.kind === 'index' && right.kind === 'index') {
    return left.pageObjectNumber === right.pageObjectNumber && left.index === right.index;
  }
  return false;
};

const isPrintVerb = (node: PdfActionNode): boolean =>
  node.type === 'named' && node.name === 'Print';

export function createActionsCapability(
  ctx: PluginContext<ActionsState, ActionsAction>,
  config: ActionsPluginConfig = {},
): ActionsHostCapability {
  const policy: ActionPolicy = { ...DEFAULT_POLICY, ...config.policy };
  const enqueue = createSerialQueue();
  const executors = new Map<PdfActionType, ActionExecutor>();
  const triggerSources: TriggerSource[] = [];
  let sessionSink: SessionEffectSink | null = null;
  let uiAdapter: ActionUiAdapter | null = null;

  const actionHook = createEventHook<import('./types').ActionDispatchEvent>((error) =>
    globalThis.console?.error('[actions] onAction observer failed:', error),
  );
  const diagnosticHook = createEventHook<ActionDiagnostic>((error) =>
    globalThis.console?.error('[actions] onDiagnostic observer failed:', error),
  );
  ctx.cleanup(() => {
    actionHook.dispose();
    diagnosticHook.dispose();
  });

  /** Policy lookup — `null` means "recognized, no interpreter" (inert). */
  const decisionFor = (
    node: PdfActionNode,
    origin: ActionOrigin,
  ): ActionPolicyDecision | 'never' | 'unsupported' => {
    if (node.type === 'submit-form') return 'block';
    if (NEVER_TYPES.has(node.type)) return 'never';
    if (UNSUPPORTED_TYPES.has(node.type)) return 'unsupported';
    if (isPrintVerb(node)) return policy.print[origin];
    const row = policy[node.type as keyof ActionPolicy] as ActionPolicyRow | undefined;
    return row ? row[origin] : 'unsupported';
  };

  const allowsPrint = (): boolean =>
    ctx.tryGet(DocumentsToken)?.allows('doc.print', ctx.documentId ?? undefined) ?? true;

  async function run(tree: PdfActionTree, actionCtx: ActionContext): Promise<ActionDispatchResult> {
    const diagnostics: ActionDiagnostic[] = [];
    const diagnose = (diagnostic: ActionDiagnostic): void => {
      diagnostics.push(diagnostic);
      diagnosticHook.emit(diagnostic);
    };

    // The law: never execute an incomplete tree — not even its root.
    if (tree.incomplete) {
      diagnose({ code: 'incomplete-tree', message: 'refused: the action tree is incomplete' });
      return { status: 'refused', nodes: [], diagnostics };
    }
    if (!tree.root) return { status: 'inert', nodes: [], diagnostics };

    const nodes: ActionNodeResult[] = [];
    // Navigation and external effects are DEFERRED thunks — fired only after
    // every document-lifetime node succeeded, in node order, so navigation
    // can never yank the user away from a failed write.
    const deferred: Array<{ result: ActionNodeResult; fire: () => Promise<void> | void }> = [];
    let documentFailed = false;

    const settle = (
      result: ActionNodeResult,
      outcome: import('./types').ActionExecutorResult,
    ): void => {
      if (outcome.status === 'executed') result.status = 'executed';
      else if (outcome.status === 'inert') {
        result.status = 'inert';
        result.detail = outcome.reason;
        diagnose({ code: 'executor-inert', message: `${result.type}: ${outcome.reason}` });
      } else {
        result.status = 'failed';
        result.detail = outcome.error;
        diagnose({ code: 'executor-failed', message: `${result.type}: ${outcome.error}` });
      }
    };

    const interpretHide = async (
      node: Extract<PdfActionNode, { type: 'hide' }>,
    ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
      if (!sessionSink) {
        diagnose({
          code: 'no-session-sink',
          message: 'hide: no session sink registered (annotation plugin absent)',
        });
        return { status: 'no-executor' };
      }
      const objectNumbers: number[] = [];
      const names: string[] = [];
      for (const target of node.targets) {
        if (target.kind === 'objectNumber') objectNumbers.push(target.objectNumber);
        else names.push(target.name);
      }
      if (names.length) {
        // Name targets are field FQNs → the field's widget annotations,
        // resolved against the ENGINE handle (doc.forms is a service, not a
        // plugin dependency).
        const doc = ctx.doc;
        if (doc) {
          const snapshot = await doc.forms.list();
          for (const name of names) {
            const field = snapshot.fields.find((candidate) => candidate.name === name);
            if (!field) {
              diagnose({
                code: 'unresolved-target',
                message: `hide: no field named '${name}'`,
              });
              continue;
            }
            for (const widget of field.widgets) {
              if (widget.annotObjectNumber > 0) objectNumbers.push(widget.annotObjectNumber);
            }
          }
        }
      }
      const entries = objectNumbers.map((annotObjectNumber) => ({
        annotObjectNumber,
        hidden: node.hide,
      }));
      const applied = entries.length ? sessionSink.applyVisibility(entries) : 0;
      if (applied < entries.length) {
        diagnose({
          code: 'unresolved-target',
          message: `hide: ${entries.length - applied} target annotation(s) not loaded`,
        });
      }
      return { status: 'executed' };
    };

    const interpret = async (node: PdfActionNode, path: number[]): Promise<void> => {
      const result: ActionNodeResult = { path, type: node.type, status: 'blocked' };
      nodes.push(result);
      const decision = decisionFor(node, actionCtx.origin);

      if (decision === 'never' || decision === 'block' || decision === 'report') {
        result.status = 'blocked';
        diagnose({
          code: 'blocked',
          message: `${node.type}: ${decision === 'never' ? 'never executable' : `policy '${decision}' for origin '${actionCtx.origin}'`}`,
        });
        return;
      }
      if (decision === 'unsupported') {
        result.status = 'no-executor';
        return;
      }

      if (node.type === 'hide') {
        const outcome = await interpretHide(node);
        result.status = outcome.status;
        if (outcome.detail) result.detail = outcome.detail;
        return;
      }

      if (DOCUMENT_TYPES.has(node.type)) {
        if (documentFailed) {
          result.status = 'skipped';
          return;
        }
        const executor = executors.get(node.type);
        if (!executor) {
          result.status = node.type === 'javascript' ? 'inert' : 'no-executor';
          diagnose({
            code: 'no-executor',
            message: `${node.type}: no executor registered${node.type === 'javascript' ? ' (scripting unavailable)' : ''}`,
          });
          return;
        }
        try {
          settle(result, await executor(node, actionCtx));
        } catch (error) {
          settle(result, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (result.status === 'failed') documentFailed = true;
        return;
      }

      if (isPrintVerb(node) || node.type === 'uri') {
        // External: adapter-routed, deferred.
        result.status = 'skipped'; // provisional until fired
        deferred.push({
          result,
          fire: () => {
            if (isPrintVerb(node) && !allowsPrint()) {
              result.status = 'blocked';
              diagnose({ code: 'blocked', message: 'print: doc.print is not allowed' });
              return;
            }
            if (!uiAdapter) {
              result.status = 'no-executor';
              diagnose({ code: 'no-adapter', message: `${node.type}: no UI adapter installed` });
              return;
            }
            if (node.type === 'uri') {
              uiAdapter.openUri(node.uri, { isMap: node.isMap, origin: actionCtx.origin });
            } else {
              uiAdapter.print();
            }
            result.status = 'executed';
          },
        });
        return;
      }

      // goto + named page verbs: navigation, executor-routed, deferred.
      result.status = 'skipped'; // provisional until fired
      deferred.push({
        result,
        fire: async () => {
          const executor = executors.get(node.type);
          if (!executor) {
            result.status = 'no-executor';
            diagnose({ code: 'no-executor', message: `${node.type}: no executor registered` });
            return;
          }
          try {
            settle(result, await executor(node, actionCtx));
          } catch (error) {
            settle(result, {
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            });
          }
        },
      });
    };

    const walk = async (node: PdfActionNode, path: number[]): Promise<void> => {
      await interpret(node, path);
      for (let index = 0; index < node.next.length; index++) {
        await walk(node.next[index], [...path, index]);
      }
    };
    await walk(tree.root, []);

    if (!documentFailed) {
      for (const entry of deferred) await entry.fire();
    }

    const anyExecuted = nodes.some((node) => node.status === 'executed');
    const anyFailedOrSkipped = nodes.some(
      (node) => node.status === 'failed' || node.status === 'skipped',
    );
    const status: ActionDispatchResult['status'] = anyExecuted
      ? anyFailedOrSkipped
        ? 'partial'
        : 'executed'
      : anyFailedOrSkipped
        ? 'partial'
        : 'inert';
    return { status, nodes, diagnostics };
  }

  const execute = (tree: PdfActionTree, actionCtx: ActionContext): Promise<ActionDispatchResult> =>
    enqueue(async () => {
      const result = await run(tree, actionCtx);
      ctx.dispatch({ type: 'ACTIONS_DISPATCHED' });
      actionHook.emit({ ctx: actionCtx, tree, result });
      return result;
    });

  const canExecute = (tree: PdfActionTree, actionCtx: ActionContext): boolean => {
    if (tree.incomplete || !tree.root) return false;
    const decision = decisionFor(tree.root, actionCtx.origin);
    return decision === 'allow' || decision === 'adapter';
  };

  const dispatch = async (trigger: ActionTrigger): Promise<ActionDispatchResult> => {
    const doc = ctx.doc;
    if (!doc) return { status: 'inert', nodes: [], diagnostics: [] };
    const { annotations } = await doc.page(trigger.pon).annotations.list();
    const annotation = annotations.find((candidate) => sameRef(candidate.ref, trigger.ref));
    const tree = annotation?.actions?.activate;
    if (!tree) return { status: 'inert', nodes: [], diagnostics: [] };
    return execute(tree, {
      origin: 'user',
      source: { kind: 'link', annotation: trigger.ref, pon: trigger.pon },
    });
  };

  return {
    execute,
    canExecute,
    dispatch,
    canDispatch: (trigger) => trigger.scope === 'activate' && ctx.doc !== null,
    setUiAdapter: (adapter): Unsubscribe => {
      uiAdapter = adapter;
      return () => {
        // Identity-safe: never wipe a successor installed after us.
        if (uiAdapter === adapter) uiAdapter = null;
      };
    },
    onAction: actionHook.on,
    onDiagnostic: diagnosticHook.on,

    registerExecutor: (type, executor): Unsubscribe => {
      if (executors.has(type)) {
        diagnosticHook.emit({
          code: 'duplicate-executor',
          message: `executor for '${type}' replaced (last-wins)`,
        });
      }
      executors.set(type, executor);
      return () => {
        if (executors.get(type) === executor) executors.delete(type);
      };
    },
    registerSessionSink: (sink): Unsubscribe => {
      sessionSink = sink;
      return () => {
        if (sessionSink === sink) sessionSink = null;
      };
    },
    registerTriggerSource: (source): Unsubscribe => {
      triggerSources.push(source);
      return () => {
        const index = triggerSources.indexOf(source);
        if (index >= 0) triggerSources.splice(index, 1);
      };
    },
  };
}
