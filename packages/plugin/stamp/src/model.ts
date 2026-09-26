/** The stamp slice: serializable descriptors only (kernel rule 1) — the
 *  bytes and previews live in the binaries service and never enter the store. */
import type { StampAsset, StampLibrary } from './contract';

export interface StampState {
  libraries: Record<string, StampLibrary>;
  /** Library display order (insertion order). */
  libraryOrder: string[];
  assets: Record<string, StampAsset>;
}

export type StampAction =
  | { type: 'LIBRARY_ADDED'; library: StampLibrary }
  | { type: 'LIBRARY_UPDATED'; library: StampLibrary }
  | { type: 'LIBRARY_REMOVED'; libraryId: string }
  | { type: 'ASSET_ADDED'; asset: StampAsset }
  | { type: 'ASSET_UPDATED'; asset: StampAsset }
  | { type: 'ASSET_REMOVED'; assetId: string };

export const initialStampState = (): StampState => ({
  libraries: {},
  libraryOrder: [],
  assets: {},
});

/** Pure and serializable (kernel rule 1) — descriptors only. */
export const stampReducer = (state: StampState, action: StampAction): StampState => {
  switch (action.type) {
    case 'LIBRARY_ADDED':
      return {
        ...state,
        libraries: { ...state.libraries, [action.library.id]: action.library },
        libraryOrder: [...state.libraryOrder, action.library.id],
      };
    case 'LIBRARY_UPDATED':
      return state.libraries[action.library.id]
        ? { ...state, libraries: { ...state.libraries, [action.library.id]: action.library } }
        : state;
    case 'LIBRARY_REMOVED': {
      const library = state.libraries[action.libraryId];
      if (!library) return state;
      const libraries = { ...state.libraries };
      delete libraries[action.libraryId];
      const assets = { ...state.assets };
      for (const id of library.assetIds) delete assets[id];
      return {
        ...state,
        libraries,
        libraryOrder: state.libraryOrder.filter((id) => id !== action.libraryId),
        assets,
      };
    }
    case 'ASSET_ADDED': {
      const library = state.libraries[action.asset.libraryId];
      if (!library) return state;
      return {
        ...state,
        assets: { ...state.assets, [action.asset.id]: action.asset },
        libraries: {
          ...state.libraries,
          [library.id]: { ...library, assetIds: [...library.assetIds, action.asset.id] },
        },
      };
    }
    case 'ASSET_UPDATED':
      return state.assets[action.asset.id]
        ? { ...state, assets: { ...state.assets, [action.asset.id]: action.asset } }
        : state;
    case 'ASSET_REMOVED': {
      const asset = state.assets[action.assetId];
      if (!asset) return state;
      const assets = { ...state.assets };
      delete assets[action.assetId];
      const library = state.libraries[asset.libraryId];
      return {
        ...state,
        assets,
        libraries: library
          ? {
              ...state.libraries,
              [library.id]: {
                ...library,
                assetIds: library.assetIds.filter((id) => id !== action.assetId),
              },
            }
          : state.libraries,
      };
    }
    default:
      return state;
  }
};
