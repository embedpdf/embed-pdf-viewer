import { describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/engine-core/runtime';

import type { StampAsset, StampLibrary } from '../src/contract';
import {
  addAsset,
  addLibrary,
  initialStampState,
  removeAsset,
  removeLibrary,
  setAsset,
  setLibrary,
} from '../src/model';

const library: StampLibrary = { id: 'lib', name: 'Mine', kind: 'stamps', assetIds: [] };
const asset = (name: string): StampAsset => ({
  id: `lib:${name}`,
  libraryId: 'lib',
  kind: 'stamp',
  name,
  label: name,
  size: { width: 10, height: 10 },
  page: toPageRef(100),
});

describe('stamp transitions', () => {
  it('adds libraries in order and assets to the end of their library', () => {
    const state = addAsset(
      addAsset(addLibrary(initialStampState(), library), asset('One')),
      asset('Two'),
    );
    expect(state.libraryOrder).toEqual(['lib']);
    expect(state.libraries.lib.assetIds).toEqual(['lib:One', 'lib:Two']);
    expect(state.assets['lib:Two'].name).toBe('Two');
  });

  it('changes nothing for unknown libraries and assets', () => {
    const state = addLibrary(initialStampState(), library);
    expect(addAsset(state, { ...asset('One'), libraryId: 'other' })).toBe(state);
    expect(setLibrary(state, { ...library, id: 'other' })).toBe(state);
    expect(setAsset(state, asset('One'))).toBe(state);
    expect(removeAsset(state, 'lib:One')).toBe(state);
    expect(removeLibrary(state, 'other')).toBe(state);
  });

  it('replaces descriptors, and removes an asset from its library order', () => {
    const state = addAsset(addLibrary(initialStampState(), library), asset('One'));
    const renamed = setLibrary(state, { ...state.libraries.lib, name: 'Renamed' });
    expect(renamed.libraries.lib.name).toBe('Renamed');
    const relabeled = setAsset(state, { ...asset('One'), label: 'Uno' });
    expect(relabeled.assets['lib:One'].label).toBe('Uno');
    const removed = removeAsset(state, 'lib:One');
    expect(removed.assets).toEqual({});
    expect(removed.libraries.lib.assetIds).toEqual([]);
  });

  it('removes a library together with its assets', () => {
    const state = addAsset(addLibrary(initialStampState(), library), asset('One'));
    const removed = removeLibrary(state, 'lib');
    expect(removed).toEqual(initialStampState());
  });
});
