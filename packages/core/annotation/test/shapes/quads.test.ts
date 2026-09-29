import { quadFromRect } from '@embedpdf/core-geometry';
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { quadsHit, quadsTranslate, readQuads } from '../../src/shapes/quads';

const QUAD = quadFromRect({ x: 100, y: 200, width: 80, height: 12 });

describe('the quads family', () => {
  it("a highlight's shape is its quadPoints, as read", () => {
    const highlight = {
      subtype: 'highlight',
      rect: { x: 100, y: 200, width: 80, height: 12 },
      quadPoints: [QUAD],
    } as unknown as Parameters<typeof readQuads>[0] & AnnotationDTO;
    expect(readQuads(highlight)).toEqual({ kind: 'quads', quadPoints: [QUAD] });
  });

  it('is hit anywhere inside a quad, and moves as a whole', () => {
    const shape = { kind: 'quads' as const, quadPoints: [QUAD] };
    expect(quadsHit(shape, { x: 140, y: 206 })).toBe(true);
    expect(quadsHit(shape, { x: 140, y: 220 })).toBe(false);
    const moved = quadsTranslate(shape, { x: 10, y: -5 });
    expect(moved.quadPoints[0]).toEqual(quadFromRect({ x: 110, y: 195, width: 80, height: 12 }));
  });
});
