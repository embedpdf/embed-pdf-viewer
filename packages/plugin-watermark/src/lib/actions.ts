import { Action } from '@embedpdf/core';
import { WatermarkDefinition, WatermarkPlacement } from './types';

export const ADD_WATERMARK = 'WATERMARK/ADD';
export const REMOVE_WATERMARK = 'WATERMARK/REMOVE';
export const ADD_PLACEMENTS = 'WATERMARK/ADD_PLACEMENTS';
export const CLEAR_PLACEMENTS = 'WATERMARK/CLEAR_PLACEMENTS';

export interface AddWatermarkAction extends Action {
  type: typeof ADD_WATERMARK;
  payload: WatermarkDefinition;
}

export interface RemoveWatermarkAction extends Action {
  type: typeof REMOVE_WATERMARK;
  payload: string; // watermark ID
}

export interface AddPlacementsAction extends Action {
  type: typeof ADD_PLACEMENTS;
  payload: {
    watermarkId: string;
    placements: WatermarkPlacement[];
  };
}

export interface ClearPlacementsAction extends Action {
  type: typeof CLEAR_PLACEMENTS;
  payload: {
    watermarkId: string;
    documentId?: string; // if provided, only clear placements for this doc
  };
}

export type WatermarkAction =
  | AddWatermarkAction
  | RemoveWatermarkAction
  | AddPlacementsAction
  | ClearPlacementsAction;

export function addWatermark(definition: WatermarkDefinition): AddWatermarkAction {
  return { type: ADD_WATERMARK, payload: definition };
}

export function removeWatermark(id: string): RemoveWatermarkAction {
  return { type: REMOVE_WATERMARK, payload: id };
}

export function addPlacements(
  watermarkId: string,
  placements: WatermarkPlacement[],
): AddPlacementsAction {
  return { type: ADD_PLACEMENTS, payload: { watermarkId, placements } };
}

export function clearPlacements(watermarkId: string, documentId?: string): ClearPlacementsAction {
  return { type: CLEAR_PLACEMENTS, payload: { watermarkId, documentId } };
}

