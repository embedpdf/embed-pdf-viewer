/**
 * The `javascript` executor: one node is one host transaction with prefetch →
 * boot (once) → run → commit → surface inside the boundary. Print and submit
 * effects are external: replayed after the transaction releases, still inside
 * the queued dispatch operation.
 */
import type { PluginContext } from '@embedpdf/core';
import type { ScriptOutput, ScriptUiEffect } from '@embedpdf/core-acrojs';

import type { ActionDiagnostic, ActionNodeStatus, ActionOrigin, ActionsConfig } from '../contract';
import type { AnnotCommitEntry } from '../host-contract';
import type { ActionsServices } from '../services';
import { intentOfSubmitEffect } from '../submit/intent';
import type { ActionsSubmit } from '../submit/perform';
import type { ActionsRealm } from './realm';
import type { ActionsScriptSurface } from './surface';
import { createScriptWorld } from './world';

type FirePrint = (
  uiContext: { origin: ActionOrigin; phase: 'boot' | 'user' } | undefined,
  diagnose: (diagnostic: ActionDiagnostic) => void,
) => Promise<{ status: ActionNodeStatus; detail?: string }>;

/** The default cap on JavaScript nodes one dispatch may run. */
const DEFAULT_SCRIPT_NODES_PER_DISPATCH = 16;

export function registerScriptExecutor(
  ctx: PluginContext<void>,
  services: Pick<ActionsServices, 'events' | 'ports' | 'queue'>,
  config: ActionsConfig,
  { scriptHost }: Pick<ActionsRealm, 'scriptHost'>,
  { performSubmit }: ActionsSubmit,
  { surfaceScriptResult }: Pick<ActionsScriptSurface, 'surfaceScriptResult'>,
  documentEvents: { firePrintThroughAdapter: FirePrint },
): void {
  const { diagnosticHook } = services.events;
  const ports = services.ports.slots;
  const { budget } = services.queue;
  const { firePrintThroughAdapter } = documentEvents;
  const { scriptWorldFor, scriptEventFor } = createScriptWorld(ctx);

  /** Commit one run's document effects through the owner sinks in the
   *  declared order (form first, then annotations); the first failure skips
   *  the rest across both streams. Returns the failure summary, if any. */
  const commitScriptOutput = async (
    output: ScriptOutput,
    diagnose: (diagnostic: ActionDiagnostic) => void,
  ): Promise<string | null> => {
    let failure: string | null = null;
    if (output.formEffects.length > 0) {
      if (!ports.formCommitSink) {
        diagnose({
          code: 'no-commit-sink',
          message: `script form effects dropped: no form commit sink registered (${output.formEffects.length})`,
        });
      } else {
        const result = await ports.formCommitSink(output.formEffects);
        const firstFailure = result.results.find(
          (entry) => entry.status === 'failed' || entry.status === 'rejected',
        );
        if (firstFailure)
          failure = `form effect ${firstFailure.index}: ${firstFailure.error?.message ?? firstFailure.status}`;
      }
    }
    if (output.annotEffects.length > 0) {
      if (failure) {
        diagnose({
          code: 'executor-failed',
          message: `script annot effects skipped after form failure (${output.annotEffects.length})`,
        });
      } else if (!ports.annotCommitSink) {
        diagnose({
          code: 'no-commit-sink',
          message: `script annot effects dropped: no annotation commit sink registered (${output.annotEffects.length})`,
        });
      } else {
        const entries: AnnotCommitEntry[] = output.annotEffects.map((effect) => ({
          annotObjectNumber: effect.ref.kind === 'objectNumber' ? effect.ref.annotObjectNumber : -1,
          ...(effect.ref.kind === 'objectNumber' ? { page: effect.ref.page } : {}),
          patch: effect.patch,
        }));
        const result = await ports.annotCommitSink(entries);
        const firstFailure = result.results.find((entry) => entry.status === 'failed');
        if (firstFailure)
          failure = `annotation ${firstFailure.annotObjectNumber}: ${firstFailure.error ?? 'failed'}`;
      }
    }
    if (failure) diagnose({ code: 'executor-failed', message: `script commit: ${failure}` });
    return failure;
  };

  if (!scriptHost) return;
  const nodeLimit =
    config.javascript?.maxScriptNodesPerDispatch ?? DEFAULT_SCRIPT_NODES_PER_DISPATCH;
  ports.executors.set('javascript', async (node, actionContext) => {
    if (node.type !== 'javascript') return { status: 'inert', reason: 'not a JS node' };
    if (budget.scriptNodes >= nodeLimit) {
      return {
        status: 'inert',
        reason: `dispatch script budget exhausted (${nodeLimit} JS nodes)`,
      };
    }
    budget.scriptNodes += 1;
    const source = actionContext.source;
    const firstPage = ctx.document()?.pages[0]?.ref.pageObjectNumber;
    const pageObjectNumber =
      source.kind === 'widget' || source.kind === 'page'
        ? source.page.pageObjectNumber
        : source.kind === 'link' || source.kind === 'annotation'
          ? (source.page?.pageObjectNumber ?? firstPage)
          : firstPage;
    if (pageObjectNumber === undefined) {
      return { status: 'inert', reason: 'no page to anchor the world on' };
    }
    const diagnose = (diagnostic: ActionDiagnostic): void => diagnosticHook.emit(diagnostic);
    // Print and submit effects are external: the /WP and /DP wrap runs
    // action trees (which may need their own host transactions) and the
    // submit dataset must be resolved from post-commit truth, so both run
    // after the transaction releases, still inside this queued operation.
    const pendingExternal: Array<{
      effect: Extract<ScriptUiEffect, { kind: 'print' | 'submitForm' }>;
      phase: 'boot' | 'user';
    }> = [];
    const splitExternal = (output: ScriptOutput, phase: 'boot' | 'user'): ScriptUiEffect[] =>
      output.uiEffects.filter((effect) => {
        if (effect.kind === 'print' || effect.kind === 'submitForm') {
          pendingExternal.push({ effect, phase });
          return false;
        }
        return true;
      });
    const outcome = await scriptHost.transaction<
      { status: 'executed' } | { status: 'failed'; error: string }
    >(async (transaction) => {
      let built = await scriptWorldFor(pageObjectNumber);
      const boot = await transaction.boot({
        ...built.world,
        event: { kind: 'name-tree-boot', type: 'Doc', name: 'Open' },
      });
      if (boot) {
        // Boot effects belong to this first transaction; a boot fault only
        // degrades, never blocks. Refetch the world afterwards so the run
        // sees post-boot truth.
        await commitScriptOutput(boot, diagnose);
        surfaceScriptResult({
          uiEffects: splitExternal(boot, 'boot'),
          diagnostics: boot.diagnostics,
          ...(boot.error ? { error: boot.error } : {}),
          origin: actionContext.origin,
          phase: 'boot',
          realm: 'document',
        });
        if (boot.formEffects.length || boot.annotEffects.length) {
          built = await scriptWorldFor(pageObjectNumber);
        }
      }
      const output = await transaction.run(node.script, {
        ...built.world,
        event: scriptEventFor(actionContext, built.snapshot),
      });
      surfaceScriptResult({
        uiEffects: splitExternal(output, 'user'),
        diagnostics: output.diagnostics,
        ...(output.error ? { error: output.error } : {}),
        origin: actionContext.origin,
        phase: 'user',
        realm: 'document',
      });
      if (output.error) return { status: 'failed', error: output.error.message };
      const failure = await commitScriptOutput(output, diagnose);
      return failure ? { status: 'failed', error: failure } : { status: 'executed' };
    });
    for (const entry of pendingExternal) {
      if (entry.effect.kind === 'print') {
        await firePrintThroughAdapter(
          { origin: actionContext.origin, phase: entry.phase },
          diagnose,
        );
      } else {
        await performSubmit(intentOfSubmitEffect(entry.effect), actionContext, diagnose);
      }
    }
    return outcome;
  });
}
