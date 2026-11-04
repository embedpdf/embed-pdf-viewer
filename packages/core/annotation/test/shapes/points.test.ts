import type { Annotation } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { paintedNear } from '../../src/painted';
import { rotatePoint } from '../../src/rect';
import {
  drawnStrokesOf,
  pointsFamily,
  type InkShape,
  type PolyShape,
} from '../../src/shapes/points';
import type { Point } from '../../src/types';

const VERTICES = [
  { x: 100, y: 100 },
  { x: 200, y: 100 },
  { x: 200, y: 140 },
];

const polyline = (rotation: number | null) =>
  ({
    subtype: 'polyline',
    rect: { x: 0, y: 0, width: 1, height: 1 },
    vertices: VERTICES,
    rotation,
    lineEndings: { start: 'none', end: 'open-arrow' },
  }) as unknown as Annotation;

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

describe('the points family reads and writes the engine fields', () => {
  it('a polyline is its upright vertices and turn, written back unchanged', () => {
    const shape = pointsFamily.read(polyline(30));
    expect(shape).toEqual({
      kind: 'poly',
      vertices: VERTICES,
      closed: false,
      lineEndings: { start: 'none', end: 'open-arrow' },
      rotation: 30,
    });
    expect(pointsFamily.write(shape, 'polyline')).toEqual({ vertices: VERTICES, rotation: 30 });
  });

  it('an upright polyline writes its turn as null, so a stored turn is cleared', () => {
    const shape = pointsFamily.read(polyline(null));
    expect(pointsFamily.write(shape, 'polyline')).toEqual({ vertices: VERTICES, rotation: null });
  });

  it('the drawn points are the upright ones turned about the middle of their box', () => {
    const shape = pointsFamily.read(polyline(90)) as PolyShape;
    const middle = { x: 150, y: 120 };
    drawnStrokesOf(shape)[0]!.forEach((point, i) =>
      close(point, rotatePoint(VERTICES[i]!, middle, 90)),
    );
  });
});

describe('a turn changes the turn, not the upright points', () => {
  const upright: PolyShape = { kind: 'poly', vertices: VERTICES, closed: false, rotation: 0 };

  it('about its own middle, only the turn changes', () => {
    const turned = pointsFamily.rotateAbout(upright, { x: 150, y: 120 }, 30) as PolyShape;
    expect(turned.vertices).toBe(VERTICES);
    expect(turned.rotation).toBe(30);
    expect(pointsFamily.upright(turned)).toEqual({ ...upright, rotation: 0 });
  });

  it('about another pivot, the drawing turns as a whole', () => {
    const pivot = { x: 0, y: 0 };
    const turned = pointsFamily.rotateAbout(upright, pivot, 45);
    drawnStrokesOf(turned)[0]!.forEach((point, i) =>
      close(point, rotatePoint(VERTICES[i]!, pivot, 45)),
    );
  });

  it('a vertex dragged on a turned shape lands where it was dropped', () => {
    const turned = pointsFamily.rotateAbout(upright, { x: 150, y: 120 }, 30);
    const to = { x: 260, y: 90 };
    const dragged = pointsFamily.drag(turned, 'v1', to);
    expect(dragged.rotation).toBe(30);
    close(drawnStrokesOf(dragged)[0]![1]!, to);
    close(drawnStrokesOf(dragged)[0]![0]!, drawnStrokesOf(turned)[0]![0]!);
  });
});

describe('ink draws the curves Acrobat draws (ink-curves.ts)', () => {
  const ink = (inkList: Point[][]): InkShape => ({ kind: 'ink', inkList, rotation: 0 });
  const STROKE = [
    { x: 50, y: 50 },
    { x: 80, y: 90 },
    { x: 120, y: 60 },
  ];

  it('its box is what the curves paint, as the runtime measures it for /Rect', () => {
    // The runtime's own test has the same numbers: the curve rises to 90.1728
    // past the middle point, and round caps reach half the width past the ends.
    const wide = pointsFamily.drawnBounds(ink([STROKE]), { strokeWidth: 6 });
    expect(wide.x).toBeCloseTo(47, 4);
    expect(wide.y).toBeCloseTo(47, 4);
    expect(wide.x + wide.width).toBeCloseTo(123, 4);
    expect(wide.y + wide.height).toBeCloseTo(93.172844, 4);
    const thin = pointsFamily.drawnBounds(ink([STROKE]), { strokeWidth: 2 });
    expect(thin.y + thin.height).toBeCloseTo(91.172844, 4);
  });

  it('draws each stroke as a path of cubics, and a click follows the curve', () => {
    const [node] = pointsFamily.scene(ink([STROKE]), { strokeWidth: 2 });
    expect(node).toMatchObject({ kind: 'path' });
    expect(node!.kind === 'path' && node!.d.match(/C /g)).toHaveLength(2);
    const painted = pointsFamily.painted(ink([STROKE]), { strokeWidth: 2 }, false);
    // The curve's top, at (82.4062, 90.1728): past the straight lines, which
    // are 2.6 below there.
    expect(paintedNear(painted, { x: 82.4062, y: 91.1 }, 0)).toBe(true);
    expect(paintedNear(painted, { x: 82.4062, y: 91.3 }, 0)).toBe(false);
  });

  it('a stroke of one point is a dot: a filled circle of radius 0.5', () => {
    const dot = ink([[{ x: 260, y: 550 }]]);
    expect(pointsFamily.scene(dot, { strokeWidth: 2 })).toEqual([
      { kind: 'ellipse', rect: { x: 259.5, y: 549.5, width: 1, height: 1 } },
    ]);
    expect(pointsFamily.drawnBounds(dot, { strokeWidth: 2 })).toEqual({
      x: 258.5,
      y: 548.5,
      width: 3,
      height: 3,
    });
    const painted = pointsFamily.painted(dot, { strokeWidth: 2 }, false);
    expect(paintedNear(painted, { x: 260, y: 550 }, 0)).toBe(true);
    expect(paintedNear(painted, { x: 261.4, y: 550 }, 0)).toBe(true);
    expect(paintedNear(painted, { x: 261.6, y: 550 }, 0)).toBe(false);
  });
});
