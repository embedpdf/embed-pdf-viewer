import { Action } from '@embedpdf/core';

export const CREATE_VIEW = 'CREATE_VIEW';
export const REMOVE_VIEW = 'REMOVE_VIEW';
export const ADD_DOCUMENT_TO_VIEW = 'ADD_DOCUMENT_TO_VIEW';
export const REMOVE_DOCUMENT_FROM_VIEW = 'REMOVE_DOCUMENT_FROM_VIEW';
export const MOVE_DOCUMENT_WITHIN_VIEW = 'MOVE_DOCUMENT_WITHIN_VIEW';
export const SET_VIEW_ACTIVE_DOCUMENT = 'SET_VIEW_ACTIVE_DOCUMENT';
export const SET_FOCUSED_VIEW = 'SET_FOCUSED_VIEW';

export interface CreateViewAction extends Action {
  type: typeof CREATE_VIEW;
  payload: {
    viewId: string;
    createdAt: number;
  };
}

export interface RemoveViewAction extends Action {
  type: typeof REMOVE_VIEW;
  payload: string; // viewId
}

export interface AddDocumentToViewAction extends Action {
  type: typeof ADD_DOCUMENT_TO_VIEW;
  payload: {
    viewId: string;
    documentId: string;
    index?: number;
  };
}

export interface RemoveDocumentFromViewAction extends Action {
  type: typeof REMOVE_DOCUMENT_FROM_VIEW;
  payload: {
    viewId: string;
    documentId: string;
  };
}

export interface MoveDocumentWithinViewAction extends Action {
  type: typeof MOVE_DOCUMENT_WITHIN_VIEW;
  payload: {
    viewId: string;
    documentId: string;
    toIndex: number;
  };
}

export interface SetViewActiveDocumentAction extends Action {
  type: typeof SET_VIEW_ACTIVE_DOCUMENT;
  payload: {
    viewId: string;
    documentId: string | null;
  };
}

export interface SetFocusedViewAction extends Action {
  type: typeof SET_FOCUSED_VIEW;
  payload: string | null; // viewId or null
}

export type ViewManagerAction =
  | CreateViewAction
  | RemoveViewAction
  | AddDocumentToViewAction
  | RemoveDocumentFromViewAction
  | MoveDocumentWithinViewAction
  | SetViewActiveDocumentAction
  | SetFocusedViewAction;

export function createView(viewId: string, createdAt: number): CreateViewAction {
  return { type: CREATE_VIEW, payload: { viewId, createdAt } };
}

export function removeView(viewId: string): RemoveViewAction {
  return { type: REMOVE_VIEW, payload: viewId };
}

export function addDocumentToView(
  viewId: string,
  documentId: string,
  index?: number,
): AddDocumentToViewAction {
  return { type: ADD_DOCUMENT_TO_VIEW, payload: { viewId, documentId, index } };
}

export function removeDocumentFromView(
  viewId: string,
  documentId: string,
): RemoveDocumentFromViewAction {
  return { type: REMOVE_DOCUMENT_FROM_VIEW, payload: { viewId, documentId } };
}

export function moveDocumentWithinView(
  viewId: string,
  documentId: string,
  toIndex: number,
): MoveDocumentWithinViewAction {
  return { type: MOVE_DOCUMENT_WITHIN_VIEW, payload: { viewId, documentId, toIndex } };
}

export function setViewActiveDocument(
  viewId: string,
  documentId: string | null,
): SetViewActiveDocumentAction {
  return { type: SET_VIEW_ACTIVE_DOCUMENT, payload: { viewId, documentId } };
}

export function setFocusedView(viewId: string | null): SetFocusedViewAction {
  return { type: SET_FOCUSED_VIEW, payload: viewId };
}
