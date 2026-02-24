import { Action } from '@embedpdf/core';
import { FormDocumentState } from './types';

export const INIT_FORM_STATE = 'FORM/INIT_STATE';
export const CLEANUP_FORM_STATE = 'FORM/CLEANUP_STATE';

export interface InitFormStateAction extends Action {
  type: typeof INIT_FORM_STATE;
  payload: { documentId: string; state: FormDocumentState };
}

export interface CleanupFormStateAction extends Action {
  type: typeof CLEANUP_FORM_STATE;
  payload: string;
}

export type FormAction = InitFormStateAction | CleanupFormStateAction;

export function initFormState(documentId: string, state: FormDocumentState): InitFormStateAction {
  return { type: INIT_FORM_STATE, payload: { documentId, state } };
}

export function cleanupFormState(documentId: string): CleanupFormStateAction {
  return { type: CLEANUP_FORM_STATE, payload: documentId };
}
