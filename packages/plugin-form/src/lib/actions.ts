import { Action } from '@embedpdf/core';
import { FormDocumentState } from './types';

export const INIT_FORM_STATE = 'FORM/INIT_STATE';
export const CLEANUP_FORM_STATE = 'FORM/CLEANUP_STATE';
export const SELECT_FIELD = 'FORM/SELECT_FIELD';
export const DESELECT_FIELD = 'FORM/DESELECT_FIELD';

export interface InitFormStateAction extends Action {
  type: typeof INIT_FORM_STATE;
  payload: { documentId: string; state: FormDocumentState };
}

export interface CleanupFormStateAction extends Action {
  type: typeof CLEANUP_FORM_STATE;
  payload: string;
}

export interface SelectFieldAction extends Action {
  type: typeof SELECT_FIELD;
  payload: { documentId: string; annotationId: string };
}

export interface DeselectFieldAction extends Action {
  type: typeof DESELECT_FIELD;
  payload: string;
}

export type FormAction =
  | InitFormStateAction
  | CleanupFormStateAction
  | SelectFieldAction
  | DeselectFieldAction;

export function initFormState(documentId: string, state: FormDocumentState): InitFormStateAction {
  return { type: INIT_FORM_STATE, payload: { documentId, state } };
}

export function cleanupFormState(documentId: string): CleanupFormStateAction {
  return { type: CLEANUP_FORM_STATE, payload: documentId };
}

export function selectField(documentId: string, annotationId: string): SelectFieldAction {
  return { type: SELECT_FIELD, payload: { documentId, annotationId } };
}

export function deselectField(documentId: string): DeselectFieldAction {
  return { type: DESELECT_FIELD, payload: documentId };
}
