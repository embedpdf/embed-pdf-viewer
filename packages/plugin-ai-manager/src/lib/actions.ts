import { Action } from '@embedpdf/core';
import { AiBackend } from '@embedpdf/ai';

export const SET_BACKEND = 'AI_MANAGER/SET_BACKEND';
export const SET_MODEL_LOADED = 'AI_MANAGER/SET_MODEL_LOADED';
export const SET_MODEL_UNLOADED = 'AI_MANAGER/SET_MODEL_UNLOADED';
export const SET_MODEL_LOADING = 'AI_MANAGER/SET_MODEL_LOADING';
export const SET_MODEL_LOADING_DONE = 'AI_MANAGER/SET_MODEL_LOADING_DONE';

export interface SetBackendAction extends Action {
  type: typeof SET_BACKEND;
  payload: AiBackend | null;
}

export interface SetModelLoadedAction extends Action {
  type: typeof SET_MODEL_LOADED;
  payload: string;
}

export interface SetModelUnloadedAction extends Action {
  type: typeof SET_MODEL_UNLOADED;
  payload: string;
}

export interface SetModelLoadingAction extends Action {
  type: typeof SET_MODEL_LOADING;
  payload: string;
}

export interface SetModelLoadingDoneAction extends Action {
  type: typeof SET_MODEL_LOADING_DONE;
  payload: string;
}

export type AiManagerAction =
  | SetBackendAction
  | SetModelLoadedAction
  | SetModelUnloadedAction
  | SetModelLoadingAction
  | SetModelLoadingDoneAction;

export function setBackend(backend: AiBackend | null): SetBackendAction {
  return { type: SET_BACKEND, payload: backend };
}

export function setModelLoaded(modelId: string): SetModelLoadedAction {
  return { type: SET_MODEL_LOADED, payload: modelId };
}

export function setModelUnloaded(modelId: string): SetModelUnloadedAction {
  return { type: SET_MODEL_UNLOADED, payload: modelId };
}

export function setModelLoading(modelId: string): SetModelLoadingAction {
  return { type: SET_MODEL_LOADING, payload: modelId };
}

export function setModelLoadingDone(modelId: string): SetModelLoadingDoneAction {
  return { type: SET_MODEL_LOADING_DONE, payload: modelId };
}
