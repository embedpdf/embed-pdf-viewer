import { Action } from '@embedpdf/core';
import { MatchFlag, SearchResult } from '@embedpdf/models';
import { SearchDocumentState } from './types';

// Action Types
export const INIT_SEARCH_STATE = 'SEARCH/INIT_STATE';
export const CLEANUP_SEARCH_STATE = 'SEARCH/CLEANUP_STATE';
export const START_SEARCH_SESSION = 'SEARCH/START_SEARCH_SESSION';
export const STOP_SEARCH_SESSION = 'SEARCH/STOP_SEARCH_SESSION';
export const SET_SEARCH_FLAGS = 'SEARCH/SET_SEARCH_FLAGS';
export const SET_SHOW_ALL_RESULTS = 'SEARCH/SET_SHOW_ALL_RESULTS';
export const START_SEARCH = 'SEARCH/START_SEARCH';
export const SET_SEARCH_RESULTS = 'SEARCH/SET_SEARCH_RESULTS';
export const APPEND_SEARCH_RESULTS = 'SEARCH/APPEND_SEARCH_RESULTS';
export const SET_ACTIVE_RESULT_INDEX = 'SEARCH/SET_ACTIVE_RESULT_INDEX';

// Action Interfaces
export interface InitSearchStateAction extends Action {
  type: typeof INIT_SEARCH_STATE;
  payload: { documentId: string; state: SearchDocumentState };
}

export interface CleanupSearchStateAction extends Action {
  type: typeof CLEANUP_SEARCH_STATE;
  payload: string; // documentId
}

export interface StartSearchSessionAction extends Action {
  type: typeof START_SEARCH_SESSION;
  payload: { documentId: string };
}

export interface StopSearchSessionAction extends Action {
  type: typeof STOP_SEARCH_SESSION;
  payload: { documentId: string };
}

export interface SetSearchFlagsAction extends Action {
  type: typeof SET_SEARCH_FLAGS;
  payload: { documentId: string; flags: MatchFlag[] };
}

export interface SetShowAllResultsAction extends Action {
  type: typeof SET_SHOW_ALL_RESULTS;
  payload: { documentId: string; showAll: boolean };
}

export interface StartSearchAction extends Action {
  type: typeof START_SEARCH;
  payload: { documentId: string; query: string };
}

export interface SetSearchResultsAction extends Action {
  type: typeof SET_SEARCH_RESULTS;
  payload: {
    documentId: string;
    results: SearchResult[];
    total: number;
    activeResultIndex: number;
  };
}

export interface AppendSearchResultsAction extends Action {
  type: typeof APPEND_SEARCH_RESULTS;
  payload: {
    documentId: string;
    results: SearchResult[];
  };
}

export interface SetActiveResultIndexAction extends Action {
  type: typeof SET_ACTIVE_RESULT_INDEX;
  payload: { documentId: string; index: number };
}

// Union Type for All Actions
export type SearchAction =
  | InitSearchStateAction
  | CleanupSearchStateAction
  | StartSearchSessionAction
  | StopSearchSessionAction
  | SetSearchFlagsAction
  | SetShowAllResultsAction
  | StartSearchAction
  | SetSearchResultsAction
  | AppendSearchResultsAction
  | SetActiveResultIndexAction;

// Action Creators
export function initSearchState(
  documentId: string,
  state: SearchDocumentState,
): InitSearchStateAction {
  return { type: INIT_SEARCH_STATE, payload: { documentId, state } };
}

export function cleanupSearchState(documentId: string): CleanupSearchStateAction {
  return { type: CLEANUP_SEARCH_STATE, payload: documentId };
}

export function startSearchSession(documentId: string): StartSearchSessionAction {
  return { type: START_SEARCH_SESSION, payload: { documentId } };
}

export function stopSearchSession(documentId: string): StopSearchSessionAction {
  return { type: STOP_SEARCH_SESSION, payload: { documentId } };
}

export function setSearchFlags(documentId: string, flags: MatchFlag[]): SetSearchFlagsAction {
  return { type: SET_SEARCH_FLAGS, payload: { documentId, flags } };
}

export function setShowAllResults(documentId: string, showAll: boolean): SetShowAllResultsAction {
  return { type: SET_SHOW_ALL_RESULTS, payload: { documentId, showAll } };
}

export function startSearch(documentId: string, query: string): StartSearchAction {
  return { type: START_SEARCH, payload: { documentId, query } };
}

export function setSearchResults(
  documentId: string,
  results: SearchResult[],
  total: number,
  activeResultIndex: number,
): SetSearchResultsAction {
  return { type: SET_SEARCH_RESULTS, payload: { documentId, results, total, activeResultIndex } };
}

export function appendSearchResults(
  documentId: string,
  results: SearchResult[],
): AppendSearchResultsAction {
  return { type: APPEND_SEARCH_RESULTS, payload: { documentId, results } };
}

export function setActiveResultIndex(
  documentId: string,
  index: number,
): SetActiveResultIndexAction {
  return { type: SET_ACTIVE_RESULT_INDEX, payload: { documentId, index } };
}
