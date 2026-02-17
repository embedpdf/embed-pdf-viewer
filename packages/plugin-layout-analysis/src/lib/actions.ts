import { Action } from '@embedpdf/core';
import { PageAnalysisState, PageLayout } from './types';

export const INIT_LAYOUT_STATE = 'LAYOUT_ANALYSIS/INIT_STATE';
export const CLEANUP_LAYOUT_STATE = 'LAYOUT_ANALYSIS/CLEANUP_STATE';
export const SET_PAGE_STATUS = 'LAYOUT_ANALYSIS/SET_PAGE_STATUS';
export const SET_PAGE_LAYOUT = 'LAYOUT_ANALYSIS/SET_PAGE_LAYOUT';
export const SET_PAGE_ERROR = 'LAYOUT_ANALYSIS/SET_PAGE_ERROR';
export const SET_OVERLAY_VISIBLE = 'LAYOUT_ANALYSIS/SET_OVERLAY_VISIBLE';
export const SET_THRESHOLD = 'LAYOUT_ANALYSIS/SET_THRESHOLD';
export const SELECT_BLOCK = 'LAYOUT_ANALYSIS/SELECT_BLOCK';

export interface InitLayoutStateAction extends Action {
  type: typeof INIT_LAYOUT_STATE;
  payload: { documentId: string };
}

export interface CleanupLayoutStateAction extends Action {
  type: typeof CLEANUP_LAYOUT_STATE;
  payload: string;
}

export interface SetPageStatusAction extends Action {
  type: typeof SET_PAGE_STATUS;
  payload: { documentId: string; pageIndex: number; status: PageAnalysisState['status'] };
}

export interface SetPageLayoutAction extends Action {
  type: typeof SET_PAGE_LAYOUT;
  payload: { documentId: string; pageIndex: number; layout: PageLayout };
}

export interface SetPageErrorAction extends Action {
  type: typeof SET_PAGE_ERROR;
  payload: { documentId: string; pageIndex: number; error: string };
}

export interface SetOverlayVisibleAction extends Action {
  type: typeof SET_OVERLAY_VISIBLE;
  payload: boolean;
}

export interface SetThresholdAction extends Action {
  type: typeof SET_THRESHOLD;
  payload: number;
}

export interface SelectBlockAction extends Action {
  type: typeof SELECT_BLOCK;
  payload: number | null;
}

export type LayoutAnalysisAction =
  | InitLayoutStateAction
  | CleanupLayoutStateAction
  | SetPageStatusAction
  | SetPageLayoutAction
  | SetPageErrorAction
  | SetOverlayVisibleAction
  | SetThresholdAction
  | SelectBlockAction;

export function initLayoutState(documentId: string): InitLayoutStateAction {
  return { type: INIT_LAYOUT_STATE, payload: { documentId } };
}

export function cleanupLayoutState(documentId: string): CleanupLayoutStateAction {
  return { type: CLEANUP_LAYOUT_STATE, payload: documentId };
}

export function setPageStatus(
  documentId: string,
  pageIndex: number,
  status: PageAnalysisState['status'],
): SetPageStatusAction {
  return { type: SET_PAGE_STATUS, payload: { documentId, pageIndex, status } };
}

export function setPageLayout(
  documentId: string,
  pageIndex: number,
  layout: PageLayout,
): SetPageLayoutAction {
  return { type: SET_PAGE_LAYOUT, payload: { documentId, pageIndex, layout } };
}

export function setPageError(
  documentId: string,
  pageIndex: number,
  error: string,
): SetPageErrorAction {
  return { type: SET_PAGE_ERROR, payload: { documentId, pageIndex, error } };
}

export function setOverlayVisible(visible: boolean): SetOverlayVisibleAction {
  return { type: SET_OVERLAY_VISIBLE, payload: visible };
}

export function setThreshold(threshold: number): SetThresholdAction {
  return { type: SET_THRESHOLD, payload: threshold };
}

export function selectBlock(blockId: number | null): SelectBlockAction {
  return { type: SELECT_BLOCK, payload: blockId };
}
