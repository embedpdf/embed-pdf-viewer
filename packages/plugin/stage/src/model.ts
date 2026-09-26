/** The stage slice: the flat settings bag plus the camera, viewport, cursor
 *  and the render-commit latch. Pure — every transition is here; nothing
 *  else mutates stage state. */
import type { Camera, Size } from '@embedpdf/core-stage';

import type { StageConfig, StageSettings } from './contract';
import { DEFAULT_SETTINGS } from './settings';

export interface StageState extends StageSettings {
  camera: Camera;
  /**
   * One-way render-commit latch. False while the initial viewport-driven
   * placement is unresolved; true only after its camera/settings writes have
   * completed. Page/scroll screen-space selectors refuse to answer while
   * false, so an adapter can never paint the placeholder camera at the origin.
   */
  placed: boolean;
  /**
   * Names of the responsive rules currently matching the box, in source order.
   * State (not derived) so `matches()` is reactive through the ordinary
   * selector machinery in every framework.
   */
  activeRules: readonly string[];
  /**
   * False while the ZOOM is in motion, true once it has rested (~150ms of
   * frames without a zoom write). Device-snapping of page origins is gated
   * on this: a continuous zoom and a snapped origin cannot coexist without
   * the anchor point jittering ±0.5 device px per step (the rounding lands
   * differently every frame), so pages place fractionally while zooming and
   * snap once at rest — when crispness actually matters. Pans always snap
   * (a pure translation snap has no anchor error). Transient like `camera`.
   */
  cameraResting: boolean;
  vp: Size;
  /**
   * Device pixels per view pixel (web: `window.devicePixelRatio`). Reported by
   * the shell like the viewport; feeds each page's transform so bitmaps render
   * crisp (exact device px) and boxes land on the device grid. Defaults to 1.
   */
  dpr: number;
  /**
   * The current page — transient like `camera` (NOT a setting), valid in BOTH flows.
   * Navigation sets it; in continuous flow scrolling syncs it from the camera; in
   * paged flow panning never moves it (the scene is a one-item slice at this page).
   * Stored as a page index so it survives spread/layout regrouping.
   */
  cursor: number;
  /**
   * What last drove the camera/cursor: `'programmatic'` for the arrival and
   * reveal doors (goToPage/next/prev/reset/reveal — the doors action
   * executors use), `'user'` for direct camera manipulation (wheel, drag,
   * scrollbars, embedder scroll APIs). Transient like `camera`. Consumed by
   * the page-state feed as the action engine's cascade-budget fuel: only
   * programmatic rounds burn budget, so user scrolling never starves.
   */
  motionCause: 'user' | 'programmatic';
}

export type StageAction =
  | { type: 'CAMERA'; camera: Camera }
  | { type: 'CAMERA_REST'; resting: boolean }
  | { type: 'PLACED' }
  | { type: 'VP'; vp: Size }
  | { type: 'DPR'; dpr: number }
  | { type: 'CURSOR'; cursor: number }
  | { type: 'MOTION_CAUSE'; cause: 'user' | 'programmatic' }
  | { type: 'PATCH'; patch: Partial<StageSettings> }
  | { type: 'RESPONSIVE'; active: readonly string[] };

export const initialStageState = (config: StageConfig): StageState => {
  // `scheduler` and `responsive` are capability config, not settings — strip
  // them so the spread below stays a pure settings override.
  const { scheduler: _scheduler, responsive: _responsive, ...overrides } = config;
  return {
    camera: { x: 0, y: 0, zoom: 1 },
    placed: false,
    cameraResting: true,
    vp: { width: 0, height: 0 },
    dpr: 1,
    cursor: 0,
    motionCause: 'user',
    activeRules: [],
    ...DEFAULT_SETTINGS,
    ...overrides, // config overrides any default; the rest fall back to DEFAULT_SETTINGS
  };
};

/** Merge a settings patch, ignoring undefined values (safe for partial restores). */
const applyPatch = (state: StageState, patch: Partial<StageSettings>): StageState => {
  const next: StageState = { ...state };
  let key: keyof StageSettings;
  for (key in patch) {
    const value = patch[key];
    if (value !== undefined) Object.assign(next, { [key]: value });
  }
  return next;
};

/**
 * Pure. Every transition is here; nothing else mutates Stage state. Settings are a
 * flat bag of primitives — one PATCH action sets any subset (the capability decides
 * what camera follow-up, if any, each change needs).
 */
export const stageReducer = (state: StageState, a: StageAction): StageState => {
  switch (a.type) {
    case 'CAMERA':
      return { ...state, camera: a.camera };
    case 'CAMERA_REST':
      return state.cameraResting === a.resting ? state : { ...state, cameraResting: a.resting };
    case 'PLACED':
      return state.placed ? state : { ...state, placed: true };
    case 'VP':
      return { ...state, vp: a.vp };
    case 'DPR':
      return { ...state, dpr: a.dpr };
    case 'CURSOR':
      return { ...state, cursor: a.cursor };
    case 'MOTION_CAUSE':
      return { ...state, motionCause: a.cause };
    case 'PATCH':
      return applyPatch(state, a.patch);
    case 'RESPONSIVE':
      return { ...state, activeRules: a.active };
    default:
      return state;
  }
};
