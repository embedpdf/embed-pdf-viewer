import { Action } from '@embedpdf/core';
import { SpreadMode, SpreadDocumentState } from './types';

// Document lifecycle
export const INIT_SPREAD_STATE = 'SPREAD/INIT_STATE';
export const CLEANUP_SPREAD_STATE = 'SPREAD/CLEANUP_STATE';
export const SET_ACTIVE_SPREAD_DOCUMENT = 'SPREAD/SET_ACTIVE_DOCUMENT';

// Spread operations
export const SET_SPREAD_MODE = 'SPREAD/SET_SPREAD_MODE';

// Document lifecycle actions
export interface InitSpreadStateAction extends Action {
  type: typeof INIT_SPREAD_STATE;
  payload: {
    documentId: string;
    state: SpreadDocumentState;
  };
}

export interface CleanupSpreadStateAction extends Action {
  type: typeof CLEANUP_SPREAD_STATE;
  payload: string; // documentId
}

export interface SetActiveSpreadDocumentAction extends Action {
  type: typeof SET_ACTIVE_SPREAD_DOCUMENT;
  payload: string | null; // documentId
}

export interface SetSpreadModeAction extends Action {
  type: typeof SET_SPREAD_MODE;
  payload: {
    documentId: string;
    spreadMode: SpreadMode;
  };
}

export type SpreadAction =
  | InitSpreadStateAction
  | CleanupSpreadStateAction
  | SetActiveSpreadDocumentAction
  | SetSpreadModeAction;

// Action Creators
export function initSpreadState(
  documentId: string,
  state: SpreadDocumentState,
): InitSpreadStateAction {
  return { type: INIT_SPREAD_STATE, payload: { documentId, state } };
}

export function cleanupSpreadState(documentId: string): CleanupSpreadStateAction {
  return { type: CLEANUP_SPREAD_STATE, payload: documentId };
}

export function setActiveSpreadDocument(documentId: string | null): SetActiveSpreadDocumentAction {
  return { type: SET_ACTIVE_SPREAD_DOCUMENT, payload: documentId };
}

export function setSpreadMode(documentId: string, spreadMode: SpreadMode): SetSpreadModeAction {
  return { type: SET_SPREAD_MODE, payload: { documentId, spreadMode } };
}
