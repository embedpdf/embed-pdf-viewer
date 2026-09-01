import type { CapabilityToken, EffectContext } from '@embedpdf/core';
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import type { StageAction, StageCapability, StageState } from './types';

/**
 * Stage lens effects.
 *
 * 1. Re-fit on page-registry mutations: when rotate/move/delete bump
 *    `DocumentMeta.revision`, the page geometry under this lens changed, so
 *    re-resolve the active zoom intent and re-place against the new
 *    footprint. Steady-state only — it reacts to revision CHANGES, never the
 *    initial value, so it can't race the capability's level-triggered
 *    initial placement.
 *
 * 2. The page-state feed (main lens only, actions plugin present): stage is
 *    AUTHORITATIVE for what page the viewer is on; the action engine's
 *    lifecycle coordinator owns WHEN page-lifecycle triggers fire. This feed
 *    pushes `{ currentPon, visiblePons, placed, cause }` snapshots — pons,
 *    not indexes (reorder-safe) — on placement and on every change; the
 *    coordinator buffers them behind the document-open barrier and diffs
 *    against its last-emitted state, so this side stays a dumb reporter.
 */
export function registerStageEffects(
  ctx: EffectContext<StageState, StageAction>,
  token: CapabilityToken<StageCapability>,
  feedActions = false,
): void {
  ctx.watch(
    () => ctx.document()?.revision ?? 0,
    () => ctx.get(token).refit(),
  );

  if (!feedActions) return;
  const actions = ctx.tryGet(ActionsHostToken);
  if (!actions) return;

  const snapshot = () => {
    const state = ctx.getState();
    if (!state.placed) return null;
    const stage = ctx.get(token);
    return {
      currentPon: stage.pages()[state.cursor]?.pon ?? null,
      visiblePons: stage.visiblePages().map((page) => page.pon),
      cause: state.motionCause,
    };
  };
  ctx.watch(
    // Signature over the REPORTABLE truth: current pon + the visible pon
    // set. `cause` is deliberately absent — a cause flip alone is not a
    // page-state change and must not produce a report.
    () => {
      const s = snapshot();
      return s === null
        ? 'unplaced'
        : `${s.currentPon ?? -1}|${[...s.visiblePons].sort((a, b) => a - b).join(',')}`;
    },
    () => {
      const s = snapshot();
      if (s === null) return;
      actions.reportPageState({
        currentPon: s.currentPon,
        visiblePons: s.visiblePons,
        placed: true,
        cause: s.cause,
      });
    },
  );
}
