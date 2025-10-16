import { Action } from '@embedpdf/core';
import { Rotation } from '@embedpdf/models';
import { RotateDocumentState } from './types';

// Document lifecycle
export const INIT_ROTATE_STATE = 'ROTATE/INIT_STATE';
export const CLEANUP_ROTATE_STATE = 'ROTATE/CLEANUP_STATE';
export const SET_ACTIVE_ROTATE_DOCUMENT = 'ROTATE/SET_ACTIVE_DOCUMENT';

// Rotation operations
export const SET_ROTATION = 'ROTATE/SET_ROTATION';

// Document lifecycle actions
export interface InitRotateStateAction extends Action {
  type: typeof INIT_ROTATE_STATE;
  payload: {
    documentId: string;
    state: RotateDocumentState;
  };
}

export interface CleanupRotateStateAction extends Action {
  type: typeof CLEANUP_ROTATE_STATE;
  payload: string; // documentId
}

export interface SetActiveRotateDocumentAction extends Action {
  type: typeof SET_ACTIVE_ROTATE_DOCUMENT;
  payload: string | null; // documentId
}

export interface SetRotationAction extends Action {
  type: typeof SET_ROTATION;
  payload: {
    documentId: string;
    rotation: Rotation;
  };
}

export type RotateAction =
  | InitRotateStateAction
  | CleanupRotateStateAction
  | SetActiveRotateDocumentAction
  | SetRotationAction;

// Action Creators
export function initRotateState(
  documentId: string,
  state: RotateDocumentState,
): InitRotateStateAction {
  return { type: INIT_ROTATE_STATE, payload: { documentId, state } };
}

export function cleanupRotateState(documentId: string): CleanupRotateStateAction {
  return { type: CLEANUP_ROTATE_STATE, payload: documentId };
}

export function setActiveRotateDocument(documentId: string | null): SetActiveRotateDocumentAction {
  return { type: SET_ACTIVE_ROTATE_DOCUMENT, payload: documentId };
}

export function setRotation(documentId: string, rotation: Rotation): SetRotationAction {
  return { type: SET_ROTATION, payload: { documentId, rotation } };
}
