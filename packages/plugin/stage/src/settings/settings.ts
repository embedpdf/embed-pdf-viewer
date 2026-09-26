/**
 * The settings bag and its responsive resolution. BASE (config + runtime
 * setters) ⊕ matching rules' patches = the EFFECTIVE settings the reducer
 * holds. `applySettings` is the ONE reactive applier: the strongest effect
 * among the touched settings wins ('reflow' ⊃ 'scene'/'refit' ⊃ 'reclamp' ⊃
 * 'none'), so a breakpoint crossing gets exactly the invariant a hand-written
 * update would.
 */
import type { ResponsiveRule, StageConfig, StageSettings, StageViewState } from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import type { StageArrival } from '../navigation/arrive';
import { boxOf, eqSetting, mergeSettings, resolveResponsive } from '../responsive';
import type { StageContext, StageServices } from '../services';
import { DEFAULT_RESPONSIVE, pickSettings, SETTINGS_EFFECT, SETTING_KEYS } from '../settings';
import type { SettingEffect } from '../settings';

export function createSettings(
  ctx: StageContext,
  { scene }: Pick<StageServices, 'scene'>,
  config: StageConfig,
  { setCam }: Pick<StageCameraWrite, 'setCam'>,
  { cancelAnim }: Pick<StageAnimation, 'cancelAnim'>,
  {
    applyAnchor,
    reapply,
    goToTarget,
  }: Pick<StageArrival, 'applyAnchor' | 'reapply' | 'goToTarget'>,
) {
  const { cam, vp, alignPoint, anchorAt } = scene;

  const snapshotSettings = (): StageSettings => pickSettings(ctx.getState());

  /**
   * Settings change, reacted per the registry — the strongest effect among the
   * touched settings wins: 'reflow' ⊃ 'scene'/'refit' ⊃ 'reclamp' ⊃ 'none'.
   * The ONE reactive applier: the public `update()` and the responsive driver
   * both land here, so a breakpoint crossing gets exactly the invariant a
   * hand-written update would.
   */
  const applySettings = (patch: Partial<StageSettings>) => {
    cancelAnim();
    const touched = (effect: SettingEffect) =>
      SETTING_KEYS.some((k) => patch[k] !== undefined && SETTINGS_EFFECT[k] === effect);
    // The change's INVARIANT point: a pure zoom-intent change ('refit' alone)
    // holds the zoomAlign focal point — zoomTo/fit-mode switches magnify
    // around the same spot the zoom buttons do; every other reframe holds
    // the anchorAlign reference. Resolved once, used for capture AND restore.
    const align =
      touched('refit') && !touched('scene') && !touched('reflow')
        ? ctx.getState().zoomAlign
        : ctx.getState().anchorAlign;
    const anchor = anchorAt(alignPoint(align, vp())); // capture against the current scene
    ctx.dispatch({ type: 'PATCH', patch });
    if (touched('scene')) scene.invalidate();
    if (touched('reflow')) {
      // flow toggled: re-place onto the cursor's page under the new flow's scene
      // (the camera's coordinates are meaningless across the flow boundary).
      goToTarget(ctx.getState().cursor, { behavior: 'instant' });
    } else if (touched('scene') || touched('refit')) {
      reapply(anchor, align); // rebuild + keep page + re-fit (fit-all: re-place the scene)
    } else if (touched('reclamp')) {
      setCam(cam()); // clamp policy changed: just re-clamp the current camera
    }
    // 'none' (arrivalAlign, zoomAlign, anchorAlign, scrollBehavior): future verbs only
  };

  // ── responsive settings (container queries for the settings bag) ─────────────
  // BASE (config + runtime setters) ⊕ matching rules' patches = the EFFECTIVE
  // settings the reducer holds. Rules assert at TRANSITIONS — box, base, or
  // rules changes — which is why the sync diffs against the last EFFECTIVE
  // resolution, never against live state: between crossings interaction owns
  // the state (a pinch-zoomed level survives a resize unless a rule actually
  // flips), and keys the rules don't touch never get re-asserted.
  let base = snapshotSettings();
  const initialBase = base;
  let rules: readonly ResponsiveRule[] = config.responsive ?? DEFAULT_RESPONSIVE;
  let lastEffective = base; // rules first assert when a real box arrives
  const publishActive = (active: readonly string[]) => {
    const prev = ctx.getState().activeRules;
    if (prev.length !== active.length || active.some((n, i) => n !== prev[i])) {
      ctx.dispatch({ type: 'RESPONSIVE', active });
    }
  };
  /**
   * Re-resolve and apply what CHANGED since the last resolution. `react: true`
   * routes the patch through `applySettings` (full anchor-preserving update);
   * `react: false` (inside `setViewport`, whose caller runs its own reframe)
   * just lands the patch + cache invalidation and reports the strongest
   * effect so the caller can escalate a rule-driven flow flip.
   */
  const syncResponsive = (react: boolean): SettingEffect => {
    const { effective, active } = resolveResponsive(base, rules, boxOf(vp()));
    const patch: Partial<StageSettings> = {};
    for (const k of SETTING_KEYS) {
      if (!eqSetting(effective[k], lastEffective[k])) {
        Object.assign(patch, { [k]: effective[k] });
      }
    }
    lastEffective = effective;
    publishActive(active);
    const keys = Object.keys(patch) as Array<keyof StageSettings>;
    if (keys.length === 0) return 'none';
    if (react) {
      applySettings(patch);
      return 'none'; // reacted in full — nothing left for the caller
    }
    ctx.dispatch({ type: 'PATCH', patch });
    const rank: Record<SettingEffect, number> = {
      none: 0,
      reclamp: 1,
      refit: 2,
      scene: 3,
      reflow: 4,
    };
    let strongest: SettingEffect = 'none';
    for (const k of keys)
      if (rank[SETTINGS_EFFECT[k]] > rank[strongest]) strongest = SETTINGS_EFFECT[k];
    if (strongest === 'scene' || strongest === 'reflow') scene.invalidate();
    return strongest;
  };

  const updateSettings = (patch: Partial<StageSettings>): void => {
    // Writes the responsive BASE; the resolver decides what actually lands
    // (a matching rule's key wins until its rule stops matching). With no
    // rules in play this degenerates to exactly the old direct update.
    base = mergeSettings(base, patch);
    syncResponsive(true);
  };

  const applyViewState = (view: StageViewState): void => {
    cancelAnim();
    // A restored view is app-level state: it writes the BASE, and the rules
    // re-assert on top — so a snapshot saved on a desktop restores compact
    // padding on a phone. One PATCH carries the full effective result.
    base = mergeSettings(base, pickSettings(view));
    const { effective, active } = resolveResponsive(base, rules, boxOf(vp()));
    lastEffective = effective;
    publishActive(active);
    ctx.dispatch({ type: 'PATCH', patch: effective });
    ctx.dispatch({ type: 'CURSOR', cursor: view.cursor ?? 0 });
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
      matchesRule: (name) => ctx.getState().activeRules.includes(name),
      listActiveRules: () => ctx.getState().activeRules,
      setFlow: (flow) => updateSettings({ flow }),
      setLayout: (layout) => updateSettings({ layout }),
      setSpread: (spread) => updateSettings({ spread }),
      setSizing: (sizing) => updateSettings({ sizing }),
      applyViewState,
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageSettingsArea = ReturnType<typeof createSettings>;
