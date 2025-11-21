import { Action } from '@embedpdf/core';
import { RedactionItem, RedactionMode, RedactionDocumentState } from './types';

// Document lifecycle
export const INIT_REDACTION_STATE = 'REDACTION/INIT_STATE';
export const CLEANUP_REDACTION_STATE = 'REDACTION/CLEANUP_STATE';
export const SET_ACTIVE_DOCUMENT = 'REDACTION/SET_ACTIVE_DOCUMENT';

// Per-document redaction operations
export const START_REDACTION = 'START_REDACTION';
export const END_REDACTION = 'END_REDACTION';
export const SET_ACTIVE_TYPE = 'SET_ACTIVE_TYPE';

export const ADD_PENDING = 'ADD_PENDING';
export const REMOVE_PENDING = 'REMOVE_PENDING';
export const CLEAR_PENDING = 'CLEAR_PENDING';

export const SELECT_PENDING = 'SELECT_PENDING';
export const DESELECT_PENDING = 'DESELECT_PENDING';

// Document lifecycle actions
export interface InitRedactionStateAction extends Action {
  type: typeof INIT_REDACTION_STATE;
  payload: {
    documentId: string;
    state: RedactionDocumentState;
  };
}

export interface CleanupRedactionStateAction extends Action {
  type: typeof CLEANUP_REDACTION_STATE;
  payload: string; // documentId
}

export interface SetActiveDocumentAction extends Action {
  type: typeof SET_ACTIVE_DOCUMENT;
  payload: string | null; // documentId
}

// Per-document operation actions
export interface StartRedactionAction extends Action {
  type: typeof START_REDACTION;
  payload: {
    documentId: string;
    mode: RedactionMode;
  };
}

export interface EndRedactionAction extends Action {
  type: typeof END_REDACTION;
  payload: string; // documentId
}

export interface SetActiveTypeAction extends Action {
  type: typeof SET_ACTIVE_TYPE;
  payload: {
    documentId: string;
    mode: RedactionMode | null;
  };
}

export interface AddPendingAction extends Action {
  type: typeof ADD_PENDING;
  payload: {
    documentId: string;
    items: RedactionItem[];
  };
}

export interface RemovePendingAction extends Action {
  type: typeof REMOVE_PENDING;
  payload: {
    documentId: string;
    page: number;
    id: string;
  };
}

export interface ClearPendingAction extends Action {
  type: typeof CLEAR_PENDING;
  payload: string; // documentId
}

export interface SelectPendingAction extends Action {
  type: typeof SELECT_PENDING;
  payload: {
    documentId: string;
    page: number;
    id: string;
  };
}

export interface DeselectPendingAction extends Action {
  type: typeof DESELECT_PENDING;
  payload: string; // documentId
}

export type RedactionAction =
  | InitRedactionStateAction
  | CleanupRedactionStateAction
  | SetActiveDocumentAction
  | StartRedactionAction
  | EndRedactionAction
  | SetActiveTypeAction
  | AddPendingAction
  | RemovePendingAction
  | ClearPendingAction
  | SelectPendingAction
  | DeselectPendingAction;

// Action Creators

export function initRedactionState(
  documentId: string,
  state: RedactionDocumentState,
): InitRedactionStateAction {
  return { type: INIT_REDACTION_STATE, payload: { documentId, state } };
}

export function cleanupRedactionState(documentId: string): CleanupRedactionStateAction {
  return { type: CLEANUP_REDACTION_STATE, payload: documentId };
}

export function setActiveDocument(documentId: string | null): SetActiveDocumentAction {
  return { type: SET_ACTIVE_DOCUMENT, payload: documentId };
}

export const addPending = (documentId: string, items: RedactionItem[]): AddPendingAction => ({
  type: ADD_PENDING,
  payload: { documentId, items },
});

export const removePending = (
  documentId: string,
  page: number,
  id: string,
): RemovePendingAction => ({
  type: REMOVE_PENDING,
  payload: { documentId, page, id },
});

export const clearPending = (documentId: string): ClearPendingAction => ({
  type: CLEAR_PENDING,
  payload: documentId,
});

export const startRedaction = (documentId: string, mode: RedactionMode): StartRedactionAction => ({
  type: START_REDACTION,
  payload: { documentId, mode },
});

export const endRedaction = (documentId: string): EndRedactionAction => ({
  type: END_REDACTION,
  payload: documentId,
});

export const setActiveType = (
  documentId: string,
  mode: RedactionMode | null,
): SetActiveTypeAction => ({
  type: SET_ACTIVE_TYPE,
  payload: { documentId, mode },
});

export const selectPending = (
  documentId: string,
  page: number,
  id: string,
): SelectPendingAction => ({
  type: SELECT_PENDING,
  payload: { documentId, page, id },
});

export const deselectPending = (documentId: string): DeselectPendingAction => ({
  type: DESELECT_PENDING,
  payload: documentId,
});
