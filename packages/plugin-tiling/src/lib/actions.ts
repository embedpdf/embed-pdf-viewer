import { Action } from '@embedpdf/core';
import { Tile, TileStatus, TilingDocumentState } from './types';

export const INIT_TILING_STATE = 'TILING/INIT_STATE';
export const CLEANUP_TILING_STATE = 'TILING/CLEANUP_STATE';
export const UPDATE_VISIBLE_TILES = 'TILING/UPDATE_VISIBLE_TILES';
export const MARK_TILE_STATUS = 'TILING/MARK_TILE_STATUS';

export interface InitTilingStateAction extends Action {
  type: typeof INIT_TILING_STATE;
  payload: {
    documentId: string;
    state: TilingDocumentState;
  };
}

export interface CleanupTilingStateAction extends Action {
  type: typeof CLEANUP_TILING_STATE;
  payload: string; // documentId
}

export type UpdateVisibleTilesAction = {
  type: typeof UPDATE_VISIBLE_TILES;
  payload: {
    documentId: string;
    tiles: Record<number, Tile[]>;
  };
};

export type MarkTileStatusAction = {
  type: typeof MARK_TILE_STATUS;
  payload: {
    documentId: string;
    pageIndex: number;
    tileId: string;
    status: TileStatus;
  };
};

export type TilingAction =
  | InitTilingStateAction
  | CleanupTilingStateAction
  | UpdateVisibleTilesAction
  | MarkTileStatusAction;

export const initTilingState = (
  documentId: string,
  state: TilingDocumentState,
): InitTilingStateAction => ({
  type: INIT_TILING_STATE,
  payload: { documentId, state },
});

export const cleanupTilingState = (documentId: string): CleanupTilingStateAction => ({
  type: CLEANUP_TILING_STATE,
  payload: documentId,
});

export const updateVisibleTiles = (
  documentId: string,
  tiles: Record<number, Tile[]>,
): UpdateVisibleTilesAction => ({
  type: UPDATE_VISIBLE_TILES,
  payload: { documentId, tiles },
});

export const markTileStatus = (
  documentId: string,
  pageIndex: number,
  tileId: string,
  status: TileStatus,
): MarkTileStatusAction => ({
  type: MARK_TILE_STATUS,
  payload: { documentId, pageIndex, tileId, status },
});
