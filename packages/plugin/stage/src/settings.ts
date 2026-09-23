import { ZoomMode } from '@embedpdf/core-stage';
import type { ResponsiveRule, StageSettings } from './contract';
import { eqSetting } from './responsive';

/**
 * Out-of-the-box defaults: a document-reading feel. Every field is overridable
 * in `stagePlugin(config)` and at runtime through the setters and
 * `updateSettings()`. The plugin ships no named presets ("document",
 * "canvas", …): a preset is an object the app keeps and passes to
 * `updateSettings()`, so that taxonomy stays the app's concern.
 */
export const DEFAULT_SETTINGS: StageSettings = {
  flow: 'continuous',
  layout: 'vertical',
  spread: 'none',
  sizing: 'intrinsic',
  columns: 'square',
  bounded: true,
  padding: 24,
  gap: 16,
  pageFrame: { top: 0, right: 0, bottom: 0, left: 0 },
  direction: 'ltr',
  fitAlign: { x: 'center', y: 'center' },
  // The reading defaults: navigation lands at the top and reading start at
  // every zoom, button zoom inflates around the middle, and resizes pin the
  // top (the browser scroll model). Construction and presentation apps set
  // all of these to center/center.
  arrivalAlign: { x: 'start', y: 'start' },
  zoomAlign: { x: 'center', y: 'center' },
  anchorAlign: { x: 'start', y: 'start' },
  viewRotation: 0,
  zoom: { mode: ZoomMode.Automatic },
  scrollBehavior: 'smooth',
  // Web: 1 PDF point = 96/72 CSS px, so 100% is physically accurate. A native
  // adapter overrides this at registration with its own logical-unit factor.
  viewUnitsPerPoint: 96 / 72,
};

/**
 * Out-of-the-box responsive rules, the platform feel with zero configuration:
 * a compact container gets the thin gutter phones use (space, not device: an
 * embedded 500px pane on a desktop is compact too). Override the whole list
 * with `stagePlugin({ responsive: [...] })`; `responsive: []` opts out. The
 * 'compact' name is queryable by the app through `stage.matchesRule('compact')`.
 */
export const DEFAULT_RESPONSIVE: readonly ResponsiveRule[] = [
  { name: 'compact', when: { maxWidth: 600 }, settings: { padding: 4 } },
];

/**
 * How a change to each setting affects the view: the single source of truth.
 * One row per setting, completeness enforced by the compiler (`Record<keyof
 * StageSettings, …>`: adding a setting without classifying it is a type error).
 * Everything else derives from this table: the scene-cache invalidation and
 * key, `updateSettings()`'s reaction, the settings snapshot and patch picks,
 * and the React selector equality.
 *
 *   'reflow'  — crosses the flow boundary: camera coordinates are meaningless
 *               there, so re-place canonically onto the cursor's page.
 *   'scene'   — a layout input: invalidates the scene, then re-applies the anchor.
 *   'refit'   — re-resolves zoom against the (possibly re-keyed) scene: re-applies
 *               the anchor without an explicit invalidation.
 *   'reclamp' — pure clamp policy: re-clamp the current camera in place.
 *   'none'    — guides future verbs only (arrival/zoom/anchor alignment,
 *               scroll behavior).
 *
 * The classes also carry each change's invariant — what stays fixed while the
 * view reacts: 'refit' (a zoom-intent change) holds the zoomAlign focal point;
 * 'scene' reframes (and viewport resizes) hold the anchorAlign point.
 */
export type SettingEffect = 'reflow' | 'scene' | 'refit' | 'reclamp' | 'none';
export const SETTINGS_EFFECT: Record<keyof StageSettings, SettingEffect> = {
  flow: 'reflow',
  layout: 'scene',
  spread: 'scene',
  sizing: 'scene',
  columns: 'scene',
  bounded: 'reclamp',
  padding: 'reclamp',
  gap: 'scene',
  pageFrame: 'scene',
  direction: 'scene',
  fitAlign: 'reclamp',
  arrivalAlign: 'none',
  zoomAlign: 'none',
  anchorAlign: 'none',
  viewRotation: 'scene', // a layout input: every page's footprint swaps w↔h
  zoom: 'refit',
  scrollBehavior: 'none',
  viewUnitsPerPoint: 'scene', // a layout input: changing it resizes every page
};
export const SETTING_KEYS = Object.keys(SETTINGS_EFFECT) as Array<keyof StageSettings>;

/** Field-by-field settings equality, derived from the registry, so a new
 *  setting is covered automatically (the React `useStageSettings` equality). */
export const settingsEqual = (left: StageSettings, right: StageSettings): boolean =>
  SETTING_KEYS.every((key) => eqSetting(left[key], right[key]));

/** The settings slice of a larger object (state, or a saved view), derived
 *  from the registry so the shape is never spelled out by hand. */
export const pickSettings = (source: StageSettings): StageSettings => {
  const settings: Partial<Record<keyof StageSettings, unknown>> = {};
  for (const key of SETTING_KEYS) settings[key] = source[key];
  return settings as StageSettings;
};
