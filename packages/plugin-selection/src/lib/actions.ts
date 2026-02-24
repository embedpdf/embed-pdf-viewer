import { Action } from '@embedpdf/core';
import { PdfPageGeometry, Rect } from '@embedpdf/models';
import { SelectionDocumentState, SelectionRangeX } from './types';

export const INIT_SELECTION_STATE = 'SELECTION/INIT_STATE';
export const CLEANUP_SELECTION_STATE = 'SELECTION/CLEANUP_STATE';
export const CACHE_PAGE_GEOMETRY = 'SELECTION/CACHE_PAGE_GEOMETRY';
export const SET_SELECTION = 'SELECTION/SET_SELECTION';
export const START_SELECTION = 'SELECTION/START_SELECTION';
export const END_SELECTION = 'SELECTION/END_SELECTION';
export const CLEAR_SELECTION = 'SELECTION/CLEAR_SELECTION';
export const SET_RECTS = 'SELECTION/SET_RECTS';
export const SET_SLICES = 'SELECTION/SET_SLICES';
export const EVICT_PAGE_GEOMETRY = 'SELECTION/EVICT_PAGE_GEOMETRY';
export const RESET = 'SELECTION/RESET'; // This might be obsolete, but we'll keep it for now

export interface InitSelectionStateAction extends Action {
  type: typeof INIT_SELECTION_STATE;
  payload: {
    documentId: string;
    state: SelectionDocumentState;
  };
}

export interface CleanupSelectionStateAction extends Action {
  type: typeof CLEANUP_SELECTION_STATE;
  payload: string; // documentId
}

export interface CachePageGeometryAction extends Action {
  type: typeof CACHE_PAGE_GEOMETRY;
  payload: { documentId: string; page: number; geo: PdfPageGeometry };
}
export interface SetSelectionAction extends Action {
  type: typeof SET_SELECTION;
  payload: { documentId: string; selection: SelectionRangeX | null };
}

export interface StartSelectionAction extends Action {
  type: typeof START_SELECTION;
  payload: { documentId: string };
}

export interface EndSelectionAction extends Action {
  type: typeof END_SELECTION;
  payload: { documentId: string };
}

export interface ClearSelectionAction extends Action {
  type: typeof CLEAR_SELECTION;
  payload: { documentId: string };
}

export interface SetRectsAction extends Action {
  type: typeof SET_RECTS;
  payload: { documentId: string; rects: Record<number, Rect[]> };
}

export interface SetSlicesAction extends Action {
  type: typeof SET_SLICES;
  payload: { documentId: string; slices: Record<number, { start: number; count: number }> };
}

export interface EvictPageGeometryAction extends Action {
  type: typeof EVICT_PAGE_GEOMETRY;
  payload: { documentId: string; pages: number[] };
}

export interface ResetAction extends Action {
  type: typeof RESET;
  payload: { documentId: string };
}

export type SelectionAction =
  | InitSelectionStateAction
  | CleanupSelectionStateAction
  | CachePageGeometryAction
  | SetSelectionAction
  | StartSelectionAction
  | EndSelectionAction
  | ClearSelectionAction
  | SetRectsAction
  | SetSlicesAction
  | EvictPageGeometryAction
  | ResetAction;

export const initSelectionState = (
  documentId: string,
  state: SelectionDocumentState,
): InitSelectionStateAction => ({
  type: INIT_SELECTION_STATE,
  payload: { documentId, state },
});

export const cleanupSelectionState = (documentId: string): CleanupSelectionStateAction => ({
  type: CLEANUP_SELECTION_STATE,
  payload: documentId,
});

export const cachePageGeometry = (
  documentId: string,
  page: number,
  geo: PdfPageGeometry,
): CachePageGeometryAction => ({
  type: CACHE_PAGE_GEOMETRY,
  payload: { documentId, page, geo },
});

export const setSelection = (
  documentId: string,
  sel: SelectionRangeX | null,
): SetSelectionAction => ({
  type: SET_SELECTION,
  payload: { documentId, selection: sel },
});

export const startSelection = (documentId: string): StartSelectionAction => ({
  type: START_SELECTION,
  payload: { documentId },
});

export const endSelection = (documentId: string): EndSelectionAction => ({
  type: END_SELECTION,
  payload: { documentId },
});

export const clearSelection = (documentId: string): ClearSelectionAction => ({
  type: CLEAR_SELECTION,
  payload: { documentId },
});

export const setRects = (documentId: string, allRects: Record<number, Rect[]>): SetRectsAction => ({
  type: SET_RECTS,
  payload: { documentId, rects: allRects },
});

export const setSlices = (
  documentId: string,
  slices: Record<number, { start: number; count: number }>,
): SetSlicesAction => ({ type: SET_SLICES, payload: { documentId, slices } });

export const evictPageGeometry = (
  documentId: string,
  pages: number[],
): EvictPageGeometryAction => ({
  type: EVICT_PAGE_GEOMETRY,
  payload: { documentId, pages },
});

export const reset = (documentId: string): ResetAction => ({
  type: RESET,
  payload: { documentId },
});
