/**
 * The tree walker: policy per node, document-lifetime work in walk order
 * (Hide through the owner sinks, executors for the rest), and navigation and
 * external effects deferred until every document node succeeded.
 */
import type { PluginContext } from '@embedpdf/core';
import type { PdfActionNode, PdfActionTree } from '@embedpdf/engine-core/runtime';

import type {
  ActionContext,
  ActionDiagnostic,
  ActionDispatchResult,
  ActionExecutorResult,
  ActionNodeResult,
  ActionNodeStatus,
} from '../contract';
import type { AnnotCommitEntry } from '../host-contract';
import type { ActionsServices } from '../services';
import { DOCUMENT_TYPES, isPrintVerb } from '../services/policy';
import { intentOfPayload } from '../submit/intent';
import type { ActionsSubmit } from '../submit/perform';
import type { ActionsDocumentEvents } from '../lifecycle/document-events';

export function createRunner(
  ctx: PluginContext<void>,
  services: Pick<ActionsServices, 'policy' | 'ports' | 'events'>,
  { performSubmit }: ActionsSubmit,
  { firePrintThroughAdapter }: Pick<ActionsDocumentEvents, 'firePrintThroughAdapter'>,
) {
  const { decisionFor } = services.policy;
  const ports = services.ports.slots;
  const { diagnosticHook } = services.events;

  async function run(
    tree: PdfActionTree,
    actionContext: ActionContext,
  ): Promise<ActionDispatchResult> {
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
    // Navigation and external effects are deferred thunks, fired only after
    // every document-lifetime node succeeded, in node order, so navigation
    // never yanks the user away from a failed write.
    const deferred: Array<{ result: ActionNodeResult; fire: () => Promise<void> | void }> = [];
    let documentFailed = false;

    const settle = (result: ActionNodeResult, outcome: ActionExecutorResult): void => {
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

    // A Hide action sets or clears the Hidden state (ISO 32000-2 §12.6.4.11):
    // a real mutation through the owning plane's commit sink, authority-gated
    // by the engine like every other write. Widgets are the forms plane's
    // visibility (the engine's field-level `setDisplay`, like Acrobat's
    // `field.display`; there is no per-widget annotation patch); plain
    // annotations are flag patches through the annotation sink.
    const interpretHide = async (
      node: Extract<PdfActionNode, { type: 'hide' }>,
    ): Promise<{ status: ActionNodeStatus; detail?: string }> => {
      const display = node.hide ? ('hidden' as const) : ('visible' as const);
      const fieldRefs: Array<{ kind: 'objectNumber'; fieldObjectNumber: number }> = [];
      const annotEntries: AnnotCommitEntry[] = [];
      const names: string[] = [];
      const bareObjectNumbers: number[] = [];
      for (const target of node.targets) {
        if (target.kind === 'objectNumber') bareObjectNumbers.push(target.objectNumber);
        else names.push(target.name);
      }
      if (names.length || bareObjectNumbers.length) {
        const snapshot = await ctx.doc.forms.list();
        for (const name of names) {
          const field = snapshot.fields.find((candidate) => candidate.name === name);
          if (!field) {
            diagnose({ code: 'unresolved-target', message: `hide: no field named '${name}'` });
            continue;
          }
          fieldRefs.push({ kind: 'objectNumber', fieldObjectNumber: field.fieldObjectNumber });
        }
        for (const objectNumber of bareObjectNumbers) {
          // A bare object number may be a widget (its field's display) or a
          // plain annotation (its own flags): the forms snapshot decides.
          const owner = snapshot.fields.find((field) =>
            field.widgets.some((widget) => widget.annotObjectNumber === objectNumber),
          );
          if (owner) {
            fieldRefs.push({ kind: 'objectNumber', fieldObjectNumber: owner.fieldObjectNumber });
          } else {
            annotEntries.push({
              annotObjectNumber: objectNumber,
              patch: { flags: { hidden: node.hide } },
            });
          }
        }
      }
      let failedDetail: string | undefined;
      if (fieldRefs.length) {
        if (!ports.formCommitSink) {
          diagnose({
            code: 'no-commit-sink',
            message: 'hide: no form commit sink registered (form plugin absent)',
          });
          return { status: 'no-executor' };
        }
        const result = await ports.formCommitSink(
          fieldRefs.map((ref) => ({ kind: 'setDisplay', ref, display })),
        );
        const firstFailure = result.results.find(
          (entry) => entry.status === 'failed' || entry.status === 'rejected',
        );
        if (firstFailure) {
          failedDetail = firstFailure.error?.message ?? firstFailure.status;
          diagnose({ code: 'executor-failed', message: `hide: ${failedDetail}` });
        }
      }
      if (annotEntries.length && !failedDetail) {
        if (!ports.annotCommitSink) {
          diagnose({
            code: 'no-commit-sink',
            message: 'hide: no annotation commit sink registered (annotation plugin absent)',
          });
          return { status: 'no-executor' };
        }
        const committed = await ports.annotCommitSink(annotEntries);
        const failed = committed.results.filter((entry) => entry.status === 'failed');
        for (const failure of failed) {
          diagnose({
            code: 'executor-failed',
            message: `hide: annotation ${failure.annotObjectNumber}: ${failure.error ?? 'failed'}`,
          });
        }
        if (failed.length === committed.results.length && failed.length > 0) {
          failedDetail = failed[0]?.error;
        }
      }
      if (failedDetail) return { status: 'failed', detail: failedDetail };
      return { status: 'executed' };
    };

    const interpret = async (node: PdfActionNode, path: number[]): Promise<void> => {
      const result: ActionNodeResult = { path, type: node.type, status: 'blocked' };
      nodes.push(result);
      const decision = decisionFor(node, actionContext.origin);

      if (decision === 'never' || decision === 'block' || decision === 'report') {
        result.status = 'blocked';
        diagnose({
          code: 'blocked',
          message: `${node.type}: ${decision === 'never' ? 'never executable' : `policy '${decision}' for origin '${actionContext.origin}'`}`,
        });
        return;
      }
      if (decision === 'unsupported') {
        result.status = 'no-executor';
        return;
      }

      if (node.type === 'hide') {
        // A document mutation: an earlier document failure skips it, and its
        // own failure stops later document work and drops deferred effects.
        if (documentFailed) {
          result.status = 'skipped';
          return;
        }
        const outcome = await interpretHide(node);
        result.status = outcome.status;
        if (outcome.detail) result.detail = outcome.detail;
        if (outcome.status === 'failed') documentFailed = true;
        return;
      }

      if (DOCUMENT_TYPES.has(node.type)) {
        if (documentFailed) {
          result.status = 'skipped';
          return;
        }
        const executor = ports.executors.get(node.type);
        if (!executor) {
          result.status = node.type === 'javascript' ? 'inert' : 'no-executor';
          diagnose({
            code: 'no-executor',
            message: `${node.type}: no executor registered${node.type === 'javascript' ? ' (scripting unavailable)' : ''}`,
          });
          return;
        }
        try {
          settle(result, await executor(node, actionContext));
        } catch (error) {
          settle(result, {
            status: 'failed',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (result.status === 'failed') documentFailed = true;
        return;
      }

      if (node.type === 'submit-form') {
        if (!node.payload) {
          // A runtime that does not extract the submit payload: the node is
          // recognized but inert, and diagnosed.
          result.status = 'inert';
          result.detail = 'submit payload unavailable (older runtime extraction)';
          diagnose({
            code: 'submit-payload-unavailable',
            message: 'submit-form: payload unavailable (older runtime extraction) — node inert',
          });
          return;
        }
        const payload = node.payload;
        // External like print and uri: deferred until every document-lifetime
        // node succeeded, so a submission never carries a half-failed form
        // state.
        result.status = 'skipped'; // provisional until fired
        deferred.push({
          result,
          fire: async () => {
            const outcome = await performSubmit(intentOfPayload(payload), actionContext, diagnose);
            result.status = outcome.status;
            if (outcome.detail) result.detail = outcome.detail;
          },
        });
        return;
      }

      if (isPrintVerb(node) || node.type === 'uri') {
        // External: adapter-routed, deferred.
        result.status = 'skipped'; // provisional until fired
        deferred.push({
          result,
          fire: async () => {
            if (node.type === 'uri') {
              if (!ports.uiAdapter) {
                result.status = 'no-executor';
                diagnose({ code: 'no-adapter', message: `${node.type}: no UI adapter installed` });
                return;
              }
              ports.uiAdapter.openUri(node.uri, {
                isMap: node.isMap,
                origin: actionContext.origin,
              });
              result.status = 'executed';
              return;
            }
            // The Print verb: /WP → the adapter (exactly once) → /DP, under
            // the print latch. Authority, adapter and reentrancy verdicts come
            // back as the node's status.
            const outcome = await firePrintThroughAdapter(undefined, diagnose);
            result.status = outcome.status;
            if (outcome.detail) result.detail = outcome.detail;
          },
        });
        return;
      }

      // goto + named page verbs: navigation, executor-routed, deferred.
      result.status = 'skipped'; // provisional until fired
      deferred.push({
        result,
        fire: async () => {
          const executor = ports.executors.get(node.type);
          if (!executor) {
            result.status = 'no-executor';
            diagnose({ code: 'no-executor', message: `${node.type}: no executor registered` });
            return;
          }
          try {
            settle(result, await executor(node, actionContext));
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

  return { run };
}
export type ActionsRunner = ReturnType<typeof createRunner>;
