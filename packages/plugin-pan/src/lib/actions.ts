import { Action } from '@embedpdf/core';
import { PanDocumentState } from './types';

// Document lifecycle
export const INIT_PAN_STATE = 'PAN/INIT_STATE';
export const CLEANUP_PAN_STATE = 'PAN/CLEANUP_STATE';
export const SET_ACTIVE_PAN_DOCUMENT = 'PAN/SET_ACTIVE_DOCUMENT';

// Pan operations
export const SET_PAN_MODE = 'PAN/SET_PAN_MODE';

// Document lifecycle actions
export interface InitPanStateAction extends Action {
  type: typeof INIT_PAN_STATE;
  payload: {
    documentId: string;
    state: PanDocumentState;
  };
}

export interface CleanupPanStateAction extends Action {
  type: typeof CLEANUP_PAN_STATE;
  payload: string; // documentId
}

export interface SetActivePanDocumentAction extends Action {
  type: typeof SET_ACTIVE_PAN_DOCUMENT;
  payload: string | null; // documentId
}

export interface SetPanModeAction extends Action {
  type: typeof SET_PAN_MODE;
  payload: {
    documentId: string;
    isPanMode: boolean;
  };
}

export type PanAction =
  | InitPanStateAction
  | CleanupPanStateAction
  | SetActivePanDocumentAction
  | SetPanModeAction;

// Action Creators
export function initPanState(documentId: string, state: PanDocumentState): InitPanStateAction {
  return { type: INIT_PAN_STATE, payload: { documentId, state } };
}

export function cleanupPanState(documentId: string): CleanupPanStateAction {
  return { type: CLEANUP_PAN_STATE, payload: documentId };
}

export function setActivePanDocument(documentId: string | null): SetActivePanDocumentAction {
  return { type: SET_ACTIVE_PAN_DOCUMENT, payload: documentId };
}

export function setPanMode(documentId: string, isPanMode: boolean): SetPanModeAction {
  return { type: SET_PAN_MODE, payload: { documentId, isPanMode } };
}
