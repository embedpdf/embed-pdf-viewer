import { Reducer } from '@embedpdf/core';

import {
  UPDATE_VISIBLE_TILES,
  MARK_TILE_STATUS,
  TilingAction,
  INIT_TILING_STATE,
  CLEANUP_TILING_STATE,
} from './actions';
import { Tile, TilingDocumentState, TilingState } from './types';

export const initialTilingDocumentState: TilingDocumentState = {
  visibleTiles: {},
};

export const initialState: TilingState = {
  documents: {},
};

export const tilingReducer: Reducer<TilingState, TilingAction> = (state, action) => {
  switch (action.type) {
    case INIT_TILING_STATE: {
      const { documentId, state: docState } = action.payload;
      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: docState,
        },
      };
    }

    case CLEANUP_TILING_STATE: {
      const documentId = action.payload;
      const { [documentId]: removed, ...remaining } = state.documents;
      return {
        ...state,
        documents: remaining,
      };
    }

    case UPDATE_VISIBLE_TILES: {
      const { documentId, tiles: incoming } = action.payload; // Record<number, Tile[]>
      const docState = state.documents[documentId];
      if (!docState) return state;

      const nextPages = { ...docState.visibleTiles };

      for (const key in incoming) {
        const pageIndex = Number(key);
        const newTiles = incoming[pageIndex]; // all isFallback=false
        const prevTiles = nextPages[pageIndex] ?? [];

        const prevScale = prevTiles.find((t) => !t.isFallback)?.srcScale;
        const newScale = newTiles.length > 0 ? newTiles[0].srcScale : prevScale;
        const zoomChanged = prevScale !== undefined && prevScale !== newScale;

        if (zoomChanged) {
          /* 1️⃣  ready tiles from the old zoom → new fallback */
          const promoted = prevTiles
            .filter((t) => !t.isFallback && t.status === 'ready')
            .map((t) => ({ ...t, isFallback: true }));

          /* 2️⃣  decide which fallback tiles to keep           */
          const fallbackToCarry = promoted.length > 0 ? [] : prevTiles.filter((t) => t.isFallback);

          /* 3️⃣  final list = (maybe-kept fallback) + promoted + newTiles */
          nextPages[pageIndex] = [...fallbackToCarry, ...promoted, ...newTiles];
        } else {
          /* same zoom → keep current fallback, replace visible */
          const newIds = new Set(newTiles.map((t) => t.id));
          const keepers: Tile[] = []; // where we’ll collect surviving tiles
          const seenIds = new Set<string>();

          /* 2️⃣  loop prevTiles once */
          for (const t of prevTiles) {
            if (t.isFallback) {
              keepers.push(t); // always keep fallback
              seenIds.add(t.id);
            } else if (newIds.has(t.id)) {
              keepers.push(t); // keep old visible tile (preserves status)
              seenIds.add(t.id);
            }
          }

          /* 3️⃣  append *brand-new* tiles (not yet kept) */
          for (const t of newTiles) {
            if (!seenIds.has(t.id)) keepers.push(t);
          }

          /* 4️⃣  store result */
          nextPages[pageIndex] = keepers;
        }
      }

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            visibleTiles: nextPages,
          },
        },
      };
    }

    case MARK_TILE_STATUS: {
      const { documentId, pageIndex, tileId, status } = action.payload;
      const docState = state.documents[documentId];
      if (!docState) return state;

      const tiles =
        docState.visibleTiles[pageIndex]?.map((t) =>
          t.id === tileId ? ({ ...t, status } as Tile) : t,
        ) ?? [];

      const newTiles = tiles.filter((t) => !t.isFallback);
      const allReady = newTiles.length > 0 && newTiles.every((t) => t.status === 'ready');
      const finalTiles = allReady ? newTiles : tiles;

      return {
        ...state,
        documents: {
          ...state.documents,
          [documentId]: {
            ...docState,
            visibleTiles: { ...docState.visibleTiles, [pageIndex]: finalTiles },
          },
        },
      };
    }

    default:
      return state;
  }
};
