import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { rotatePoint } from '../../src/rect';
import {
  drawnStrokesOf,
  pointsDrag,
  pointsRotateAbout,
  pointsUpright,
  readPoints,
  writePoints,
  type PolyShape,
} from '../../src/shapes/points';

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
  }) as unknown as AnnotationDTO;

const close = (actual: { x: number; y: number }, expected: { x: number; y: number }) => {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
};

describe('the points family reads and writes the engine fields', () => {
  it('a polyline is its upright vertices and turn, written back unchanged', () => {
    const shape = readPoints(polyline(30) as Parameters<typeof readPoints>[0]);
    expect(shape).toEqual({
      kind: 'poly',
      vertices: VERTICES,
      closed: false,
      lineEndings: { start: 'none', end: 'open-arrow' },
      rotation: 30,
    });
    expect(writePoints(shape)).toEqual({ vertices: VERTICES, rotation: 30 });
  });

  it('an upright polyline writes its turn as null, so a stored turn is cleared', () => {
    const shape = readPoints(polyline(null) as Parameters<typeof readPoints>[0]);
    expect(writePoints(shape)).toEqual({ vertices: VERTICES, rotation: null });
  });

  it('the drawn points are the upright ones turned about the middle of their box', () => {
    const shape = readPoints(polyline(90) as Parameters<typeof readPoints>[0]) as PolyShape;
    const middle = { x: 150, y: 120 };
    drawnStrokesOf(shape)[0]!.forEach((point, i) =>
      close(point, rotatePoint(VERTICES[i]!, middle, 90)),
    );
  });
});

describe('a turn changes the turn, not the upright points', () => {
  const upright: PolyShape = { kind: 'poly', vertices: VERTICES, closed: false, rotation: 0 };

  it('about its own middle, only the turn changes', () => {
    const turned = pointsRotateAbout(upright, { x: 150, y: 120 }, 30);
    expect(turned.vertices).toBe(VERTICES);
    expect(turned.rotation).toBe(30);
    expect(pointsUpright(turned)).toEqual({ ...upright, rotation: 0 });
  });

  it('about another pivot, the drawing turns as a whole', () => {
    const pivot = { x: 0, y: 0 };
    const turned = pointsRotateAbout(upright, pivot, 45);
    drawnStrokesOf(turned)[0]!.forEach((point, i) =>
      close(point, rotatePoint(VERTICES[i]!, pivot, 45)),
    );
  });

  it('a vertex dragged on a turned shape lands where it was dropped', () => {
    const turned = pointsRotateAbout(upright, { x: 150, y: 120 }, 30);
    const to = { x: 260, y: 90 };
    const dragged = pointsDrag(turned, 'v1', to);
    expect(dragged.rotation).toBe(30);
    close(drawnStrokesOf(dragged)[0]![1]!, to);
    close(drawnStrokesOf(dragged)[0]![0]!, drawnStrokesOf(turned)[0]![0]!);
  });
});
