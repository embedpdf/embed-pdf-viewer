/**
 * The stamp plugin's session state: libraries, their display order and
 * assets, as serializable descriptors. The bytes and previews they describe
 * live in the binaries resource (`services/binaries.ts`) and never enter
 * state. Every function below is a pure transition; the areas apply them
 * with `ctx.state.update`.
 */
import type { StampAsset, StampLibrary } from './contract';

export interface StampState {
  readonly libraries: Readonly<Record<string, StampLibrary>>;
  /** Library display order (insertion order). */
  readonly libraryOrder: readonly string[];
  readonly assets: Readonly<Record<string, StampAsset>>;
}

export const initialStampState = (): StampState => ({
  libraries: {},
  libraryOrder: [],
  assets: {},
});

/** Append a library to the display order. */
export function addLibrary(state: StampState, library: StampLibrary): StampState {
  return {
    ...state,
    libraries: { ...state.libraries, [library.id]: library },
    libraryOrder: [...state.libraryOrder, library.id],
  };
}

/** Replace a known library's descriptor; an unknown id changes nothing. */
export function setLibrary(state: StampState, library: StampLibrary): StampState {
  if (!state.libraries[library.id]) return state;
  return { ...state, libraries: { ...state.libraries, [library.id]: library } };
}

/** Remove a library together with its assets. */
export function removeLibrary(state: StampState, libraryId: string): StampState {
  const library = state.libraries[libraryId];
  if (!library) return state;
  const { [libraryId]: _removed, ...libraries } = state.libraries;
  const assets = { ...state.assets };
  for (const id of library.assetIds) delete assets[id];
  return {
    ...state,
    libraries,
    libraryOrder: state.libraryOrder.filter((id) => id !== libraryId),
    assets,
  };
}

/** Add an asset to the end of its library; an asset of an unknown library changes nothing. */
export function addAsset(state: StampState, asset: StampAsset): StampState {
  const library = state.libraries[asset.libraryId];
  if (!library) return state;
  return {
    ...state,
    assets: { ...state.assets, [asset.id]: asset },
    libraries: {
      ...state.libraries,
      [library.id]: { ...library, assetIds: [...library.assetIds, asset.id] },
    },
  };
}

/** Replace a known asset's descriptor; an unknown id changes nothing. */
export function setAsset(state: StampState, asset: StampAsset): StampState {
  if (!state.assets[asset.id]) return state;
  return { ...state, assets: { ...state.assets, [asset.id]: asset } };
}

/** Remove an asset and its entry in its library's order. */
export function removeAsset(state: StampState, assetId: string): StampState {
  const asset = state.assets[assetId];
  if (!asset) return state;
  const { [assetId]: _removed, ...assets } = state.assets;
  const library = state.libraries[asset.libraryId];
  return {
    ...state,
    assets,
    libraries: library
      ? {
          ...state.libraries,
          [library.id]: {
            ...library,
            assetIds: library.assetIds.filter((id) => id !== assetId),
          },
        }
      : state.libraries,
  };
}
