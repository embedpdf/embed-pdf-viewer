import { Action } from '@embedpdf/core';
import { PdfAnnotationObject } from '@embedpdf/models';
import { AnnotationTool } from './tools/types';
import { AnnotationDocumentState } from './types';

// Document lifecycle
export const INIT_ANNOTATION_STATE = 'ANNOTATION/INIT_STATE';
export const CLEANUP_ANNOTATION_STATE = 'ANNOTATION/CLEANUP_STATE';
export const SET_ACTIVE_DOCUMENT = 'ANNOTATION/SET_ACTIVE_DOCUMENT';

// Per-document actions
export const SET_ANNOTATIONS = 'ANNOTATION/SET_ANNOTATIONS';
export const SELECT_ANNOTATION = 'ANNOTATION/SELECT_ANNOTATION';
export const DESELECT_ANNOTATION = 'ANNOTATION/DESELECT_ANNOTATION';
export const ADD_TO_SELECTION = 'ANNOTATION/ADD_TO_SELECTION';
export const REMOVE_FROM_SELECTION = 'ANNOTATION/REMOVE_FROM_SELECTION';
export const SET_SELECTION = 'ANNOTATION/SET_SELECTION';
export const SET_ACTIVE_TOOL_ID = 'ANNOTATION/SET_ACTIVE_TOOL_ID';
export const CREATE_ANNOTATION = 'ANNOTATION/CREATE_ANNOTATION';
export const PATCH_ANNOTATION = 'ANNOTATION/PATCH_ANNOTATION';
export const DELETE_ANNOTATION = 'ANNOTATION/DELETE_ANNOTATION';
export const COMMIT_PENDING_CHANGES = 'ANNOTATION/COMMIT';
export const PURGE_ANNOTATION = 'ANNOTATION/PURGE_ANNOTATION';

// Global actions
export const ADD_COLOR_PRESET = 'ANNOTATION/ADD_COLOR_PRESET';
export const SET_TOOL_DEFAULTS = 'ANNOTATION/SET_TOOL_DEFAULTS';
export const ADD_TOOL = 'ANNOTATION/ADD_TOOL';

// Document lifecycle actions
export interface InitAnnotationStateAction extends Action {
  type: typeof INIT_ANNOTATION_STATE;
  payload: {
    documentId: string;
    state: AnnotationDocumentState;
  };
}

export interface CleanupAnnotationStateAction extends Action {
  type: typeof CLEANUP_ANNOTATION_STATE;
  payload: string; // documentId
}

export interface SetActiveDocumentAction extends Action {
  type: typeof SET_ACTIVE_DOCUMENT;
  payload: string | null; // documentId
}

// Per-document actions
export interface SetAnnotationsAction extends Action {
  type: typeof SET_ANNOTATIONS;
  payload: { documentId: string; annotations: Record<number, PdfAnnotationObject[]> };
}
export interface SelectAnnotationAction extends Action {
  type: typeof SELECT_ANNOTATION;
  payload: { documentId: string; pageIndex: number; id: string };
}
export interface DeselectAnnotationAction extends Action {
  type: typeof DESELECT_ANNOTATION;
  payload: { documentId: string };
}
export interface AddToSelectionAction extends Action {
  type: typeof ADD_TO_SELECTION;
  payload: { documentId: string; pageIndex: number; id: string };
}
export interface RemoveFromSelectionAction extends Action {
  type: typeof REMOVE_FROM_SELECTION;
  payload: { documentId: string; id: string };
}
export interface SetSelectionAction extends Action {
  type: typeof SET_SELECTION;
  payload: { documentId: string; ids: string[] };
}
export interface SetActiveToolIdAction extends Action {
  type: typeof SET_ACTIVE_TOOL_ID;
  payload: { documentId: string; toolId: string | null };
}
export interface CreateAnnotationAction extends Action {
  type: typeof CREATE_ANNOTATION;
  payload: { documentId: string; pageIndex: number; annotation: PdfAnnotationObject };
}
export interface PatchAnnotationAction extends Action {
  type: typeof PATCH_ANNOTATION;
  payload: {
    documentId: string;
    pageIndex: number;
    id: string;
    patch: Partial<PdfAnnotationObject>;
  };
}
export interface DeleteAnnotationAction extends Action {
  type: typeof DELETE_ANNOTATION;
  payload: { documentId: string; pageIndex: number; id: string };
}
export interface CommitAction extends Action {
  type: typeof COMMIT_PENDING_CHANGES;
  payload: { documentId: string; committedUids: string[] };
}
export interface PurgeAnnotationAction extends Action {
  type: typeof PURGE_ANNOTATION;
  payload: { documentId: string; pageIndex: number; uid: string };
}

// Global actions
export interface AddColorPresetAction extends Action {
  type: typeof ADD_COLOR_PRESET;
  payload: string;
}
export interface SetToolDefaultsAction extends Action {
  type: typeof SET_TOOL_DEFAULTS;
  payload: { toolId: string; patch: Partial<any> };
}
export interface AddToolAction extends Action {
  type: typeof ADD_TOOL;
  payload: AnnotationTool;
}

export type AnnotationAction =
  | InitAnnotationStateAction
  | CleanupAnnotationStateAction
  | SetActiveDocumentAction
  | SetAnnotationsAction
  | SelectAnnotationAction
  | DeselectAnnotationAction
  | AddToSelectionAction
  | RemoveFromSelectionAction
  | SetSelectionAction
  | SetActiveToolIdAction
  | CreateAnnotationAction
  | PatchAnnotationAction
  | DeleteAnnotationAction
  | CommitAction
  | PurgeAnnotationAction
  | AddColorPresetAction
  | SetToolDefaultsAction
  | AddToolAction;

// Document lifecycle action creators
export function initAnnotationState(
  documentId: string,
  state: AnnotationDocumentState,
): InitAnnotationStateAction {
  return { type: INIT_ANNOTATION_STATE, payload: { documentId, state } };
}

export function cleanupAnnotationState(documentId: string): CleanupAnnotationStateAction {
  return { type: CLEANUP_ANNOTATION_STATE, payload: documentId };
}

export function setActiveDocument(documentId: string | null): SetActiveDocumentAction {
  return { type: SET_ACTIVE_DOCUMENT, payload: documentId };
}

// Per-document action creators
export const setAnnotations = (
  documentId: string,
  annotations: Record<number, PdfAnnotationObject[]>,
): SetAnnotationsAction => ({
  type: SET_ANNOTATIONS,
  payload: { documentId, annotations },
});

export const selectAnnotation = (
  documentId: string,
  pageIndex: number,
  id: string,
): SelectAnnotationAction => ({
  type: SELECT_ANNOTATION,
  payload: { documentId, pageIndex, id },
});

export const deselectAnnotation = (documentId: string): DeselectAnnotationAction => ({
  type: DESELECT_ANNOTATION,
  payload: { documentId },
});

export const addToSelection = (
  documentId: string,
  pageIndex: number,
  id: string,
): AddToSelectionAction => ({
  type: ADD_TO_SELECTION,
  payload: { documentId, pageIndex, id },
});

export const removeFromSelection = (documentId: string, id: string): RemoveFromSelectionAction => ({
  type: REMOVE_FROM_SELECTION,
  payload: { documentId, id },
});

export const setSelection = (documentId: string, ids: string[]): SetSelectionAction => ({
  type: SET_SELECTION,
  payload: { documentId, ids },
});

export const setActiveToolId = (
  documentId: string,
  toolId: string | null,
): SetActiveToolIdAction => ({
  type: SET_ACTIVE_TOOL_ID,
  payload: { documentId, toolId },
});

export const createAnnotation = (
  documentId: string,
  pageIndex: number,
  annotation: PdfAnnotationObject,
): CreateAnnotationAction => ({
  type: CREATE_ANNOTATION,
  payload: { documentId, pageIndex, annotation },
});

export const patchAnnotation = (
  documentId: string,
  pageIndex: number,
  id: string,
  patch: Partial<PdfAnnotationObject>,
): PatchAnnotationAction => ({
  type: PATCH_ANNOTATION,
  payload: { documentId, pageIndex, id, patch },
});

export const deleteAnnotation = (
  documentId: string,
  pageIndex: number,
  id: string,
): DeleteAnnotationAction => ({
  type: DELETE_ANNOTATION,
  payload: { documentId, pageIndex, id },
});

export const commitPendingChanges = (
  documentId: string,
  committedUids: string[],
): CommitAction => ({
  type: COMMIT_PENDING_CHANGES,
  payload: { documentId, committedUids },
});

export const purgeAnnotation = (
  documentId: string,
  pageIndex: number,
  uid: string,
): PurgeAnnotationAction => ({
  type: PURGE_ANNOTATION,
  payload: { documentId, pageIndex, uid },
});

// Global action creators
export const addColorPreset = (c: string): AddColorPresetAction => ({
  type: ADD_COLOR_PRESET,
  payload: c,
});

export const setToolDefaults = (toolId: string, patch: Partial<any>): SetToolDefaultsAction => ({
  type: SET_TOOL_DEFAULTS,
  payload: { toolId, patch },
});

export const addTool = (tool: AnnotationTool): AddToolAction => ({
  type: ADD_TOOL,
  payload: tool,
});
