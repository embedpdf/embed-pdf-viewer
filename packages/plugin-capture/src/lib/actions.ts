import { Action } from '@embedpdf/core';
import { CaptureDocumentState } from './types';

// Document lifecycle
export const INIT_CAPTURE_STATE = 'CAPTURE/INIT_STATE';
export const CLEANUP_CAPTURE_STATE = 'CAPTURE/CLEANUP_STATE';
export const SET_ACTIVE_DOCUMENT = 'CAPTURE/SET_ACTIVE_DOCUMENT';

// Per-document actions
export const SET_MARQUEE_CAPTURE_ACTIVE = 'CAPTURE/SET_MARQUEE_CAPTURE_ACTIVE';

// Document lifecycle actions
export interface InitCaptureStateAction extends Action {
  type: typeof INIT_CAPTURE_STATE;
  payload: {
    documentId: string;
    state: CaptureDocumentState;
  };
}

export interface CleanupCaptureStateAction extends Action {
  type: typeof CLEANUP_CAPTURE_STATE;
  payload: string; // documentId
}

export interface SetActiveDocumentAction extends Action {
  type: typeof SET_ACTIVE_DOCUMENT;
  payload: string | null; // documentId
}

export interface SetMarqueeCaptureActiveAction extends Action {
  type: typeof SET_MARQUEE_CAPTURE_ACTIVE;
  payload: {
    documentId: string;
    isActive: boolean;
  };
}

export type CaptureAction =
  | InitCaptureStateAction
  | CleanupCaptureStateAction
  | SetActiveDocumentAction
  | SetMarqueeCaptureActiveAction;

// Action Creators
export function initCaptureState(
  documentId: string,
  state: CaptureDocumentState,
): InitCaptureStateAction {
  return { type: INIT_CAPTURE_STATE, payload: { documentId, state } };
}

export function cleanupCaptureState(documentId: string): CleanupCaptureStateAction {
  return { type: CLEANUP_CAPTURE_STATE, payload: documentId };
}

export function setActiveDocument(documentId: string | null): SetActiveDocumentAction {
  return { type: SET_ACTIVE_DOCUMENT, payload: documentId };
}

export function setMarqueeCaptureActive(
  documentId: string,
  isActive: boolean,
): SetMarqueeCaptureActiveAction {
  return { type: SET_MARQUEE_CAPTURE_ACTIVE, payload: { documentId, isActive } };
}
