import { ZoomMode } from '@embedpdf/core-stage';
import type { StageSettings } from './types';

/**
 * Out-of-the-box defaults — a sensible document-reading feel. They are JUST
 * defaults: every field is overridable in `stagePlugin(config)` and at runtime via
 * the setters / `update()`. The plugin ships NO named presets ("document",
 * "canvas", …) — a preset is simply an object the app keeps and passes to
 * `update()`, so that taxonomy stays a customer concern.
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
  // The reading defaults: navigation lands top/reading-start at every zoom
  // (v2 parity), button-zoom inflates around the middle, resizes pin the top
  // (the browser scroll model). Construction/presentation apps set all four
  // to center/center.
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
 * How a CHANGE to each setting affects the view — THE single source of truth.
 * One row per setting, completeness enforced by the compiler (`Record<keyof
 * StageSettings, …>`: adding a setting without classifying it is a type error).
 * Everything else derives from this table: the scene-cache invalidation and key,
 * `update()`'s reaction, the settings snapshot/patch picks, and the React
 * selector equality.
 *
 *   'reflow'  — crosses the flow boundary: camera coordinates are meaningless
 *               there, so re-place canonically onto the cursor's page.
 *   'scene'   — a LAYOUT INPUT: invalidates the scene, then re-applies the anchor.
 *   'refit'   — re-resolves zoom against the (possibly re-keyed) scene: re-applies
 *               the anchor without an explicit invalidation.
 *   'reclamp' — pure clamp policy: re-clamp the current camera in place.
 *   'none'    — guides future verbs only (arrival/zoom/anchor alignment,
 *               scroll behavior).
 *
 * The classes also carry each change's INVARIANT — what stays fixed while the
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

// Settings values are primitives or one-level objects (align pairs, pageFrame,
// gap { px }, zoom intents) — one level of structural equality covers them all.
const valueEq = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  return (
    ka.length === Object.keys(b).length &&
    ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k])
  );
};
/** Field-by-field settings equality, derived from the registry — a new setting is
 *  covered automatically. (The React `useStageSettings` selector equality.) */
export const settingsEqual = (a: StageSettings, b: StageSettings): boolean =>
  SETTING_KEYS.every((k) => valueEq(a[k], b[k]));
