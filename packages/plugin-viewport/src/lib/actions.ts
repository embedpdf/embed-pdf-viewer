import { Action } from '@embedpdf/core';
import { ViewportInputMetrics, ViewportScrollMetrics } from './types';

// Document lifecycle (state persistence)
export const INIT_VIEWPORT_STATE = 'INIT_VIEWPORT_STATE';
export const CLEANUP_VIEWPORT_STATE = 'CLEANUP_VIEWPORT_STATE';

// Viewport registration (DOM lifecycle)
export const REGISTER_VIEWPORT = 'REGISTER_VIEWPORT';
export const UNREGISTER_VIEWPORT = 'UNREGISTER_VIEWPORT';

// Viewport operations
export const SET_VIEWPORT_METRICS = 'SET_VIEWPORT_METRICS';
export const SET_VIEWPORT_SCROLL_METRICS = 'SET_VIEWPORT_SCROLL_METRICS';
export const SET_VIEWPORT_GAP = 'SET_VIEWPORT_GAP';
export const SET_SCROLL_ACTIVITY = 'SET_SCROLL_ACTIVITY';
export const SET_SMOOTH_SCROLL_ACTIVITY = 'SET_SMOOTH_SCROLL_ACTIVITY';
export const SET_ACTIVE_VIEWPORT_DOCUMENT = 'SET_ACTIVE_VIEWPORT_DOCUMENT';

// NEW: Named gate actions
export const ADD_VIEWPORT_GATE = 'ADD_VIEWPORT_GATE';
export const REMOVE_VIEWPORT_GATE = 'REMOVE_VIEWPORT_GATE';

// State persistence actions
export interface InitViewportStateAction extends Action {
  type: typeof INIT_VIEWPORT_STATE;
  payload: {
    documentId: string;
  };
}

export interface CleanupViewportStateAction extends Action {
  type: typeof CLEANUP_VIEWPORT_STATE;
  payload: {
    documentId: string;
  };
}

// Registration actions (DOM lifecycle)
export interface RegisterViewportAction extends Action {
  type: typeof REGISTER_VIEWPORT;
  payload: {
    documentId: string;
  };
}

export interface UnregisterViewportAction extends Action {
  type: typeof UNREGISTER_VIEWPORT;
  payload: {
    documentId: string;
  };
}

export interface SetActiveViewportDocumentAction extends Action {
  type: typeof SET_ACTIVE_VIEWPORT_DOCUMENT;
  payload: string | null; // documentId
}

export interface SetViewportMetricsAction extends Action {
  type: typeof SET_VIEWPORT_METRICS;
  payload: {
    documentId: string;
    metrics: ViewportInputMetrics;
  };
}

export interface SetViewportScrollMetricsAction extends Action {
  type: typeof SET_VIEWPORT_SCROLL_METRICS;
  payload: {
    documentId: string;
    scrollMetrics: ViewportScrollMetrics;
  };
}

export interface SetViewportGapAction extends Action {
  type: typeof SET_VIEWPORT_GAP;
  payload: number;
}

export interface SetScrollActivityAction extends Action {
  type: typeof SET_SCROLL_ACTIVITY;
  payload: {
    documentId: string;
    isScrolling: boolean;
  };
}

export interface SetSmoothScrollActivityAction extends Action {
  type: typeof SET_SMOOTH_SCROLL_ACTIVITY;
  payload: {
    documentId: string;
    isSmoothScrolling: boolean;
  };
}

// NEW: Named gate actions
export interface AddViewportGateAction extends Action {
  type: typeof ADD_VIEWPORT_GATE;
  payload: {
    documentId: string;
    key: string;
  };
}

export interface RemoveViewportGateAction extends Action {
  type: typeof REMOVE_VIEWPORT_GATE;
  payload: {
    documentId: string;
    key: string;
  };
}

export type ViewportAction =
  | InitViewportStateAction
  | CleanupViewportStateAction
  | RegisterViewportAction
  | UnregisterViewportAction
  | SetActiveViewportDocumentAction
  | SetViewportMetricsAction
  | SetViewportScrollMetricsAction
  | SetViewportGapAction
  | SetScrollActivityAction
  | SetSmoothScrollActivityAction
  | AddViewportGateAction
  | RemoveViewportGateAction;

// Action Creators

export function initViewportState(documentId: string): InitViewportStateAction {
  return { type: INIT_VIEWPORT_STATE, payload: { documentId } };
}

export function cleanupViewportState(documentId: string): CleanupViewportStateAction {
  return { type: CLEANUP_VIEWPORT_STATE, payload: { documentId } };
}

export function registerViewport(documentId: string): RegisterViewportAction {
  return { type: REGISTER_VIEWPORT, payload: { documentId } };
}

export function unregisterViewport(documentId: string): UnregisterViewportAction {
  return { type: UNREGISTER_VIEWPORT, payload: { documentId } };
}

export function setActiveViewportDocument(
  documentId: string | null,
): SetActiveViewportDocumentAction {
  return { type: SET_ACTIVE_VIEWPORT_DOCUMENT, payload: documentId };
}

export function setViewportGap(viewportGap: number): SetViewportGapAction {
  return { type: SET_VIEWPORT_GAP, payload: viewportGap };
}

export function setViewportMetrics(
  documentId: string,
  metrics: ViewportInputMetrics,
): SetViewportMetricsAction {
  return { type: SET_VIEWPORT_METRICS, payload: { documentId, metrics } };
}

export function setViewportScrollMetrics(
  documentId: string,
  scrollMetrics: ViewportScrollMetrics,
): SetViewportScrollMetricsAction {
  return { type: SET_VIEWPORT_SCROLL_METRICS, payload: { documentId, scrollMetrics } };
}

export function setScrollActivity(
  documentId: string,
  isScrolling: boolean,
): SetScrollActivityAction {
  return { type: SET_SCROLL_ACTIVITY, payload: { documentId, isScrolling } };
}

export function setSmoothScrollActivity(
  documentId: string,
  isSmoothScrolling: boolean,
): SetSmoothScrollActivityAction {
  return { type: SET_SMOOTH_SCROLL_ACTIVITY, payload: { documentId, isSmoothScrolling } };
}

export function addViewportGate(documentId: string, key: string): AddViewportGateAction {
  return { type: ADD_VIEWPORT_GATE, payload: { documentId, key } };
}

export function removeViewportGate(documentId: string, key: string): RemoveViewportGateAction {
  return { type: REMOVE_VIEWPORT_GATE, payload: { documentId, key } };
}
