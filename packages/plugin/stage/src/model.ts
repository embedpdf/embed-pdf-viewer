/**
 * The stage's session state: the flat settings bag plus the camera, the
 * viewport, the cursor and the render-commit latch. Every function below is a
 * pure transition; the controller's areas apply them with `ctx.state.update`,
 * and nothing else changes stage state.
 */
import type { Camera, Size } from '@embedpdf/core-stage';

import type { StageConfig, StageSettings } from './contract';
import { DEFAULT_SETTINGS } from './settings';

export interface StageState extends StageSettings {
  readonly camera: Camera;
  /**
   * One-way render-commit latch. False while the initial viewport-driven
   * placement is unresolved; true only after its camera and settings writes
   * have completed. Page and scroll screen-space reads refuse to answer while
   * false, so an adapter can never paint the placeholder camera at the origin.
   */
  readonly placed: boolean;
  /**
   * Names of the responsive rules currently matching the box, in source order.
   * State (not derived) so `matchesRule()` is reactive in every framework.
   */
  readonly activeRules: readonly string[];
  /**
   * False while the zoom is in motion, true once it has rested (about 150 ms
   * of frames without a zoom write). Device-snapping of page origins is gated
   * on this: a continuous zoom and a snapped origin cannot coexist without the
   * anchor point jittering ±0.5 device px per step, so pages place
   * fractionally while zooming and snap once at rest. Pans always snap (a pure
   * translation has no anchor error).
   */
  readonly cameraResting: boolean;
  /** The container size the host reported, in viewport px. */
  readonly viewport: Size;
  /**
   * Device pixels per view pixel (web: `window.devicePixelRatio`). Feeds each
   * page's transform so bitmaps render crisp and boxes land on the device
   * grid. Defaults to 1.
   */
  readonly dpr: number;
  /**
   * The current page index, valid in both flows. Navigation sets it; in
   * continuous flow manipulation derives it from the camera; in paged flow
   * panning never moves it (the scene is a one-item slice at this page).
   * An index, so it survives spread and layout regrouping.
   */
  readonly cursor: number;
  /**
   * What last drove the camera or cursor: `'programmatic'` for the arrival
   * and reveal verbs (the ones action executors use), `'user'` for direct
   * manipulation (wheel, drag, scrollbars, embedder scroll calls). The
   * page-state feed hands it to the actions plugin, whose cascade budget
   * counts only programmatic rounds, so user scrolling is never throttled.
   */
  readonly motionCause: 'user' | 'programmatic';
}

export const initialStageState = (config: StageConfig): StageState => {
  // `scheduler` and `responsive` configure the capability, not the settings:
  // strip them so the spread below stays a pure settings override.
  const { scheduler: _scheduler, responsive: _responsive, ...overrides } = config;
  return {
    camera: { x: 0, y: 0, zoom: 1 },
    placed: false,
    cameraResting: true,
    viewport: { width: 0, height: 0 },
    dpr: 1,
    cursor: 0,
    motionCause: 'user',
    activeRules: [],
    ...DEFAULT_SETTINGS,
    ...overrides,
  };
};

export const setCamera = (state: StageState, camera: Camera): StageState =>
  state.camera === camera ? state : { ...state, camera };

export const setCameraResting = (state: StageState, resting: boolean): StageState =>
  state.cameraResting === resting ? state : { ...state, cameraResting: resting };

export const markPlaced = (state: StageState): StageState =>
  state.placed ? state : { ...state, placed: true };

export const setViewport = (state: StageState, viewport: Size): StageState =>
  state.viewport === viewport ? state : { ...state, viewport };

export const setDpr = (state: StageState, dpr: number): StageState =>
  state.dpr === dpr ? state : { ...state, dpr };

export const setCursor = (state: StageState, cursor: number): StageState =>
  state.cursor === cursor ? state : { ...state, cursor };

export const setMotionCause = (
  state: StageState,
  motionCause: StageState['motionCause'],
): StageState => (state.motionCause === motionCause ? state : { ...state, motionCause });

/**
 * Merge a settings patch. Undefined values are skipped, so a partial restore
 * never clears a setting; the area that patches decides what camera
 * follow-up the change needs.
 */
export function patchSettings(state: StageState, patch: Partial<StageSettings>): StageState {
  let next = state;
  let key: keyof StageSettings;
  for (key in patch) {
    const value = patch[key];
    if (value === undefined || Object.is(next[key], value)) continue;
    if (next === state) next = { ...state };
    Object.assign(next, { [key]: value });
  }
  return next;
}

export const setActiveRules = (state: StageState, activeRules: readonly string[]): StageState =>
  state.activeRules === activeRules ? state : { ...state, activeRules };
