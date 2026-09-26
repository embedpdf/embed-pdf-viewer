/**
 * The settings bag and its responsive resolution. The base (config plus
 * runtime setters) merged with the matching rules' patches is the effective
 * settings the state holds. `applySettings` is the one reactive applier: the
 * strongest effect among the touched settings wins ('reflow' ⊃ 'scene'/'refit'
 * ⊃ 'reclamp' ⊃ 'none'), so a breakpoint crossing gets exactly the invariant a
 * hand-written update would.
 */
import type { PluginContext } from '@embedpdf/core';

import type { ResponsiveRule, StageConfig, StageSettings, StageViewState } from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import { patchSettings, setActiveRules, setCursor, type StageState } from '../model';
import type { StageArrival } from '../navigation/arrive';
import { boxOf, eqSetting, mergeSettings, resolveResponsive } from '../responsive';
import type { StageServices } from '../services';
import { DEFAULT_RESPONSIVE, pickSettings, SETTINGS_EFFECT, SETTING_KEYS } from '../settings';
import type { SettingEffect } from '../settings';

const EFFECT_RANK: Record<SettingEffect, number> = {
  none: 0,
  reclamp: 1,
  refit: 2,
  scene: 3,
  reflow: 4,
};

export function createSettings(
  ctx: PluginContext<StageState>,
  { scene }: Pick<StageServices, 'scene'>,
  config: StageConfig,
  { writeCamera }: Pick<StageCameraWrite, 'writeCamera'>,
  { cancelAnimation }: Pick<StageAnimation, 'cancelAnimation'>,
  {
    applyAnchor,
    reapply,
    goToTarget,
  }: Pick<StageArrival, 'applyAnchor' | 'reapply' | 'goToTarget'>,
) {
  const { camera, viewport, alignPoint, anchorAt } = scene;
  const state = () => ctx.state.get();

  const snapshotSettings = (): StageSettings => pickSettings(state());

  /**
   * React to a settings change per the registry: the strongest effect among
   * the touched settings wins. Both the public `updateSettings()` and the
   * responsive driver land here.
   */
  const applySettings = (patch: Partial<StageSettings>) => {
    cancelAnimation();
    const touched = (effect: SettingEffect) =>
      SETTING_KEYS.some((key) => patch[key] !== undefined && SETTINGS_EFFECT[key] === effect);
    // The change's invariant point: a pure zoom-intent change ('refit' alone)
    // holds the zoomAlign focal point, so zoomTo and fit-mode switches magnify
    // around the same spot the zoom buttons do; every other reframe holds the
    // anchorAlign reference. Resolved once, used for capture and restore.
    const align =
      touched('refit') && !touched('scene') && !touched('reflow')
        ? state().zoomAlign
        : state().anchorAlign;
    const anchor = anchorAt(alignPoint(align, viewport())); // captured against the current scene
    ctx.state.update(patchSettings, patch);
    if (touched('scene')) scene.invalidate();
    if (touched('reflow')) {
      // The flow toggled: re-place onto the cursor's page under the new
      // flow's scene (camera coordinates are meaningless across the flow
      // boundary).
      goToTarget(state().cursor, { behavior: 'instant' });
    } else if (touched('scene') || touched('refit')) {
      reapply(anchor, align); // rebuild, keep the page, re-fit (fit-all re-places the scene)
    } else if (touched('reclamp')) {
      writeCamera(camera()); // the clamp policy changed: re-clamp the current camera
    }
    // 'none' (arrivalAlign, zoomAlign, anchorAlign, scrollBehavior) guides future verbs only.
  };

  // ── responsive settings (container queries for the settings bag) ──
  // Rules assert at transitions (box, base or rules changes), which is why
  // the sync diffs against the last effective resolution, never against live
  // state: between crossings interaction owns the state (a pinch-zoomed level
  // survives a resize unless a rule actually flips), and keys the rules do
  // not touch are never re-asserted.
  let base = snapshotSettings();
  const initialBase = base;
  let rules: readonly ResponsiveRule[] = config.responsive ?? DEFAULT_RESPONSIVE;
  let lastEffective = base; // rules first assert when a real box arrives
  const publishActive = (active: readonly string[]) => {
    const current = state().activeRules;
    if (current.length !== active.length || active.some((name, index) => name !== current[index])) {
      ctx.state.update(setActiveRules, active);
    }
  };
  /**
   * Re-resolve and apply what changed since the last resolution. `react:
   * true` routes the patch through `applySettings` (the full
   * anchor-preserving update); `react: false` (inside `setViewportSize`,
   * whose caller runs its own reframe) only lands the patch and the cache
   * invalidation and reports the strongest effect, so the caller can
   * escalate a rule-driven flow flip.
   */
  const syncResponsive = (react: boolean): SettingEffect => {
    const { effective, active } = resolveResponsive(base, rules, boxOf(viewport()));
    const patch: Partial<StageSettings> = {};
    for (const key of SETTING_KEYS) {
      if (!eqSetting(effective[key], lastEffective[key])) {
        Object.assign(patch, { [key]: effective[key] });
      }
    }
    lastEffective = effective;
    publishActive(active);
    const keys = Object.keys(patch) as Array<keyof StageSettings>;
    if (keys.length === 0) return 'none';
    if (react) {
      applySettings(patch);
      return 'none'; // reacted in full: nothing left for the caller
    }
    ctx.state.update(patchSettings, patch);
    let strongest: SettingEffect = 'none';
    for (const key of keys) {
      if (EFFECT_RANK[SETTINGS_EFFECT[key]] > EFFECT_RANK[strongest]) {
        strongest = SETTINGS_EFFECT[key];
      }
    }
    if (strongest === 'scene' || strongest === 'reflow') scene.invalidate();
    return strongest;
  };

  const updateSettings = (patch: Partial<StageSettings>): void => {
    // Writes the responsive base; the resolver decides what actually lands (a
    // matching rule's key wins until its rule stops matching). With no rules
    // in play this is a direct update.
    base = mergeSettings(base, patch);
    syncResponsive(true);
  };

  const applyViewState = (view: StageViewState): void => {
    cancelAnimation();
    // A restored view is app-level state: it writes the base, and the rules
    // re-assert on top, so a snapshot saved on a desktop restores compact
    // padding on a phone. One patch carries the full effective result.
    base = mergeSettings(base, pickSettings(view));
    const { effective, active } = resolveResponsive(base, rules, boxOf(viewport()));
    lastEffective = effective;
    publishActive(active);
    ctx.state.update(patchSettings, effective);
    ctx.state.update(setCursor, view.cursor ?? 0);
    scene.invalidate();
    applyAnchor(view.anchor);
  };

  return {
    snapshotSettings,
    syncResponsive,
    updateSettings,
    applyViewState,
    api: {
      getSettings: snapshotSettings,
      resetSettings: () => {
        base = mergeSettings(initialBase, {});
        syncResponsive(true);
      },
      updateSettings,
      setResponsiveRules: (next) => {
        rules = next;
        syncResponsive(true);
      },
      matchesRule: (name) => state().activeRules.includes(name),
      listActiveRules: () => state().activeRules,
      setFlow: (flow) => updateSettings({ flow }),
      setLayout: (layout) => updateSettings({ layout }),
      setSpread: (spread) => updateSettings({ spread }),
      setSizing: (sizing) => updateSettings({ sizing }),
      applyViewState,
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageSettingsArea = ReturnType<typeof createSettings>;
