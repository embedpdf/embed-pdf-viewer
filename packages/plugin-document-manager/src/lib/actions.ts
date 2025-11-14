import { Action } from '@embedpdf/core';

export const SET_DOCUMENT_ORDER = 'SET_DOCUMENT_ORDER';
export const ADD_TO_DOCUMENT_ORDER = 'ADD_TO_DOCUMENT_ORDER';
export const REMOVE_FROM_DOCUMENT_ORDER = 'REMOVE_FROM_DOCUMENT_ORDER';

export interface SetDocumentOrderAction extends Action {
  type: typeof SET_DOCUMENT_ORDER;
  payload: string[];
}

export interface AddToDocumentOrderAction extends Action {
  type: typeof ADD_TO_DOCUMENT_ORDER;
  payload: {
    documentId: string;
    index?: number; // If not provided, add to end
  };
}

export interface RemoveFromDocumentOrderAction extends Action {
  type: typeof REMOVE_FROM_DOCUMENT_ORDER;
  payload: string;
}

export type DocumentManagerAction =
  | SetDocumentOrderAction
  | AddToDocumentOrderAction
  | RemoveFromDocumentOrderAction;

export function setDocumentOrder(order: string[]): SetDocumentOrderAction {
  return { type: SET_DOCUMENT_ORDER, payload: order };
}

export function addToDocumentOrder(documentId: string, index?: number): AddToDocumentOrderAction {
  return { type: ADD_TO_DOCUMENT_ORDER, payload: { documentId, index } };
}

export function removeFromDocumentOrder(documentId: string): RemoveFromDocumentOrderAction {
  return { type: REMOVE_FROM_DOCUMENT_ORDER, payload: documentId };
}
