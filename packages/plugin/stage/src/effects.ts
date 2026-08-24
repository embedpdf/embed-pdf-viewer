import type { CapabilityToken, EffectContext } from '@embedpdf/core';
import type { StageAction, StageCapability, StageState } from './types';

/**
 * The one effect a stage lens needs: when the document's page registry changes
 * (rotate/move/delete bump `DocumentMeta.revision`), the page geometry under
 * this lens just changed, so re-fit — re-resolve the active zoom intent and
 * re-place against the new footprint.
 *
 * Without it, fit/pixel zoom modes stay anchored to the pre-mutation dimensions:
 * `pageWidth: 110` renders wider after a 90° rotation (width↔height swap), and
 * `fitPage` over- or under-fills. The scene already re-keys on the revision, so
 * only the resolved `cam.zoom` was stale; `refit()` recomputes it.
 *
 * Steady-state only: this reacts to revision CHANGES, never the initial value,
 * so it can't race the capability's level-triggered initial placement (the
 * reason the rest of the plugin is effect-free).
 */
export function registerStageEffects(
  ctx: EffectContext<StageState, StageAction>,
  token: CapabilityToken<StageCapability>,
): void {
  ctx.watch(
    () => ctx.document()?.revision ?? 0,
    () => ctx.get(token).refit(),
  );
}
