import { Action } from '@embedpdf/core';
import { PdfPageGeometry, Rect } from '@embedpdf/models';
import { SelectionRangeX } from './types';
import { GlyphAccelerationModel } from './utils';

export const CACHE_PAGE_GEOMETRY = 'CACHE_PAGE_GEOMETRY';
export const SET_SELECTION = 'SET_SELECTION';
export const START_SELECTION = 'START_SELECTION';
export const END_SELECTION = 'END_SELECTION';
export const CLEAR_SELECTION = 'CLEAR_SELECTION';
export const SET_RECTS = 'SET_RECTS';
export const SET_SLICES = 'SET_SLICES';
export const RESET = 'RESET';

export interface CachePageGeometryAction extends Action {
  type: typeof CACHE_PAGE_GEOMETRY;
  payload: { page: number; geo: GlyphAccelerationModel };
}
export interface SetSelectionAction extends Action {
  type: typeof SET_SELECTION;
  payload: SelectionRangeX | null;
}

export interface StartSelectionAction extends Action {
  type: typeof START_SELECTION;
}

export interface EndSelectionAction extends Action {
  type: typeof END_SELECTION;
}

export interface ClearSelectionAction extends Action {
  type: typeof CLEAR_SELECTION;
}

export interface SetRectsAction extends Action {
  type: typeof SET_RECTS;
  payload: Record<number, Rect[]>;
}

export interface SetSlicesAction extends Action {
  type: typeof SET_SLICES;
  payload: Record<number, { start: number; count: number }>;
}

export interface ResetAction extends Action {
  type: typeof RESET;
}

export type SelectionAction =
  | CachePageGeometryAction
  | SetSelectionAction
  | StartSelectionAction
  | EndSelectionAction
  | ClearSelectionAction
  | SetRectsAction
  | SetSlicesAction
  | ResetAction;

export const cachePageGeometry = (page: number, geo: GlyphAccelerationModel): CachePageGeometryAction => ({
  type: CACHE_PAGE_GEOMETRY,
  payload: { page, geo },
});

export const setSelection = (sel: SelectionRangeX): SetSelectionAction => ({
  type: SET_SELECTION,
  payload: sel,
});

export const startSelection = (): StartSelectionAction => ({ type: START_SELECTION });

export const endSelection = (): EndSelectionAction => ({ type: END_SELECTION });

export const clearSelection = (): ClearSelectionAction => ({ type: CLEAR_SELECTION });

export const setRects = (allRects: Record<number, Rect[]>): SetRectsAction => ({
  type: SET_RECTS,
  payload: allRects,
});

export const setSlices = (
  slices: Record<number, { start: number; count: number }>,
): SetSlicesAction => ({ type: SET_SLICES, payload: slices });

export const reset = (): ResetAction => ({ type: RESET });
