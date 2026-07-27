import { describe, expect, test } from 'vitest';
import {
  CONTINUOUS_RENDER_POLICY,
  snapAppearanceScale,
  snapFullPageViewport,
  snapTileScale,
  type EngineRenderPolicy,
} from '../../src/runtime';

const LATTICE: EngineRenderPolicy = {
  kind: 'lattice',
  fullPage: { widths: [320, 640, 1280, 2560] },
  formats: ['webp'],
  background: 'white',
  enforced: false,
};

describe('snapFullPageViewport', () => {
  test('continuous is the identity — the engine-parity anchor', () => {
    const scale = { kind: 'scale', scale: 0.8 } as const;
    const width = { kind: 'width', width: 717 } as const;
    expect(snapFullPageViewport(CONTINUOUS_RENDER_POLICY, scale)).toBe(scale);
    expect(snapFullPageViewport(CONTINUOUS_RENDER_POLICY, width)).toBe(width);
  });

  test('width requests snap UP to the smallest ladder width that covers them', () => {
    expect(snapFullPageViewport(LATTICE, { kind: 'width', width: 300 })).toEqual({
      kind: 'width',
      width: 320,
    });
    expect(snapFullPageViewport(LATTICE, { kind: 'width', width: 640 })).toEqual({
      kind: 'width',
      width: 640,
    });
    expect(snapFullPageViewport(LATTICE, { kind: 'width', width: 720 })).toEqual({
      kind: 'width',
      width: 1280,
    });
  });

  test('beyond the largest width caps at the largest — deeper detail is the tile pyramid, by design', () => {
    expect(snapFullPageViewport(LATTICE, { kind: 'width', width: 100_000 })).toEqual({
      kind: 'width',
      width: 2560,
    });
  });

  test('scale requests convert through pageWidth and return the CANONICAL width axis', () => {
    // 612pt page at 1× → 612px needed → snaps to 640.
    expect(snapFullPageViewport(LATTICE, { kind: 'scale', scale: 1 }, { pageWidth: 612 })).toEqual({
      kind: 'width',
      width: 640,
    });
    // 2× on the same page → 1224px → snaps to 1280.
    expect(snapFullPageViewport(LATTICE, { kind: 'scale', scale: 2 }, { pageWidth: 612 })).toEqual({
      kind: 'width',
      width: 1280,
    });
    // The memory-bomb case the width lattice exists for: scale 1 of a
    // giant page caps at the ladder top instead of minting a monster.
    expect(
      snapFullPageViewport(LATTICE, { kind: 'scale', scale: 1 }, { pageWidth: 1_000_000 }),
    ).toEqual({ kind: 'width', width: 2560 });
  });

  test('a scale viewport with no scale defaults to 1', () => {
    expect(snapFullPageViewport(LATTICE, { kind: 'scale' }, { pageWidth: 612 })).toEqual({
      kind: 'width',
      width: 640,
    });
  });

  test('scale without pageWidth under a lattice is a programmer error', () => {
    expect(() => snapFullPageViewport(LATTICE, { kind: 'scale', scale: 1 })).toThrow(/pageWidth/);
  });

  test('unsorted ladder widths still snap correctly', () => {
    const unsorted: EngineRenderPolicy = {
      ...LATTICE,
      fullPage: { widths: [2560, 320, 1280, 640] },
    };
    expect(snapFullPageViewport(unsorted, { kind: 'width', width: 400 })).toEqual({
      kind: 'width',
      width: 640,
    });
  });
});

describe('snapAppearanceScale', () => {
  const WITH_APPEARANCES: EngineRenderPolicy = {
    ...LATTICE,
    appearances: { scales: [1, 2, 4] },
  };

  test('continuous is the identity — engine parity again', () => {
    expect(snapAppearanceScale(CONTINUOUS_RENDER_POLICY, 1.5)).toBe(1.5);
  });

  test('a lattice without an appearances block leaves scales untouched', () => {
    // The deployment opted appearances out of the lattice; requests pass
    // through exactly as sent (only the pixel budget still applies).
    expect(snapAppearanceScale(LATTICE, 1.5)).toBe(1.5);
  });

  test('scales snap UP to the smallest lattice scale that covers them', () => {
    expect(snapAppearanceScale(WITH_APPEARANCES, 0.8)).toBe(1);
    expect(snapAppearanceScale(WITH_APPEARANCES, 1)).toBe(1);
    expect(snapAppearanceScale(WITH_APPEARANCES, 1.5)).toBe(2);
    expect(snapAppearanceScale(WITH_APPEARANCES, 3.2)).toBe(4);
  });

  test('beyond the largest scale caps at the largest', () => {
    expect(snapAppearanceScale(WITH_APPEARANCES, 100)).toBe(4);
  });

  test('unsorted lattice scales still snap correctly', () => {
    const unsorted: EngineRenderPolicy = {
      ...LATTICE,
      appearances: { scales: [4, 1, 2] },
    };
    expect(snapAppearanceScale(unsorted, 1.5)).toBe(2);
  });

  test('an empty appearance lattice is a policy-construction error', () => {
    const empty: EngineRenderPolicy = { ...LATTICE, appearances: { scales: [] } };
    expect(() => snapAppearanceScale(empty, 1)).toThrow(/appearance/i);
  });
});

describe('snapTileScale', () => {
  const WITH_TILES: EngineRenderPolicy = {
    ...LATTICE,
    tiles: { tileSizes: [512], scales: [1, 2, 4, 8, 16] },
  };

  test('continuous and tiles-less lattices are the identity — the reserved-block contract', () => {
    // Until WS2c ships the server never advertises `tiles`; the tiling
    // client falls back to its own default pyramid, and this helper must
    // not invent one.
    expect(snapTileScale(CONTINUOUS_RENDER_POLICY, 4.5)).toBe(4.5);
    expect(snapTileScale(LATTICE, 4.5)).toBe(4.5);
  });

  test('scales snap UP through the pyramid and cap at the top', () => {
    expect(snapTileScale(WITH_TILES, 4.5)).toBe(8);
    expect(snapTileScale(WITH_TILES, 8)).toBe(8);
    expect(snapTileScale(WITH_TILES, 100)).toBe(16);
  });

  test('an empty tile lattice is a policy-construction error', () => {
    const empty: EngineRenderPolicy = { ...LATTICE, tiles: { tileSizes: [512], scales: [] } };
    expect(() => snapTileScale(empty, 1)).toThrow(/tile/i);
  });
});
