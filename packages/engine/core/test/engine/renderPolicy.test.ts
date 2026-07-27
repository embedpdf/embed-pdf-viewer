import { describe, expect, test } from 'vitest';
import {
  CONTINUOUS_RENDER_POLICY,
  snapViewportToPolicy,
  type EngineRenderPolicy,
} from '../../src/runtime';

const LATTICE: EngineRenderPolicy = {
  kind: 'lattice',
  scales: [1, 2],
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

  test('scale requests snap UP to the smallest lattice point that covers them', () => {
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 0.8 })).toEqual({
      kind: 'scale',
      scale: 1,
    });
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 1 })).toEqual({
      kind: 'scale',
      scale: 1,
    });
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 1.5 })).toEqual({
      kind: 'scale',
      scale: 2,
    });
  });

  test('beyond the largest point caps at the largest (never rejects here)', () => {
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale', scale: 7 })).toEqual({
      kind: 'scale',
      scale: 2,
    });
  });

  test('a scale viewport with no scale defaults to 1', () => {
    expect(snapViewportToPolicy(LATTICE, { kind: 'scale' })).toEqual({ kind: 'scale', scale: 1 });
  });

  test('width requests convert through pageWidth and return the CANONICAL axis', () => {
    // 612pt page, 720px requested → 1.176× → snaps to 2.
    expect(
      snapViewportToPolicy(LATTICE, { kind: 'width', width: 720 }, { pageWidth: 612 }),
    ).toEqual({ kind: 'scale', scale: 2 });
    // 306px on a 612pt page → 0.5× → snaps to 1.
    expect(
      snapViewportToPolicy(LATTICE, { kind: 'width', width: 306 }, { pageWidth: 612 }),
    ).toEqual({ kind: 'scale', scale: 1 });
  });

  test('width without pageWidth under a lattice is a programmer error', () => {
    expect(() => snapViewportToPolicy(LATTICE, { kind: 'width', width: 720 })).toThrow(/pageWidth/);
  });

  test('unsorted lattice scales still snap correctly', () => {
    const unsorted: EngineRenderPolicy = { ...LATTICE, scales: [2, 1] };
    expect(snapViewportToPolicy(unsorted, { kind: 'scale', scale: 0.4 })).toEqual({
      kind: 'scale',
      scale: 1,
    });
  });
});
