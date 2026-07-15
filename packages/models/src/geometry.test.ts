import {
  scaleRect,
  rotateRect,
  swap,
  transformSize,
  Rotation,
  transformRect,
  restoreRect,
  orientedQuadFromPageBoxAndMatrix,
  pdfAttachmentPointsToQuad,
  quadToPdfAttachmentPoints,
  buildSegmentQuadFromGlyphQuads,
  rectToQuad,
  quadToRect,
  getQuadBottomEdge,
  getQuadMidline,
} from './geometry';

describe('Geometry', () => {
  test('swap should swap width and height', () => {
    const size = {
      width: 100,
      height: 50,
    };
    expect(swap(size)).toEqual({
      width: 50,
      height: 100,
    });
  });

  test('calculateSize should return rotated and scaled size', () => {
    const size = {
      width: 50,
      height: 100,
    };

    const result = transformSize(size, Rotation.Degree90, 2);
    expect(result).toEqual({
      width: 200,
      height: 100,
    });
  });

  test('rotate should rotate rect in container', () => {
    const container = {
      origin: {
        x: 0,
        y: 0,
      },
      size: {
        width: 50,
        height: 80,
      },
    };
    const rect = {
      origin: {
        x: 10,
        y: 20,
      },
      size: {
        width: 10,
        height: 20,
      },
    };
    expect(rotateRect(container.size, rect, Rotation.Degree0)).toStrictEqual({
      origin: {
        x: 10,
        y: 20,
      },
      size: {
        width: 10,
        height: 20,
      },
    });
    expect(rotateRect(container.size, rect, Rotation.Degree90)).toStrictEqual({
      origin: {
        x: 40,
        y: 10,
      },
      size: {
        width: 20,
        height: 10,
      },
    });
    expect(rotateRect(container.size, rect, Rotation.Degree180)).toStrictEqual({
      origin: {
        x: 30,
        y: 40,
      },
      size: {
        width: 10,
        height: 20,
      },
    });
    expect(rotateRect(container.size, rect, Rotation.Degree270)).toStrictEqual({
      origin: {
        x: 20,
        y: 30,
      },
      size: {
        width: 20,
        height: 10,
      },
    });
  });

  test('scale should scale origin and size', () => {
    const rect = {
      origin: {
        x: 10,
        y: 20,
      },
      size: {
        width: 30,
        height: 40,
      },
    };
    expect(scaleRect(rect, 2)).toEqual({
      origin: {
        x: 20,
        y: 40,
      },
      size: {
        width: 60,
        height: 80,
      },
    });
  });

  test('transformRect and restoreRect should be match', () => {
    const container = {
      origin: {
        x: 0,
        y: 0,
      },
      size: {
        width: 50,
        height: 80,
      },
    };
    const rect = {
      origin: {
        x: 10,
        y: 20,
      },
      size: {
        width: 10,
        height: 20,
      },
    };
    const rotation = Rotation.Degree90;
    const scaleFactor = 2;
    const transformedRect = transformRect(container.size, rect, Rotation.Degree90, scaleFactor);
    expect(transformedRect).toStrictEqual({
      origin: {
        x: 80,
        y: 20,
      },
      size: {
        width: 40,
        height: 20,
      },
    });

    expect(
      restoreRect(
        transformSize(container.size, rotation, scaleFactor),
        transformedRect,
        rotation,
        scaleFactor,
      ),
    ).toStrictEqual(rect);
  });
});

describe('Oriented quad helpers', () => {
  test('orientedQuadFromPageBoxAndMatrix preserves horizontal glyph quad', () => {
    const quad = orientedQuadFromPageBoxAndMatrix(10, 20, 30, 0, {
      a: 1,
      b: 0,
      c: 0,
      d: 1,
      e: 0,
      f: 0,
    });

    expect(quad.p1).toEqual({ x: 10, y: 20 });
    expect(quad.p2).toEqual({ x: 30, y: 20 });
    expect(quad.p3).toEqual({ x: 30, y: 0 });
    expect(quad.p4).toEqual({ x: 10, y: 0 });
  });

  test('orientedQuadFromPageBoxAndMatrix handles 90 degree rotation', () => {
    const quad = orientedQuadFromPageBoxAndMatrix(0, 20, 10, 0, {
      a: 0,
      b: 1,
      c: -1,
      d: 0,
      e: 0,
      f: 0,
    });

    expect(quadToRect(quad).size.width).toBeCloseTo(20, 5);
    expect(quadToRect(quad).size.height).toBeCloseTo(10, 5);
  });

  test('pdf attachment points round-trip internal quad convention', () => {
    const quad = rectToQuad({
      origin: { x: 5, y: 10 },
      size: { width: 20, height: 8 },
    });
    const [bl, br, tl, tr] = quadToPdfAttachmentPoints(quad);
    const restored = pdfAttachmentPointsToQuad(bl, br, tl, tr);

    expect(restored).toEqual(quad);
  });

  test('buildSegmentQuadFromGlyphQuads spans first and last glyph quads', () => {
    const first = rectToQuad({ origin: { x: 0, y: 0 }, size: { width: 5, height: 10 } });
    const last = rectToQuad({ origin: { x: 20, y: 0 }, size: { width: 5, height: 10 } });
    const segment = buildSegmentQuadFromGlyphQuads(first, last);

    expect(segment.p1).toEqual(first.p1);
    expect(segment.p2).toEqual(last.p2);
    expect(segment.p3).toEqual(last.p3);
    expect(segment.p4).toEqual(first.p4);
    expect(quadToRect(segment).size.width).toBe(25);
  });

  test('quad edge helpers follow reading-order convention', () => {
    const quad = rectToQuad({ origin: { x: 0, y: 0 }, size: { width: 10, height: 4 } });
    expect(getQuadBottomEdge(quad)).toEqual({
      start: { x: 0, y: 4 },
      end: { x: 10, y: 4 },
    });
    expect(getQuadMidline(quad)).toEqual({
      start: { x: 0, y: 2 },
      end: { x: 10, y: 2 },
    });
  });
});
