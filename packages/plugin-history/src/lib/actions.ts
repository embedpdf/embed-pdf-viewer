import { Action } from '@embedpdf/core';
import { HistoryDocumentState } from './types';

// Document lifecycle actions
export const INIT_HISTORY_STATE = 'HISTORY/INIT_STATE';
export const CLEANUP_HISTORY_STATE = 'HISTORY/CLEANUP_STATE';

// History state updates
export const SET_HISTORY_DOCUMENT_STATE = 'HISTORY/SET_DOCUMENT_STATE';
export const SET_ACTIVE_HISTORY_DOCUMENT = 'HISTORY/SET_ACTIVE_DOCUMENT';

// Document lifecycle action interfaces
export interface InitHistoryStateAction extends Action {
  type: typeof INIT_HISTORY_STATE;
  payload: {
    documentId: string;
  };
}

export interface CleanupHistoryStateAction extends Action {
  type: typeof CLEANUP_HISTORY_STATE;
  payload: {
    documentId: string;
  };
}

// State update action interfaces
export interface SetHistoryDocumentStateAction extends Action {
  type: typeof SET_HISTORY_DOCUMENT_STATE;
  payload: {
    documentId: string;
    state: HistoryDocumentState;
  };
}

export interface SetActiveHistoryDocumentAction extends Action {
  type: typeof SET_ACTIVE_HISTORY_DOCUMENT;
  payload: string | null; // documentId
}

export type HistoryAction =
  | InitHistoryStateAction
  | CleanupHistoryStateAction
  | SetHistoryDocumentStateAction
  | SetActiveHistoryDocumentAction;

// Action creators
export const initHistoryState = (documentId: string): InitHistoryStateAction => ({
  type: INIT_HISTORY_STATE,
  payload: { documentId },
});

export const cleanupHistoryState = (documentId: string): CleanupHistoryStateAction => ({
  type: CLEANUP_HISTORY_STATE,
  payload: { documentId },
});

export const setHistoryDocumentState = (
  documentId: string,
  state: HistoryDocumentState,
): SetHistoryDocumentStateAction => ({
  type: SET_HISTORY_DOCUMENT_STATE,
  payload: { documentId, state },
});

export const setActiveHistoryDocument = (
  documentId: string | null,
): SetActiveHistoryDocumentAction => ({
  type: SET_ACTIVE_HISTORY_DOCUMENT,
  payload: documentId,
});
