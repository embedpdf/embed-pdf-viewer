import { Action } from '@embedpdf/core';
import { InteractionExclusionRules, InteractionDocumentState } from './types';

// Document lifecycle
export const INIT_INTERACTION_STATE = 'INTERACTION/INIT_STATE';
export const CLEANUP_INTERACTION_STATE = 'INTERACTION/CLEANUP_STATE';

// Per-document actions
export const ACTIVATE_MODE = 'INTERACTION/ACTIVATE_MODE';
export const PAUSE_INTERACTION = 'INTERACTION/PAUSE';
export const RESUME_INTERACTION = 'INTERACTION/RESUME';
export const SET_CURSOR = 'INTERACTION/SET_CURSOR';
export const SET_ACTIVE_DOCUMENT = 'INTERACTION/SET_ACTIVE_DOCUMENT';

// Global actions
export const SET_DEFAULT_MODE = 'INTERACTION/SET_DEFAULT_MODE';
export const SET_EXCLUSION_RULES = 'INTERACTION/SET_EXCLUSION_RULES';
export const ADD_EXCLUSION_CLASS = 'INTERACTION/ADD_EXCLUSION_CLASS';
export const REMOVE_EXCLUSION_CLASS = 'INTERACTION/REMOVE_EXCLUSION_CLASS';
export const ADD_EXCLUSION_ATTRIBUTE = 'INTERACTION/ADD_EXCLUSION_ATTRIBUTE';
export const REMOVE_EXCLUSION_ATTRIBUTE = 'INTERACTION/REMOVE_EXCLUSION_ATTRIBUTE';

// Document lifecycle actions
export interface InitInteractionStateAction extends Action {
  type: typeof INIT_INTERACTION_STATE;
  payload: {
    documentId: string;
    state: InteractionDocumentState;
  };
}

export interface CleanupInteractionStateAction extends Action {
  type: typeof CLEANUP_INTERACTION_STATE;
  payload: string; // documentId
}

export interface SetActiveDocumentAction extends Action {
  type: typeof SET_ACTIVE_DOCUMENT;
  payload: string | null; // documentId
}

// Per-document actions
export interface ActivateModeAction extends Action {
  type: typeof ACTIVATE_MODE;
  payload: {
    documentId: string;
    mode: string;
  };
}

export interface PauseInteractionAction extends Action {
  type: typeof PAUSE_INTERACTION;
  payload: string; // documentId
}

export interface ResumeInteractionAction extends Action {
  type: typeof RESUME_INTERACTION;
  payload: string; // documentId
}

export interface SetCursorAction extends Action {
  type: typeof SET_CURSOR;
  payload: {
    documentId: string;
    cursor: string;
  };
}

// Global actions
export interface SetDefaultModeAction extends Action {
  type: typeof SET_DEFAULT_MODE;
  payload: { mode: string };
}

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

export type InteractionManagerAction =
  | InitInteractionStateAction
  | CleanupInteractionStateAction
  | SetActiveDocumentAction
  | ActivateModeAction
  | PauseInteractionAction
  | ResumeInteractionAction
  | SetCursorAction
  | SetDefaultModeAction
  | SetExclusionRulesAction
  | AddExclusionClassAction
  | RemoveExclusionClassAction
  | AddExclusionAttributeAction
  | RemoveExclusionAttributeAction;

// Action creators
export function initInteractionState(
  documentId: string,
  state: InteractionDocumentState,
): InitInteractionStateAction {
  return { type: INIT_INTERACTION_STATE, payload: { documentId, state } };
}

export function cleanupInteractionState(documentId: string): CleanupInteractionStateAction {
  return { type: CLEANUP_INTERACTION_STATE, payload: documentId };
}

export function setActiveDocument(documentId: string | null): SetActiveDocumentAction {
  return { type: SET_ACTIVE_DOCUMENT, payload: documentId };
}

export function activateMode(documentId: string, mode: string): ActivateModeAction {
  return { type: ACTIVATE_MODE, payload: { documentId, mode } };
}

export function pauseInteraction(documentId: string): PauseInteractionAction {
  return { type: PAUSE_INTERACTION, payload: documentId };
}

export function resumeInteraction(documentId: string): ResumeInteractionAction {
  return { type: RESUME_INTERACTION, payload: documentId };
}

export function setCursor(documentId: string, cursor: string): SetCursorAction {
  return { type: SET_CURSOR, payload: { documentId, cursor } };
}

export function setDefaultMode(mode: string): SetDefaultModeAction {
  return { type: SET_DEFAULT_MODE, payload: { mode } };
}

export function setExclusionRules(rules: InteractionExclusionRules): SetExclusionRulesAction {
  return { type: SET_EXCLUSION_RULES, payload: { rules } };
}

export function addExclusionClass(className: string): AddExclusionClassAction {
  return { type: ADD_EXCLUSION_CLASS, payload: { className } };
}

export function removeExclusionClass(className: string): RemoveExclusionClassAction {
  return { type: REMOVE_EXCLUSION_CLASS, payload: { className } };
}

export function addExclusionAttribute(attribute: string): AddExclusionAttributeAction {
  return { type: ADD_EXCLUSION_ATTRIBUTE, payload: { attribute } };
}

export function removeExclusionAttribute(attribute: string): RemoveExclusionAttributeAction {
  return { type: REMOVE_EXCLUSION_ATTRIBUTE, payload: { attribute } };
}
