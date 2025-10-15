import { Action } from '@embedpdf/core';
import { ZoomLevel, ZoomDocumentState } from './types';

// Document lifecycle
export const INIT_ZOOM_STATE = 'ZOOM/INIT_STATE';
export const CLEANUP_ZOOM_STATE = 'ZOOM/CLEANUP_STATE';
export const SET_ACTIVE_DOCUMENT = 'ZOOM/SET_ACTIVE_DOCUMENT';

// Per-document actions
export const SET_ZOOM_LEVEL = 'ZOOM/SET_ZOOM_LEVEL';

// Document lifecycle actions
export interface InitZoomStateAction extends Action {
  type: typeof INIT_ZOOM_STATE;
  payload: {
    documentId: string;
    state: ZoomDocumentState;
  };
}

export interface CleanupZoomStateAction extends Action {
  type: typeof CLEANUP_ZOOM_STATE;
  payload: string; // documentId
}

export interface SetActiveDocumentAction extends Action {
  type: typeof SET_ACTIVE_DOCUMENT;
  payload: string | null; // documentId
}

export interface SetZoomLevelAction extends Action {
  type: typeof SET_ZOOM_LEVEL;
  payload: {
    documentId: string;
    zoomLevel: ZoomLevel;
    currentZoomLevel: number;
  };
}

export type ZoomAction =
  | InitZoomStateAction
  | CleanupZoomStateAction
  | SetActiveDocumentAction
  | SetZoomLevelAction;

// Action Creators
export function initZoomState(documentId: string, state: ZoomDocumentState): InitZoomStateAction {
  return { type: INIT_ZOOM_STATE, payload: { documentId, state } };
}

export function cleanupZoomState(documentId: string): CleanupZoomStateAction {
  return { type: CLEANUP_ZOOM_STATE, payload: documentId };
}

export function setActiveDocument(documentId: string | null): SetActiveDocumentAction {
  return { type: SET_ACTIVE_DOCUMENT, payload: documentId };
}

export function setZoomLevel(
  documentId: string,
  zoomLevel: ZoomLevel,
  currentZoomLevel: number,
): SetZoomLevelAction {
  return { type: SET_ZOOM_LEVEL, payload: { documentId, zoomLevel, currentZoomLevel } };
}
