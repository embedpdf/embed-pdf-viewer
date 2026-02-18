import { Action } from '@embedpdf/core';
import { PageAnalysisState, PageLayout, TableStructureElement } from './types';

export const INIT_LAYOUT_STATE = 'LAYOUT_ANALYSIS/INIT_STATE';
export const CLEANUP_LAYOUT_STATE = 'LAYOUT_ANALYSIS/CLEANUP_STATE';
export const SET_PAGE_STATUS = 'LAYOUT_ANALYSIS/SET_PAGE_STATUS';
export const SET_PAGE_LAYOUT = 'LAYOUT_ANALYSIS/SET_PAGE_LAYOUT';
export const SET_PAGE_ERROR = 'LAYOUT_ANALYSIS/SET_PAGE_ERROR';
export const SET_LAYOUT_OVERLAY_VISIBLE = 'LAYOUT_ANALYSIS/SET_LAYOUT_OVERLAY_VISIBLE';
export const SET_TABLE_STRUCTURE_OVERLAY_VISIBLE =
  'LAYOUT_ANALYSIS/SET_TABLE_STRUCTURE_OVERLAY_VISIBLE';
export const SET_LAYOUT_THRESHOLD = 'LAYOUT_ANALYSIS/SET_LAYOUT_THRESHOLD';
export const SET_TABLE_STRUCTURE_THRESHOLD = 'LAYOUT_ANALYSIS/SET_TABLE_STRUCTURE_THRESHOLD';
export const SELECT_BLOCK = 'LAYOUT_ANALYSIS/SELECT_BLOCK';
export const SET_TABLE_STRUCTURE_ENABLED = 'LAYOUT_ANALYSIS/SET_TABLE_STRUCTURE_ENABLED';
export const SET_PAGE_TABLE_STRUCTURES = 'LAYOUT_ANALYSIS/SET_PAGE_TABLE_STRUCTURES';
export const CLEAR_PAGE_RESULTS = 'LAYOUT_ANALYSIS/CLEAR_PAGE_RESULTS';
export const CLEAR_ALL_RESULTS = 'LAYOUT_ANALYSIS/CLEAR_ALL_RESULTS';

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

export interface SetLayoutOverlayVisibleAction extends Action {
  type: typeof SET_LAYOUT_OVERLAY_VISIBLE;
  payload: boolean;
}

export interface SetTableStructureOverlayVisibleAction extends Action {
  type: typeof SET_TABLE_STRUCTURE_OVERLAY_VISIBLE;
  payload: boolean;
}

export interface SetLayoutThresholdAction extends Action {
  type: typeof SET_LAYOUT_THRESHOLD;
  payload: number;
}

export interface SetTableStructureThresholdAction extends Action {
  type: typeof SET_TABLE_STRUCTURE_THRESHOLD;
  payload: number;
}

export interface SelectBlockAction extends Action {
  type: typeof SELECT_BLOCK;
  payload: string | null;
}

export interface SetTableStructureEnabledAction extends Action {
  type: typeof SET_TABLE_STRUCTURE_ENABLED;
  payload: boolean;
}

export interface SetPageTableStructuresAction extends Action {
  type: typeof SET_PAGE_TABLE_STRUCTURES;
  payload: {
    documentId: string;
    pageIndex: number;
    tableStructures: Map<string, TableStructureElement[]>;
  };
}

export interface ClearPageResultsAction extends Action {
  type: typeof CLEAR_PAGE_RESULTS;
  payload: { documentId: string; pageIndex: number };
}

export interface ClearAllResultsAction extends Action {
  type: typeof CLEAR_ALL_RESULTS;
  payload: { documentId: string };
}

export type LayoutAnalysisAction =
  | InitLayoutStateAction
  | CleanupLayoutStateAction
  | SetPageStatusAction
  | SetPageLayoutAction
  | SetPageErrorAction
  | SetLayoutOverlayVisibleAction
  | SetTableStructureOverlayVisibleAction
  | SetLayoutThresholdAction
  | SetTableStructureThresholdAction
  | SelectBlockAction
  | SetTableStructureEnabledAction
  | SetPageTableStructuresAction
  | ClearPageResultsAction
  | ClearAllResultsAction;

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

export function setLayoutOverlayVisible(visible: boolean): SetLayoutOverlayVisibleAction {
  return { type: SET_LAYOUT_OVERLAY_VISIBLE, payload: visible };
}

export function setTableStructureOverlayVisible(
  visible: boolean,
): SetTableStructureOverlayVisibleAction {
  return { type: SET_TABLE_STRUCTURE_OVERLAY_VISIBLE, payload: visible };
}

export function setLayoutThreshold(threshold: number): SetLayoutThresholdAction {
  return { type: SET_LAYOUT_THRESHOLD, payload: threshold };
}

export function setTableStructureThreshold(threshold: number): SetTableStructureThresholdAction {
  return { type: SET_TABLE_STRUCTURE_THRESHOLD, payload: threshold };
}

export function selectBlock(blockId: string | null): SelectBlockAction {
  return { type: SELECT_BLOCK, payload: blockId };
}

export function setTableStructureEnabled(enabled: boolean): SetTableStructureEnabledAction {
  return { type: SET_TABLE_STRUCTURE_ENABLED, payload: enabled };
}

export function setPageTableStructures(
  documentId: string,
  pageIndex: number,
  tableStructures: Map<string, TableStructureElement[]>,
): SetPageTableStructuresAction {
  return { type: SET_PAGE_TABLE_STRUCTURES, payload: { documentId, pageIndex, tableStructures } };
}

export function clearPageResults(documentId: string, pageIndex: number): ClearPageResultsAction {
  return { type: CLEAR_PAGE_RESULTS, payload: { documentId, pageIndex } };
}

export function clearAllResults(documentId: string): ClearAllResultsAction {
  return { type: CLEAR_ALL_RESULTS, payload: { documentId } };
}
