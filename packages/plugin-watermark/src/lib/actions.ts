import { Action } from '@embedpdf/core';
import { WatermarkDefinition, WatermarkPlacement } from './types';

export const ADD_WATERMARK = 'WATERMARK/ADD';
export const REMOVE_WATERMARK = 'WATERMARK/REMOVE';
export const ADD_PLACEMENTS = 'WATERMARK/ADD_PLACEMENTS';
export const CLEAR_PLACEMENTS = 'WATERMARK/CLEAR_PLACEMENTS';
export const CLEAR_DOCUMENT = 'WATERMARK/CLEAR_DOCUMENT';

export interface AddWatermarkAction extends Action {
  type: typeof ADD_WATERMARK;
  payload: {
    documentId: string;
    definition: WatermarkDefinition;
  };
}

export interface RemoveWatermarkAction extends Action {
  type: typeof REMOVE_WATERMARK;
  payload: {
    documentId: string;
    watermarkId: string;
  };
}

export interface AddPlacementsAction extends Action {
  type: typeof ADD_PLACEMENTS;
  payload: {
    documentId: string;
    watermarkId: string;
    placements: WatermarkPlacement[];
  };
}

export interface ClearPlacementsAction extends Action {
  type: typeof CLEAR_PLACEMENTS;
  payload: {
    documentId: string;
    watermarkId: string;
  };
}

export interface ClearDocumentAction extends Action {
  type: typeof CLEAR_DOCUMENT;
  payload: {
    documentId: string;
  };
}

export type WatermarkAction =
  | AddWatermarkAction
  | RemoveWatermarkAction
  | AddPlacementsAction
  | ClearPlacementsAction
  | ClearDocumentAction;

export function addWatermark(documentId: string, definition: WatermarkDefinition): AddWatermarkAction {
  return { type: ADD_WATERMARK, payload: { documentId, definition } };
}

export function removeWatermark(documentId: string, watermarkId: string): RemoveWatermarkAction {
  return { type: REMOVE_WATERMARK, payload: { documentId, watermarkId } };
}

export function addPlacements(
  documentId: string,
  watermarkId: string,
  placements: WatermarkPlacement[],
): AddPlacementsAction {
  return { type: ADD_PLACEMENTS, payload: { documentId, watermarkId, placements } };
}

export function clearPlacements(documentId: string, watermarkId: string): ClearPlacementsAction {
  return { type: CLEAR_PLACEMENTS, payload: { documentId, watermarkId } };
}

export function clearDocument(documentId: string): ClearDocumentAction {
  return { type: CLEAR_DOCUMENT, payload: { documentId } };
}

