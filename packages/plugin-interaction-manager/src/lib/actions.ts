import { Action } from '@embedpdf/core';
import { InteractionExclusionRules } from './types';

export const ACTIVATE_MODE = 'INTERACTION/ACTIVATE_MODE';
export const PAUSE_INTERACTION = 'INTERACTION/PAUSE';
export const RESUME_INTERACTION = 'INTERACTION/RESUME';
export const SET_CURSOR = 'INTERACTION/SET_CURSOR';
export const SET_DEFAULT_MODE = 'INTERACTION/SET_DEFAULT_MODE';
export const SET_EXCLUSION_RULES = 'INTERACTION/SET_EXCLUSION_RULES';
export const ADD_EXCLUSION_CLASS = 'INTERACTION/ADD_EXCLUSION_CLASS';
export const REMOVE_EXCLUSION_CLASS = 'INTERACTION/REMOVE_EXCLUSION_CLASS';
export const ADD_EXCLUSION_ATTRIBUTE = 'INTERACTION/ADD_EXCLUSION_ATTRIBUTE';
export const REMOVE_EXCLUSION_ATTRIBUTE = 'INTERACTION/REMOVE_EXCLUSION_ATTRIBUTE';

export interface SetExclusionRulesAction extends Action {
  type: typeof SET_EXCLUSION_RULES;
  payload: { rules: InteractionExclusionRules };
}

export interface AddExclusionClassAction extends Action {
  type: typeof ADD_EXCLUSION_CLASS;
  payload: { className: string };
}

export interface RemoveExclusionClassAction extends Action {
  type: typeof REMOVE_EXCLUSION_CLASS;
  payload: { className: string };
}

export interface AddExclusionAttributeAction extends Action {
  type: typeof ADD_EXCLUSION_ATTRIBUTE;
  payload: { attribute: string };
}

export interface RemoveExclusionAttributeAction extends Action {
  type: typeof REMOVE_EXCLUSION_ATTRIBUTE;
  payload: { attribute: string };
}

export interface ActivateModeAction extends Action {
  type: typeof ACTIVATE_MODE;
  payload: { mode: string };
}

export interface PauseInteractionAction extends Action {
  type: typeof PAUSE_INTERACTION;
}

export interface ResumeInteractionAction extends Action {
  type: typeof RESUME_INTERACTION;
}

export interface SetCursorAction extends Action {
  type: typeof SET_CURSOR;
  payload: { cursor: string };
}

export interface SetDefaultModeAction extends Action {
  type: typeof SET_DEFAULT_MODE;
  payload: { mode: string };
}

export const setExclusionRules = (rules: InteractionExclusionRules): SetExclusionRulesAction => ({
  type: SET_EXCLUSION_RULES,
  payload: { rules },
});

export const addExclusionClass = (className: string): AddExclusionClassAction => ({
  type: ADD_EXCLUSION_CLASS,
  payload: { className },
});

export const removeExclusionClass = (className: string): RemoveExclusionClassAction => ({
  type: REMOVE_EXCLUSION_CLASS,
  payload: { className },
});

export const addExclusionAttribute = (attribute: string): AddExclusionAttributeAction => ({
  type: ADD_EXCLUSION_ATTRIBUTE,
  payload: { attribute },
});

export const removeExclusionAttribute = (attribute: string): RemoveExclusionAttributeAction => ({
  type: REMOVE_EXCLUSION_ATTRIBUTE,
  payload: { attribute },
});

export const activateMode = (mode: string): ActivateModeAction => ({
  type: ACTIVATE_MODE,
  payload: { mode },
});

export const setCursor = (cursor: string): SetCursorAction => ({
  type: SET_CURSOR,
  payload: { cursor },
});

export const setDefaultMode = (mode: string): SetDefaultModeAction => ({
  type: SET_DEFAULT_MODE,
  payload: { mode },
});

export const pauseInteraction = (): PauseInteractionAction => ({
  type: PAUSE_INTERACTION,
});

export const resumeInteraction = (): ResumeInteractionAction => ({
  type: RESUME_INTERACTION,
});

export type InteractionManagerAction =
  | SetExclusionRulesAction
  | AddExclusionClassAction
  | RemoveExclusionClassAction
  | AddExclusionAttributeAction
  | RemoveExclusionAttributeAction
  | ActivateModeAction
  | PauseInteractionAction
  | ResumeInteractionAction
  | SetCursorAction
  | SetDefaultModeAction;
