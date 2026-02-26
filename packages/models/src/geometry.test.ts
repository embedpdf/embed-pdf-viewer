import {
  scaleRect,
  rotateRect,
  swap,
  transformSize,
  Rotation,
  transformRect,
  restoreRect,
  rectsIntersect,
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

  test('rectsIntersect should return true for overlapping rects', () => {
    const a = { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } };
    const b = { origin: { x: 5, y: 5 }, size: { width: 10, height: 10 } };
    expect(rectsIntersect(a, b)).toBe(true);
  });

  test('rectsIntersect should return false for disjoint rects', () => {
    const a = { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } };
    const b = { origin: { x: 11, y: 11 }, size: { width: 10, height: 10 } };
    expect(rectsIntersect(a, b)).toBe(false);
  });

  test('rectsIntersect should return true for edge touch', () => {
    const a = { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } };
    const b = { origin: { x: 10, y: 0 }, size: { width: 10, height: 10 } };
    expect(rectsIntersect(a, b)).toBe(true);
  });

  test('rectsIntersect should return true for containment', () => {
    const outer = { origin: { x: 0, y: 0 }, size: { width: 20, height: 20 } };
    const inner = { origin: { x: 5, y: 5 }, size: { width: 2, height: 2 } };
    expect(rectsIntersect(outer, inner)).toBe(true);
  });
});
