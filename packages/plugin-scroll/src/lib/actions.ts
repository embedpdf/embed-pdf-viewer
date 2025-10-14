import { Action } from '@embedpdf/core';
import { ScrollDocumentState, ScrollStrategy } from './types';

// Document lifecycle
export const INIT_SCROLL_STATE = 'INIT_SCROLL_STATE';
export const CLEANUP_SCROLL_STATE = 'CLEANUP_SCROLL_STATE';
export const UPDATE_DOCUMENT_SCROLL_STATE = 'UPDATE_DOCUMENT_SCROLL_STATE';
export const SET_SCROLL_STRATEGY = 'SET_SCROLL_STRATEGY';

export interface InitScrollStateAction extends Action {
  type: typeof INIT_SCROLL_STATE;
  payload: {
    documentId: string;
    state: ScrollDocumentState;
  };
}

export interface CleanupScrollStateAction extends Action {
  type: typeof CLEANUP_SCROLL_STATE;
  payload: string; // documentId
}

export interface UpdateDocumentScrollStateAction extends Action {
  type: typeof UPDATE_DOCUMENT_SCROLL_STATE;
  payload: {
    documentId: string;
    state: Partial<ScrollDocumentState>;
  };
}

export interface SetScrollStrategyAction extends Action {
  type: typeof SET_SCROLL_STRATEGY;
  payload: {
    documentId: string;
    strategy: ScrollStrategy;
  };
}

export type ScrollAction =
  | InitScrollStateAction
  | CleanupScrollStateAction
  | UpdateDocumentScrollStateAction
  | SetScrollStrategyAction;

export function initScrollState(
  documentId: string,
  state: ScrollDocumentState,
): InitScrollStateAction {
  return { type: INIT_SCROLL_STATE, payload: { documentId, state } };
}

export function cleanupScrollState(documentId: string): CleanupScrollStateAction {
  return { type: CLEANUP_SCROLL_STATE, payload: documentId };
}

export function updateDocumentScrollState(
  documentId: string,
  state: Partial<ScrollDocumentState>,
): UpdateDocumentScrollStateAction {
  return { type: UPDATE_DOCUMENT_SCROLL_STATE, payload: { documentId, state } };
}

export function setScrollStrategy(
  documentId: string,
  strategy: ScrollStrategy,
): SetScrollStrategyAction {
  return { type: SET_SCROLL_STRATEGY, payload: { documentId, strategy } };
}
