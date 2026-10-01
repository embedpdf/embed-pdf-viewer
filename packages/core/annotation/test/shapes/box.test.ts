import type { Annotation } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { boxCorners, boxFamily, boxHandles, boxResize, type BoxShape } from '../../src/shapes/box';

const BOX = { x: 100, y: 200, width: 80, height: 40 };

const square = (rotation: number | null) =>
  ({
    subtype: 'square',
    rect: { x: 0, y: 0, width: 1, height: 1 },
    box: BOX,
    rotation,
  }) as unknown as Annotation;

const link = { subtype: 'link', rect: BOX } as unknown as Annotation;

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

describe('the box family reads and writes the engine fields', () => {
  it("a square's shape is its engine box and turn, written back unchanged", () => {
    const shape = boxFamily.read(square(30));
    expect(shape).toEqual({ kind: 'box', box: BOX, rotation: 30, ellipse: false });
    expect(boxFamily.write(shape, 'square')).toEqual({ box: BOX, rotation: 30 });
  });

  it('an upright square writes its turn as null, so a stored turn is cleared', () => {
    const shape = boxFamily.read(square(null));
    expect(shape.rotation).toBe(0);
    expect(boxFamily.write(shape, 'square')).toEqual({ box: BOX, rotation: null });
  });

  it("a circle's shape is drawn as the ellipse in its box", () => {
    const circle = { ...square(0), subtype: 'circle' } as unknown as Annotation;
    expect(boxFamily.read(circle).ellipse).toBe(true);
  });

  it("a link's shape is its rect, written back as its rect", () => {
    const shape = boxFamily.read(link);
    expect(shape).toEqual({ kind: 'box', box: BOX, rotation: 0, ellipse: false });
    expect(boxFamily.write(shape, 'link')).toEqual({ rect: BOX });
  });
});

describe('the box family on a turned box', () => {
  const turned: BoxShape = { kind: 'box', box: BOX, rotation: 90, ellipse: false };

  it('the corner handles sit on the corners the page shows', () => {
    const corners = boxCorners(turned);
    const byId = Object.fromEntries(boxHandles(turned).map((handle) => [handle.id, handle.at]));
    close(byId.nw!, corners[0]);
    close(byId.ne!, corners[1]);
    close(byId.se!, corners[2]);
    close(byId.sw!, corners[3]);
  });

  it('a resize keeps the opposite corner where the page shows it', () => {
    const [nw] = boxCorners(turned);
    const handle = boxHandles(turned).find((candidate) => candidate.id === 'se')!;
    const resized = boxResize(turned, 'se', { x: handle.at.x - 10, y: handle.at.y + 20 });
    expect(resized.rotation).toBe(90);
    close(boxCorners(resized)[0], nw);
  });
});
