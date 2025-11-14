import { Action } from '@embedpdf/core';
import { ThumbnailDocumentState, WindowState } from './types';

// Document lifecycle
export const INIT_THUMBNAIL_STATE = 'THUMBNAIL/INIT_STATE';
export const CLEANUP_THUMBNAIL_STATE = 'THUMBNAIL/CLEANUP_STATE';
export const SET_ACTIVE_DOCUMENT = 'THUMBNAIL/SET_ACTIVE_DOCUMENT';

// Per-document operations
export const SET_WINDOW_STATE = 'THUMBNAIL/SET_WINDOW_STATE';
export const UPDATE_VIEWPORT_METRICS = 'THUMBNAIL/UPDATE_VIEWPORT_METRICS';

// Document lifecycle actions
export interface InitThumbnailStateAction extends Action {
  type: typeof INIT_THUMBNAIL_STATE;
  payload: {
    documentId: string;
    state: ThumbnailDocumentState;
  };
}

export interface CleanupThumbnailStateAction extends Action {
  type: typeof CLEANUP_THUMBNAIL_STATE;
  payload: string; // documentId
}

export interface SetActiveDocumentAction extends Action {
  type: typeof SET_ACTIVE_DOCUMENT;
  payload: string | null; // documentId
}

export interface SetWindowStateAction extends Action {
  type: typeof SET_WINDOW_STATE;
  payload: {
    documentId: string;
    window: WindowState | null;
  };
}

export interface UpdateViewportMetricsAction extends Action {
  type: typeof UPDATE_VIEWPORT_METRICS;
  payload: {
    documentId: string;
    scrollY: number;
    viewportH: number;
  };
}

export type ThumbnailAction =
  | InitThumbnailStateAction
  | CleanupThumbnailStateAction
  | SetActiveDocumentAction
  | SetWindowStateAction
  | UpdateViewportMetricsAction;

// Action Creators
export function initThumbnailState(
  documentId: string,
  state: ThumbnailDocumentState,
): InitThumbnailStateAction {
  return { type: INIT_THUMBNAIL_STATE, payload: { documentId, state } };
}

export function cleanupThumbnailState(documentId: string): CleanupThumbnailStateAction {
  return { type: CLEANUP_THUMBNAIL_STATE, payload: documentId };
}

export function setActiveDocument(documentId: string | null): SetActiveDocumentAction {
  return { type: SET_ACTIVE_DOCUMENT, payload: documentId };
}

export function setWindowState(
  documentId: string,
  window: WindowState | null,
): SetWindowStateAction {
  return { type: SET_WINDOW_STATE, payload: { documentId, window } };
}

export function updateViewportMetrics(
  documentId: string,
  scrollY: number,
  viewportH: number,
): UpdateViewportMetricsAction {
  return { type: UPDATE_VIEWPORT_METRICS, payload: { documentId, scrollY, viewportH } };
}
