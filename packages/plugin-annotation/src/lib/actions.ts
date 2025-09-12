import { Action } from '@embedpdf/core';
import { PdfAnnotationObject } from '@embedpdf/models';
import { AnnotationTool } from './tools/types';

export const SET_ANNOTATIONS = 'ANNOTATION/SET_ANNOTATIONS';
export const SELECT_ANNOTATION = 'ANNOTATION/SELECT_ANNOTATION';
export const DESELECT_ANNOTATION = 'ANNOTATION/DESELECT_ANNOTATION';
export const ADD_COLOR_PRESET = 'ANNOTATION/ADD_COLOR_PRESET';
export const CREATE_ANNOTATION = 'ANNOTATION/CREATE_ANNOTATION';
export const PATCH_ANNOTATION = 'ANNOTATION/PATCH_ANNOTATION';
export const DELETE_ANNOTATION = 'ANNOTATION/DELETE_ANNOTATION';
export const COMMIT_PENDING_CHANGES = 'ANNOTATION/COMMIT';
export const PURGE_ANNOTATION = 'ANNOTATION/PURGE_ANNOTATION';
export const SET_ACTIVE_TOOL_ID = 'ANNOTATION/SET_ACTIVE_TOOL_ID';
export const SET_TOOL_DEFAULTS = 'ANNOTATION/SET_TOOL_DEFAULTS';
export const ADD_TOOL = 'ANNOTATION/ADD_TOOL';

export interface SetAnnotationsAction extends Action {
  type: typeof SET_ANNOTATIONS;
  payload: Record<number, PdfAnnotationObject[]>;
}
export interface SelectAnnotationAction extends Action {
  type: typeof SELECT_ANNOTATION;
  payload: { pageIndex: number; id: string };
}
export interface DeselectAnnotationAction extends Action {
  type: typeof DESELECT_ANNOTATION;
}
export interface AddColorPresetAction extends Action {
  type: typeof ADD_COLOR_PRESET;
  payload: string;
}
export interface CreateAnnotationAction extends Action {
  type: typeof CREATE_ANNOTATION;
  payload: { pageIndex: number; annotation: PdfAnnotationObject };
}
export interface PatchAnnotationAction extends Action {
  type: typeof PATCH_ANNOTATION;
  payload: { pageIndex: number; id: string; patch: Partial<PdfAnnotationObject> };
}
export interface DeleteAnnotationAction extends Action {
  type: typeof DELETE_ANNOTATION;
  payload: { pageIndex: number; id: string };
}
export interface CommitAction extends Action {
  type: typeof COMMIT_PENDING_CHANGES;
}
export interface PurgeAnnotationAction extends Action {
  type: typeof PURGE_ANNOTATION;
  payload: { uid: string };
}
export interface SetActiveToolIdAction extends Action {
  type: typeof SET_ACTIVE_TOOL_ID;
  payload: string | null;
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
  | SetAnnotationsAction
  | SelectAnnotationAction
  | DeselectAnnotationAction
  | AddColorPresetAction
  | CreateAnnotationAction
  | PatchAnnotationAction
  | DeleteAnnotationAction
  | CommitAction
  | PurgeAnnotationAction
  | SetActiveToolIdAction
  | SetToolDefaultsAction
  | AddToolAction;

export const setAnnotations = (p: Record<number, PdfAnnotationObject[]>): SetAnnotationsAction => ({
  type: SET_ANNOTATIONS,
  payload: p,
});
export const selectAnnotation = (pageIndex: number, id: string): SelectAnnotationAction => ({
  type: SELECT_ANNOTATION,
  payload: { pageIndex, id },
});
export const deselectAnnotation = (): DeselectAnnotationAction => ({ type: DESELECT_ANNOTATION });
export const addColorPreset = (c: string): AddColorPresetAction => ({
  type: ADD_COLOR_PRESET,
  payload: c,
});
export const createAnnotation = (
  pageIndex: number,
  annotation: PdfAnnotationObject,
): CreateAnnotationAction => ({ type: CREATE_ANNOTATION, payload: { pageIndex, annotation } });
export const patchAnnotation = (
  pageIndex: number,
  id: string,
  patch: Partial<PdfAnnotationObject>,
): PatchAnnotationAction => ({ type: PATCH_ANNOTATION, payload: { pageIndex, id, patch } });
export const deleteAnnotation = (pageIndex: number, id: string): DeleteAnnotationAction => ({
  type: DELETE_ANNOTATION,
  payload: { pageIndex, id },
});
export const commitPendingChanges = (): CommitAction => ({ type: COMMIT_PENDING_CHANGES });
export const purgeAnnotation = (uid: string): PurgeAnnotationAction => ({
  type: PURGE_ANNOTATION,
  payload: { uid },
});
export const setActiveToolId = (id: string | null): SetActiveToolIdAction => ({
  type: SET_ACTIVE_TOOL_ID,
  payload: id,
});
export const setToolDefaults = (toolId: string, patch: Partial<any>): SetToolDefaultsAction => ({
  type: SET_TOOL_DEFAULTS,
  payload: { toolId, patch },
});
export const addTool = (tool: AnnotationTool): AddToolAction => ({ type: ADD_TOOL, payload: tool });
