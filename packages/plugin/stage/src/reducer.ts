import { DEFAULT_SETTINGS } from './settings';
import type { StageAction, StageConfig, StageSettings, StageState } from './types';

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
    case 'PATCH':
      return applyPatch(state, a.patch);
    case 'RESPONSIVE':
      return { ...state, activeRules: a.active };
    default:
      return state;
  }
};
