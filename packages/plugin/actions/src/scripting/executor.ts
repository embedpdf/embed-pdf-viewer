/**
 * The REAL `javascript` executor: one node = one host transaction with
 * prefetch → boot? → run → commit → surface INSIDE the boundary. Print and
 * submit effects are external — replayed after the transaction releases,
 * still inside the queued dispatch operation.
 */
import type { ScriptOutput, ScriptUiEffect } from '@embedpdf/core-acrojs';

import type { ActionDiagnostic, ActionsConfig } from '../contract';
import type { AnnotCommitEntry } from '../host-contract';
import type { ActionsContext, ActionsServices } from '../services';
import { intentOfSubmitEffect } from '../submit/intent';
import type { ActionsSubmit } from '../submit/perform';
import type { ActionsRealm } from './realm';
import type { ActionsScriptSurface } from './surface';
import { createScriptWorld } from './world';

export function registerScriptExecutor(
  ctx: ActionsContext,
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
  const js = config.javascript;

  /** Commit one run's document effects through the owner sinks in the
   *  DECLARED order (form first, then annot); the first failure skips the
   *  rest across BOTH streams. Returns the failure summary, if any. */
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
        const bad = result.results.find(
          (entry) => entry.status === 'failed' || entry.status === 'rejected',
        );
        if (bad) failure = `form effect ${bad.index}: ${bad.error?.message ?? bad.status}`;
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
        const bad = result.results.find((entry) => entry.status === 'failed');
        if (bad) failure = `annotation ${bad.annotObjectNumber}: ${bad.error ?? 'failed'}`;
      }
    }
    if (failure) diagnose({ code: 'executor-failed', message: `script commit: ${failure}` });
    return failure;
  };

  // ── the REAL `javascript` executor: one node = one host transaction with
  //    prefetch → boot? → run → commit → surface INSIDE the boundary ───────
  if (scriptHost) {
    const nodeCap = js?.maxScriptNodesPerDispatch ?? 16;
    ports.executors.set('javascript', async (node, actionCtx) => {
      if (node.type !== 'javascript') return { status: 'inert', reason: 'not a JS node' };
      const doc = ctx.doc;
      if (!doc) return { status: 'inert', reason: 'no document' };
      if (budget.scriptNodes >= nodeCap) {
        return {
          status: 'inert',
          reason: `dispatch script budget exhausted (${nodeCap} JS nodes)`,
        };
      }
      budget.scriptNodes += 1;
      const source = actionCtx.source;
      const pon =
        source.kind === 'widget'
          ? source.page.pageObjectNumber
          : source.kind === 'link' || source.kind === 'annotation'
            ? (source.page?.pageObjectNumber ?? ctx.document()?.pages[0]?.ref.pageObjectNumber)
            : source.kind === 'page'
              ? source.page.pageObjectNumber
              : ctx.document()?.pages[0]?.ref.pageObjectNumber;
      if (pon === undefined) return { status: 'inert', reason: 'no page to anchor the world on' };
      const diagnose = (diagnostic: ActionDiagnostic): void => diagnosticHook.emit(diagnostic);
      // Print/submit effects are EXTERNAL: the WP/DP wrap runs action trees
      // (which may need their own host transactions) and the submit dataset
      // must be resolved from POST-COMMIT truth — both must run after the
      // transaction releases, still inside this queued dispatch op.
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
      >(async (txn) => {
        let built = await scriptWorldFor(pon);
        const boot = await txn.boot({
          ...built.world,
          event: { kind: 'name-tree-boot', type: 'Doc', name: 'Open' },
        });
        if (boot) {
          // Boot effects belong to this first transaction; a boot fault only
          // degrades (never bricks). Refetch the world afterwards so the run
          // sees post-boot truth.
          await commitScriptOutput(boot, diagnose);
          surfaceScriptResult({
            uiEffects: splitExternal(boot, 'boot'),
            diagnostics: boot.diagnostics,
            ...(boot.error ? { error: boot.error } : {}),
            origin: actionCtx.origin,
            phase: 'boot',
            realm: 'document',
          });
          if (boot.formEffects.length || boot.annotEffects.length) {
            built = await scriptWorldFor(pon);
          }
        }
        const output = await txn.run(node.script, {
          ...built.world,
          event: scriptEventFor(actionCtx, built.snapshot),
        });
        surfaceScriptResult({
          uiEffects: splitExternal(output, 'user'),
          diagnostics: output.diagnostics,
          ...(output.error ? { error: output.error } : {}),
          origin: actionCtx.origin,
          phase: 'user',
          realm: 'document',
        });
        if (output.error) return { status: 'failed', error: output.error.message };
        const failure = await commitScriptOutput(output, diagnose);
        return failure ? { status: 'failed', error: failure } : { status: 'executed' };
      });
      for (const entry of pendingExternal) {
        if (entry.effect.kind === 'print') {
          await firePrintThroughAdapter({ origin: actionCtx.origin, phase: entry.phase }, diagnose);
        } else {
          await performSubmit(intentOfSubmitEffect(entry.effect), actionCtx, diagnose);
        }
      }
      return outcome;
    });
  }
}

type FirePrint = (
  uiContext: { origin: import('../contract').ActionOrigin; phase: 'boot' | 'user' } | undefined,
  diagnose: (diagnostic: ActionDiagnostic) => void,
) => Promise<{ status: import('../contract').ActionNodeStatus; detail?: string }>;
