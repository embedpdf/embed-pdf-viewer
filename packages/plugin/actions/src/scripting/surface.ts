/**
 * The surface door (D9): the ONE UI/diagnostic port for script results.
 * Print and submitForm effects arriving from the ACTIONS plane never reach
 * this door (the js executor extracts them and routes through
 * `firePrintThroughAdapter` / `performSubmit` post-transaction — the WP/DP
 * wrap and the post-commit dataset need to run outside the host
 * transaction). Effects here come from the FORM pipeline's K/V/C/F path.
 */
import type { ActionOrigin } from '../contract';
import type {
  ActionsHostCapability,
  ScriptCommitSurface,
  ScriptRealmKind,
  ScriptSurfaceResult,
} from '../host-contract';
import type { ActionsServices } from '../services';
import { intentOfSubmitEffect } from '../submit/intent';
import type { ActionsSubmit } from '../submit/perform';

export function createScriptSurface(
  services: Pick<ActionsServices, 'events' | 'ports' | 'authority' | 'printLatch'>,
  { performSubmit }: ActionsSubmit,
) {
  const { diagnosticHook, scriptDiagnosticHook, scriptErrorHook } = services.events;
  const ports = services.ports.slots;
  const { allowsPrint } = services.authority;
  const printLatch = services.printLatch;

  const surfaceScriptResult = (result: ScriptSurfaceResult): void => {
    const uiContext = { origin: result.origin, phase: result.phase };
    for (const effect of result.uiEffects) {
      // A DETACHED realm has no document surface: the document it scripted
      // is not displayed, and this door's print/goto/submit act on THIS
      // document. Only alerts have a valid target (the user); everything
      // else is suppressed, observably — never routed to the wrong document.
      if (result.realm === 'detached' && effect.kind !== 'alert') {
        scriptDiagnosticHook.emit({
          code: 'ui-effect-suppressed',
          message: `script ${effect.kind} request from a detached realm suppressed: no document surface`,
        });
        continue;
      }
      if (effect.kind === 'submitForm') {
        // Form-pipeline scripted submit: same door, DETACHED (the form
        // queue must not await into submit sinks). Policy + sinks +
        // diagnostics all live inside performSubmit.
        void performSubmit(
          intentOfSubmitEffect(effect),
          {
            origin: result.origin,
            source: { kind: 'api' },
            event: { scope: 'activate' },
          },
          (diagnostic) => diagnosticHook.emit(diagnostic),
        );
        continue;
      }
      // PERMISSION, not preference: a print request without doc.print
      // authority reaches no adapter — non-overridable, observable.
      if (effect.kind === 'print' && !allowsPrint()) {
        scriptDiagnosticHook.emit({
          code: 'ui-effect-suppressed',
          message: 'script print request withheld: doc.print is not allowed',
        });
        continue;
      }
      // D3's latch: a WillPrint/DidPrint script (or anything running while
      // a print wrapper is active) printing again is suppressed — one
      // dialog per outer request.
      if (effect.kind === 'print' && printLatch.active) {
        scriptDiagnosticHook.emit({
          code: 'ui-effect-suppressed',
          message: 'script print request during a document print event — suppressed (reentrant)',
        });
        continue;
      }
      if (!ports.uiAdapter) {
        diagnosticHook.emit({
          code: 'no-adapter',
          message: `script ${effect.kind}: no UI adapter installed`,
        });
        continue;
      }
      if (effect.kind === 'alert') {
        ports.uiAdapter.alert?.(effect.message, {
          ...uiContext,
          icon: effect.icon,
          ...(effect.title !== undefined ? { title: effect.title } : {}),
        });
      } else if (effect.kind === 'gotoPage') {
        ports.uiAdapter.gotoPage?.(effect.page, uiContext);
      } else {
        ports.uiAdapter.print(uiContext);
      }
    }
    for (const diagnostic of result.diagnostics) scriptDiagnosticHook.emit(diagnostic);
    if (result.error) scriptErrorHook.emit(result.error);
  };

  /** A K/V/C/F commit surfaces as up to two results: the boot phase (only
   *  when it produced effects) and the user phase (always — it carries the
   *  diagnostics and the error). */
  const surfaceScriptCommit = (
    commit: ScriptCommitSurface,
    context: { origin: ActionOrigin; realm: ScriptRealmKind },
  ): void => {
    const phases: Array<'boot' | 'user'> = ['boot', 'user'];
    for (const phase of phases) {
      const uiEffects = commit.uiEffects.filter((effect) => effect.phase === phase);
      if (uiEffects.length === 0 && phase === 'boot') continue;
      surfaceScriptResult({
        uiEffects,
        diagnostics: phase === 'user' ? commit.diagnostics : [],
        ...(phase === 'user' && commit.error ? { error: commit.error } : {}),
        origin: context.origin,
        phase,
        realm: context.realm,
      });
    }
  };

  return {
    surfaceScriptResult,
    api: { surfaceScriptResult, surfaceScriptCommit } satisfies Partial<ActionsHostCapability>,
  };
}
export type ActionsScriptSurface = ReturnType<typeof createScriptSurface>;
