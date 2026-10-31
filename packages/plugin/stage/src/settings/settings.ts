/**
 * The settings bag and its resolution. The base (config plus `updateSettings()`
 * changes), then the matching rules' patches, then the locks, is the effective
 * settings the state holds. `applySettings` is the one reactive applier: the
 * strongest effect among the touched settings wins ('reflow' ⊃ 'scene'/'refit'
 * ⊃ 'reclamp' ⊃ 'none'), so a breakpoint crossing gets exactly the invariant a
 * hand-written update would.
 */
import { memo, PluginError, type PluginContext, type SettingLock } from '@embedpdf/core';

import type {
  ResponsiveRule,
  StageConfig,
  StageSettings,
  StageSettingsLock,
  StageSettingsPatch,
  StageViewState,
} from '../contract';
import type { StageAnimation } from '../camera/animation';
import type { StageCameraWrite } from '../camera/write';
import type { StageHostCapability } from '../host-contract';
import {
  patchSettings,
  setActiveRules,
  setCursor,
  setLocks,
  type StageLocks,
  type StageModel,
} from '../model';
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
  ctx: PluginContext<StageModel>,
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

  // The same object while no setting changed, so readers compare by identity.
  const snapshotSettings: () => StageSettings = memo(
    () => SETTING_KEYS.map((key) => state()[key]),
    () => pickSettings(state()),
  );

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
  // The locks, in the order they were taken: the last layer, over the base and the rules.
  let locks: readonly StageSettingsLock[] = [];
  /** Base, then the matching rules, then the locks: what the state holds. */
  const resolve = () => {
    const { effective, active } = resolveResponsive(base, rules, boxOf(viewport()));
    return {
      effective: locks.reduce(
        (settings, lock) => mergeSettings(settings, lock.settings),
        effective,
      ),
      active,
    };
  };
  /** Who holds each locked setting, in state: the first lock that names it. */
  const publishLocks = () => {
    const holders: Partial<Record<keyof StageSettings, SettingLock>> = {};
    for (const lock of locks) {
      for (const key of lockedKeys(lock)) {
        holders[key] ??= {
          by: lock.by,
          ...(lock.reasonKey !== undefined ? { reasonKey: lock.reasonKey } : {}),
        };
      }
    }
    const current = state().locks;
    const keys = Object.keys(holders) as (keyof StageSettings)[];
    const same =
      keys.length === Object.keys(current).length &&
      keys.every(
        (key) =>
          current[key]?.by === holders[key]!.by &&
          current[key]?.reasonKey === holders[key]!.reasonKey,
      );
    if (!same) ctx.state.update(setLocks, holders as StageLocks);
  };
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
   *
   * `asked` names the settings a caller just set. Each of them lands whenever
   * the live value differs, even if the resolution itself didn't move: a zoom
   * step, a pinch or a zoom box records its level straight into the state, so
   * the resolution can still hold the fit mode the user now asks for again.
   */
  const syncResponsive = (
    react: boolean,
    asked: readonly (keyof StageSettings)[] = [],
  ): SettingEffect => {
    const { effective, active } = resolve();
    const patch: Partial<StageSettings> = {};
    for (const key of SETTING_KEYS) {
      const resolved = !eqSetting(effective[key], lastEffective[key]);
      const reasserted = asked.includes(key) && !eqSetting(effective[key], state()[key]);
      if (resolved || reasserted) Object.assign(patch, { [key]: effective[key] });
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

  const updateSettings = (changes: StageSettingsPatch): void => {
    // Writes the responsive base; the resolver decides what actually lands (a
    // matching rule's key wins until its rule stops matching). With no rules
    // in play this is a direct update.
    base = mergeSettings(base, changes);
    syncResponsive(
      true,
      SETTING_KEYS.filter((key) => changes[key] !== undefined),
    );
  };

  const applyViewState = (view: StageViewState): void => {
    cancelAnimation();
    // A restored view is app-level state: it writes the base, and the rules
    // re-assert on top, so a snapshot saved on a desktop restores compact
    // padding on a phone. One patch carries the full effective result.
    base = mergeSettings(base, pickSettings(view));
    const { effective, active } = resolve();
    lastEffective = effective;
    publishActive(active);
    ctx.state.update(patchSettings, effective);
    ctx.state.update(setCursor, view.cursor ?? 0);
    scene.invalidate();
    applyAnchor(view.anchor);
  };

  /**
   * The settings a saved view keeps: what shows, but the locked ones as they
   * are underneath, so restoring it never writes a lock's value as the user's.
   */
  const viewStateSettings = (): StageSettings => {
    const shown = snapshotSettings();
    if (locks.length === 0) return shown;
    const { effective: unlocked } = resolveResponsive(base, rules, boxOf(viewport()));
    const settings = { ...shown };
    for (const key of Object.keys(state().locks) as (keyof StageSettings)[]) {
      Object.assign(settings, { [key]: unlocked[key] });
    }
    return settings;
  };

  /**
   * Hold `lock.settings` over every other writer until the returned function
   * runs, or the document closes. A setting another lock holds at a different
   * value is refused.
   */
  const lockSettings = (lock: StageSettingsLock): (() => void) => {
    const keys = lockedKeys(lock);
    for (const key of keys) {
      if (!SETTING_KEYS.includes(key)) {
        throw new PluginError('invalid-input', 'stage', `"${key}" is not a Stage setting`);
      }
      if (key === 'zoom') {
        throw new PluginError(
          'invalid-input',
          'stage',
          'the zoom cannot be locked: gestures set it',
        );
      }
      const holder = locks.find((held) => {
        const value = held.settings[key as keyof StageSettingsLock['settings']];
        return (
          value !== undefined && !eqSetting(value, lock.settings[key as keyof typeof lock.settings])
        );
      });
      if (holder) {
        throw new PluginError(
          'conflict',
          'stage',
          `"${key}" is locked by ${holder.by} at another value`,
        );
      }
    }
    const held: StageSettingsLock = { ...lock, settings: { ...lock.settings } };
    locks = [...locks, held];
    publishLocks();
    syncResponsive(true, keys);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      locks = locks.filter((other) => other !== held);
      publishLocks();
      syncResponsive(true, keys);
    };
  };

  return {
    snapshotSettings,
    viewStateSettings,
    syncResponsive,
    updateSettings,
    applyViewState,
    api: {
      getSettings: snapshotSettings,
      resetSettings: () => {
        base = mergeSettings(initialBase, {});
        syncResponsive(true, SETTING_KEYS);
      },
      updateSettings,
      setResponsiveRules: (next) => {
        rules = next;
        syncResponsive(true);
      },
      lockSettings,
      getLock: (setting) => state().locks[setting] ?? null,
      matchesRule: (name) => state().activeRules.includes(name),
      listActiveRules: () => state().activeRules,
      applyViewState,
    } satisfies Partial<StageHostCapability>,
  };
}
export type StageSettingsArea = ReturnType<typeof createSettings>;

/** The settings a lock names a value for. */
const lockedKeys = (lock: StageSettingsLock): (keyof StageSettings)[] =>
  (Object.keys(lock.settings) as (keyof StageSettings)[]).filter(
    (key) => lock.settings[key as keyof StageSettingsLock['settings']] !== undefined,
  );
