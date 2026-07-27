import { describe, expect, test } from 'vitest';
import {
  CONTINUOUS_RENDER_POLICY,
  snapViewportToPolicy,
  type EngineRenderPolicy,
} from '../../src/runtime';

const LATTICE: EngineRenderPolicy = {
  kind: 'lattice',
  fullPage: { widths: [320, 640, 1280, 2560] },
  formats: ['webp'],
  background: 'white',
  enforced: false,
};

describe('snapViewportToPolicy', () => {
  test('continuous is the identity — the engine-parity anchor', () => {
    const scale = { kind: 'scale', scale: 0.8 } as const;
    const width = { kind: 'width', width: 717 } as const;
    expect(snapViewportToPolicy(CONTINUOUS_RENDER_POLICY, scale)).toBe(scale);
    expect(snapViewportToPolicy(CONTINUOUS_RENDER_POLICY, width)).toBe(width);
  });

  test('width requests snap UP to the smallest ladder width that covers them', () => {
    expect(snapViewportToPolicy(LATTICE, { kind: 'width', width: 300 })).toEqual({
      kind: 'width',
      width: 320,
    });
    expect(snapViewportToPolicy(LATTICE, { kind: 'width', width: 640 })).toEqual({
      kind: 'width',
      width: 640,
    });
    expect(snapViewportToPolicy(LATTICE, { kind: 'width', width: 720 })).toEqual({
      kind: 'width',
      width: 1280,
    });
  });

  test('beyond the largest width caps at the largest — deeper detail is the tile pyramid, by design', () => {
    expect(snapViewportToPolicy(LATTICE, { kind: 'width', width: 100_000 })).toEqual({
      kind: 'width',
      width: 2560,
    });
  });

  test('scale requests convert through pageWidth and return the CANONICAL width axis', () => {
    // 612pt page at 1× → 612px needed → snaps to 640.
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 1 }, { pageWidth: 612 })).toEqual({
      kind: 'width',
      width: 640,
    });
    // 2× on the same page → 1224px → snaps to 1280.
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 2 }, { pageWidth: 612 })).toEqual({
      kind: 'width',
      width: 1280,
    });
    // The memory-bomb case the width lattice exists for: scale 1 of a
    // giant page caps at the ladder top instead of minting a monster.
    expect(
      snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 1 }, { pageWidth: 1_000_000 }),
    ).toEqual({ kind: 'width', width: 2560 });
  });

  test('a scale viewport with no scale defaults to 1', () => {
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale' }, { pageWidth: 612 })).toEqual({
      kind: 'width',
      width: 640,
    });
  });

  test('scale without pageWidth under a lattice is a programmer error', () => {
    expect(() => snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 1 })).toThrow(/pageWidth/);
  });

  test('unsorted ladder widths still snap correctly', () => {
    const unsorted: EngineRenderPolicy = {
      ...LATTICE,
      fullPage: { widths: [2560, 320, 1280, 640] },
    };
    expect(snapViewportToPolicy(unsorted, { kind: 'width', width: 400 })).toEqual({
      kind: 'width',
      width: 640,
    });
  });
});
