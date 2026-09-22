/**
 * The annotation slice: the core-annotation Model plus the selection-chrome
 * settings, the tool ghost, the stamp arm epoch and the editor's text
 * selection. The pure `update` runs in the store service (which also runs
 * effects); the reducer only stores new state — keeping the kernel store a
 * dumb, serializable container.
 */
import { initialModel } from '@embedpdf/core-annotation';
import type { Model } from '@embedpdf/core-annotation';

import type {
  AnnotationConfig,
  AnnotationHydration,
  ChromeSettings,
  ChromeSettingsPatch,
  ToolGhost,
} from './contract';
import type { TextSelection } from './rich-text';

export interface AnnotationState {
  model: Model;
  hydration: AnnotationHydration;
  chrome: ChromeSettings;
  /**
   * The armed tool's FOOTPRINT ghost: where (and what) the NEXT click would
   * place — the stamp's fitted image box, or a click-create tool's default
   * geometry — computed by the same rules the placement uses (WYSIWYG). In the
   * store (not the capability closure) because it is RENDERED — vector ghosts
   * ride `pageItems`, image ghosts (stamp) render via the framework's
   * `ToolGhost`. The armed bytes stay out of the store.
   */
  toolGhost: ToolGhost | null;
  /** Bumps on every arm/disarm — the render layer's cue to rebuild (or drop)
   *  the ghost preview object URL. Never rendered itself. */
  stampArmEpoch: number;
  /**
   * The text editor's selection inside the annotation being edited (flat
   * offsets over its plain projection), or null. In the store because it is
   * READ by the property surface: while a range is held, the range keys
   * (`getSelectionProps`) report and take the RUNS, not the body.
   */
  textSelection: TextSelection | null;
}

export type AnnotationAction =
  | { type: 'SET_MODEL'; model: Model }
  | { type: 'SET_HYDRATION'; hydration: AnnotationHydration }
  | { type: 'SET_CHROME'; patch: ChromeSettingsPatch }
  | { type: 'SET_TOOL_GHOST'; ghost: ToolGhost | null }
  | { type: 'SET_TEXT_SELECTION'; selection: TextSelection | null }
  | { type: 'STAMP_ARM_CHANGED' };

/**
 * Out-of-the-box selection chrome — a sensible document-annotation feel. Every
 * length is CSS px (screen-constant across zoom); every color falls back to
 * `accent`. Just defaults: override any field at registration
 * (`annotationPlugin({ chrome })`) or at runtime (`setChrome`).
 */
export const DEFAULT_CHROME: ChromeSettings = {
  accent: '#3858e9',
  // Solid, like the shape's own resting look — one style at rest AND rotated.
  outline: { style: 'solid', width: 1 },
  // 8px squares to look at, 24px to grab (touch-friendly without visual bulk).
  handles: { size: 8, hitSize: 24, fill: '#ffffff' },
  knob: { size: 10, hitSize: 24, offset: 32, stalk: true, fill: '#ffffff' },
  // Faint reference cross, prominent live indicator (v2 feel).
  guides: { enabled: true, style: 'solid', width: 1, axisOpacity: 0.35, indicatorOpacity: 0.8 },
};

/** Deep-partial merge of a chrome patch — one level per piece, like the
 *  stage-settings convention (align pairs / pageFrame). */
export const mergeChrome = (base: ChromeSettings, patch: ChromeSettingsPatch): ChromeSettings => ({
  accent: patch.accent ?? base.accent,
  outline: { ...base.outline, ...patch.outline },
  handles: { ...base.handles, ...patch.handles },
  knob: { ...base.knob, ...patch.knob },
  guides: { ...base.guides, ...patch.guides },
});

/**
 * The slice holds the annotation-core Model + the selection-chrome settings.
 * The pure `update` runs in the capability (the shell, which also performs
 * effects); the reducer only stores new state — keeping the kernel store a
 * dumb, serializable container. The registration config seeds the model's
 * snap settings and the chrome.
 */
export const initialAnnotationState = (config: AnnotationConfig = {}): AnnotationState => ({
  model: { ...initialModel, snap: { ...initialModel.snap, ...config.snap } },
  hydration: { status: 'loading' },
  chrome: mergeChrome(DEFAULT_CHROME, config.chrome ?? {}),
  toolGhost: null,
  stampArmEpoch: 0,
  textSelection: null,
});

export const annotationReducer = (
  state: AnnotationState,
  action: AnnotationAction,
): AnnotationState => {
  switch (action.type) {
    case 'SET_MODEL':
      return { ...state, model: action.model };
    case 'SET_HYDRATION':
      return { ...state, hydration: action.hydration };
    case 'SET_CHROME':
      return { ...state, chrome: mergeChrome(state.chrome, action.patch) };
    case 'SET_TOOL_GHOST':
      return { ...state, toolGhost: action.ghost };
    case 'SET_TEXT_SELECTION':
      return { ...state, textSelection: action.selection };
    case 'STAMP_ARM_CHANGED':
      // A new (or dropped) payload invalidates any ghost drawn for the old one.
      return { ...state, stampArmEpoch: state.stampArmEpoch + 1, toolGhost: null };
    default:
      return state;
  }
};
