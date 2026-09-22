/**
 * The annotation plugin's state: the core model plus the selection chrome
 * settings, the tool ghost and the text editor's selection. The core's pure
 * `update` runs in the store service (which also runs its effects); the
 * transitions below only store results.
 */
import { initialModel } from '@embedpdf/core-annotation';
import type { Model } from '@embedpdf/core-annotation';

import type {
  AnnotationConfig,
  ChromeSettings,
  ChromeSettingsPatch,
  ToolGhost,
} from './contract';
import type { TextSelection } from './rich-text';

export interface AnnotationState {
  /** The core model: records (confirmed plus optimistic), selection, drafts and settings. */
  readonly model: Model;
  readonly chrome: ChromeSettings;
  /**
   * The armed tool's footprint ghost: where, and what, the next click would
   * place (a stamp's fitted image box, or a click-create tool's default
   * geometry), computed by the same rules placement uses. It is state
   * because it is rendered: vector ghosts ride `pageItems`, image ghosts
   * render through the framework's `ToolGhost`. The armed bytes stay out of state.
   */
  readonly toolGhost: ToolGhost | null;
  /**
   * The text editor's selection inside the annotation being edited (flat
   * offsets over its plain text), or null. It is state because the property
   * surface reads it: while a range is held, the text style keys report and
   * change the runs, not the whole body.
   */
  readonly textSelection: TextSelection | null;
}

/**
 * Out-of-the-box selection chrome — a sensible document-annotation feel. Every
 * length is CSS px (screen-constant across zoom); every color falls back to
 * `accent`. Just defaults: override any field at registration
 * (`annotationPlugin({ chrome })`) or at runtime (`setChrome`).
 */
export const DEFAULT_CHROME: ChromeSettings = {
  accent: '#3858e9',
  // Solid, like the shape's own resting look — one style at rest and rotated.
  outline: { style: 'solid', width: 1 },
  // 8px squares to look at, 24px to grab (touch-friendly without visual bulk).
  handles: { size: 8, hitSize: 24, fill: '#ffffff' },
  knob: { size: 10, hitSize: 24, offset: 32, stalk: true, fill: '#ffffff' },
  // A faint reference cross and a prominent live indicator.
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

/** The initial state; the registration config seeds the model's snapping and the chrome. */
export const initialAnnotationState = (config: AnnotationConfig = {}): AnnotationState => ({
  model: { ...initialModel, snap: { ...initialModel.snap, ...config.snap } },
  chrome: mergeChrome(DEFAULT_CHROME, config.chrome ?? {}),
  toolGhost: null,
  textSelection: null,
});

export const setModel = (state: AnnotationState, model: Model): AnnotationState =>
  state.model === model ? state : { ...state, model };

export const patchChrome = (state: AnnotationState, patch: ChromeSettingsPatch): AnnotationState => ({
  ...state,
  chrome: mergeChrome(state.chrome, patch),
});

export const setToolGhost = (state: AnnotationState, toolGhost: ToolGhost | null): AnnotationState =>
  state.toolGhost === toolGhost ? state : { ...state, toolGhost };

export const setTextSelection = (
  state: AnnotationState,
  textSelection: TextSelection | null,
): AnnotationState =>
  state.textSelection === textSelection ? state : { ...state, textSelection };
