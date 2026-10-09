import { describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { StampAsset, StampLibrary } from '@embedpdf/plugin-stamp/contract';

import { signerRowsOf } from '../src/contract';

const assetOf = (libraryId: string, name: string): StampAsset => ({
  id: `${libraryId}:${name}`,
  libraryId,
  kind: 'stamp' as StampAsset['kind'],
  name,
  label: name,
  size: { width: 100, height: 40 },
  page: toPageRef(1),
});

const libraryOf = (id: string, name: string, kind: string): StampLibrary =>
  ({ id, name, kind, assetIds: [] }) as unknown as StampLibrary;

describe('signerRowsOf', () => {
  it('makes one row per person, with their signatures and initials', () => {
    const ada = libraryOf('ada', 'Ada Lovelace', 'signatures');
    const grace = libraryOf('grace', 'Grace Hopper', 'signatures');
    const signature = assetOf('ada', 'signature');
    const second = assetOf('ada', 'signature 2');
    const initials = assetOf('ada', 'initials');
    const rows = signerRowsOf([ada, grace], [signature, initials, second]);
    expect(rows).toEqual([
      {
        libraryId: 'ada',
        name: 'Ada Lovelace',
        library: ada,
        signatures: [signature, second],
        initials,
      },
      { libraryId: 'grace', name: 'Grace Hopper', library: grace, signatures: [], initials: null },
    ]);
  });

  it('leaves out a library that holds no person', () => {
    const office = libraryOf('office', 'Office', 'stamps');
    expect(signerRowsOf([office], [assetOf('office', 'Approved')])).toEqual([]);
  });
});
