import { describe, expect, test } from 'vitest';

import { KIND_BY_SUBTYPE, type Annotation } from '../../src/annotation/kinds';
import { DRAWN_RECT_KINDS, pdfShapeForRect } from '../../src/annotation/shapeForRect';
import type { AnnotationSubtype } from '../../src/annotation/subtype';
import { EngineErrorCode } from '../../src/errors/EngineErrorCode';
import type { PdfPoint, PdfRect } from '../../src/geometry/primitives';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';
import { resolveRectCommand, shapeForRect } from '../../src/pageSpace/helpers';

/** An annotation as a read returns it, with the fields the mapping looks at. */
const read = (fields: Record<string, unknown>) => fields as unknown as Annotation<PdfCoordinates>;

/** Acrobat's `[x1, y1, x2, y2]`. */
const rect = ([left, bottom, right, top]: number[]): PdfRect => ({ left, bottom, right, top });

/** Acrobat printed two decimals. */
const expectPoints = (actual: unknown, expected: number[][]) => {
  const points = actual as PdfPoint[];
  expect(points).toHaveLength(expected.length);
  points.forEach((point, i) => {
    expect(point.x).toBeCloseTo(expected[i]![0]!, 2);
    expect(point.y).toBeCloseTo(expected[i]![1]!, 2);
  });
};

describe('pdfShapeForRect', () => {
  test('lists exactly the kinds whose rect the engine works out', () => {
    const drawn = Object.entries(KIND_BY_SUBTYPE)
      .filter(([, kind]) => kind.readBackWrites.rect === null)
      .map(([subtype]) => subtype as AnnotationSubtype);
    expect([...DRAWN_RECT_KINDS].sort()).toEqual(drawn.sort());
  });

  // What Acrobat did when a script set `annot.rect` (checked Sep 29 2026).
  test("a same-size rect moves the points by the offset, as in Acrobat's Ink move", () => {
    const ink = read({
      subtype: 'ink',
      rect: rect([68.5, 338.5, 221.5, 401.5]),
      inkList: [
        [
          { x: 70, y: 370 },
          { x: 110, y: 400 },
          { x: 150, y: 340 },
        ],
        [
          { x: 160, y: 340 },
          { x: 220, y: 395 },
        ],
      ],
      rotation: null,
    });
    const { inkList } = pdfShapeForRect(ink, rect([108.5, 318.5, 261.5, 381.5])) as {
      inkList: PdfPoint[][];
    };
    expect(inkList).toEqual([
      [
        { x: 110, y: 350 },
        { x: 150, y: 380 },
        { x: 190, y: 320 },
      ],
      [
        { x: 200, y: 320 },
        { x: 260, y: 375 },
      ],
    ]);
  });

  test("a bigger rect stretches the points into it, each axis on its own, as in Acrobat's resizes", () => {
    const line = read({
      subtype: 'line',
      rect: rect([338.5, 668.5, 481.5, 731.5]),
      linePoints: { start: { x: 340, y: 670 }, end: { x: 480, y: 730 } },
      measure: null,
      rotation: null,
    });
    const { linePoints } = pdfShapeForRect(line, rect([338.5, 638.5, 541.5, 731.5])) as {
      linePoints: { start: PdfPoint; end: PdfPoint };
    };
    expectPoints(
      [linePoints.start, linePoints.end],
      [
        [340.63, 640.71],
        [539.37, 729.29],
      ],
    );

    const polygon = read({
      subtype: 'polygon',
      rect: rect([345.75, 448.34, 483.7, 512]),
      vertices: [
        { x: 350, y: 450 },
        { x: 480, y: 455 },
        { x: 420, y: 510 },
      ],
      captionCenter: null,
      measure: null,
      rotation: null,
    });
    const shape = pdfShapeForRect(polygon, rect([345.75, 418.34, 543.7, 512]));
    expectPoints((shape as { vertices: unknown }).vertices, [
      [351.85, 420.78],
      [538.39, 428.14],
      [452.29, 509.06],
    ]);
    // A caption left to follow the vertices stays that way.
    expect(shape).not.toHaveProperty('captionCenter');
  });

  test("a box, a callout's line and a caption's centre move with the drawing; a scale's origin stays", () => {
    const callout = read({
      subtype: 'free-text',
      rect: rect([60, 60, 160, 140]),
      box: rect([100, 100, 160, 140]),
      calloutLine: [
        { x: 60, y: 60 },
        { x: 100, y: 120 },
      ],
      richText: null,
      rotation: null,
    });
    expect(pdfShapeForRect(callout, rect([70, 50, 170, 130]))).toEqual({
      box: rect([110, 90, 170, 130]),
      calloutLine: [
        { x: 70, y: 50 },
        { x: 110, y: 110 },
      ],
    });

    const polyline = read({
      subtype: 'polyline',
      rect: rect([0, 0, 100, 100]),
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      captionCenter: { x: 50, y: 50 },
      measure: { subtype: 'rectilinear', origin: { x: 0, y: 0 } },
      rotation: null,
    });
    const shape = pdfShapeForRect(polyline, rect([0, 0, 200, 100]));
    expect(shape).toEqual({
      vertices: [
        { x: 0, y: 0 },
        { x: 200, y: 100 },
      ],
      captionCenter: { x: 100, y: 50 },
    });
  });

  test('a kind whose shape is its rect takes the rect as it is', () => {
    const note = read({ subtype: 'text', rect: rect([80, 260, 100, 280]) });
    // Acrobat's Text resize: the icon fills the new rect.
    expect(pdfShapeForRect(note, rect([350, 230, 430, 280]))).toEqual({
      rect: rect([350, 230, 430, 280]),
    });
  });

  test('a turned drawing only moves', () => {
    const square = read({
      subtype: 'square',
      rect: rect([50, 50, 170, 150]),
      box: rect([60, 60, 160, 140]),
      rotation: 30,
    });
    expect(pdfShapeForRect(square, rect([60, 40, 180, 140]))).toEqual({
      box: rect([70, 50, 170, 130]),
    });
    expect(() => pdfShapeForRect(square, rect([50, 50, 200, 150]))).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg, details: { field: 'rect' } }),
    );
  });

  test('a box at a quarter turn also resizes, along its own sides; a widget is one', () => {
    // 160 × 40, turned 90: it stands 40 × 160 on the page.
    const square = read({
      subtype: 'square',
      rect: rect([160, 40, 200, 200]),
      box: rect([100, 100, 260, 140]),
      rotation: 90,
    });
    expect(pdfShapeForRect(square, rect([120, 40, 180, 240]))).toEqual({
      box: rect([50, 110, 250, 170]),
    });
    const widget = read({
      subtype: 'widget',
      rect: rect([20, 20, 44, 180]),
      box: rect([-48, 88, 112, 112]),
      rotation: 270,
    });
    expect(pdfShapeForRect(widget, rect([20, 20, 60, 220]))).toEqual({
      box: rect([-60, 100, 140, 140]),
    });
  });

  test("a rect can't squash a drawing flat, or stretch one that is", () => {
    const square = read({
      subtype: 'square',
      rect: rect([60, 60, 160, 140]),
      box: rect([60, 60, 160, 140]),
      rotation: null,
    });
    expect(() => pdfShapeForRect(square, rect([60, 60, 60, 140]))).toThrow(
      expect.objectContaining({ details: { field: 'rect' } }),
    );

    // A line another app gave a rect without height can move, but not grow taller.
    const flat = read({
      subtype: 'line',
      rect: rect([0, 100, 100, 100]),
      linePoints: { start: { x: 0, y: 100 }, end: { x: 100, y: 100 } },
      rotation: null,
    });
    expect(pdfShapeForRect(flat, rect([10, 120, 110, 120]))).toEqual({
      linePoints: { start: { x: 10, y: 120 }, end: { x: 110, y: 120 } },
    });
    expect(() => pdfShapeForRect(flat, rect([0, 100, 100, 110]))).toThrow(
      expect.objectContaining({ details: { field: 'rect' } }),
    );
  });
});

describe('shapeForRect', () => {
  test("in page space, Acrobat's Line resize on a US Letter page", () => {
    // The same line and rects as above, from the page's top-left (792 high).
    const line = {
      subtype: 'line',
      rect: { x: 338.5, y: 60.5, width: 143, height: 63 },
      linePoints: { start: { x: 340, y: 122 }, end: { x: 480, y: 62 } },
      measure: null,
      rotation: null,
    } as unknown as Annotation;
    const { linePoints } = shapeForRect(line, { x: 338.5, y: 60.5, width: 203, height: 93 }) as {
      linePoints: { start: PdfPoint; end: PdfPoint };
    };
    expectPoints(
      [linePoints.start, linePoints.end],
      [
        [340.63, 792 - 640.71],
        [539.37, 792 - 729.29],
      ],
    );
  });

  test('a kind whose shape is its rect takes the rect as it is', () => {
    const link = { subtype: 'link', rect: { x: 1, y: 2, width: 3, height: 4 } } as Annotation;
    expect(shapeForRect(link, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 })).toEqual({
      rect: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    });
  });
});

describe('resolveRectCommand', () => {
  /** A square in page space, as a viewer reads it. */
  const square = {
    subtype: 'square',
    rect: { x: 100, y: 100, width: 100, height: 60 },
    box: { x: 100, y: 100, width: 100, height: 60 },
    rotation: null,
    color: '#ff0000',
  } as unknown as Parameters<typeof resolveRectCommand>[0];

  test('a new rect on a drawn kind becomes the shape that puts it there', () => {
    expect(
      resolveRectCommand(square, {
        subtype: 'square',
        rect: { x: 300, y: 100, width: 100, height: 60 },
        color: '#00ff00',
      }),
    ).toEqual({
      subtype: 'square',
      box: { x: 300, y: 100, width: 100, height: 60 },
      color: '#00ff00',
    });
  });

  test('the rect it reads, sent back, moves nothing', () => {
    expect(
      resolveRectCommand(square, { subtype: 'square', rect: { ...square.rect }, color: '#00ff00' }),
    ).toEqual({ subtype: 'square', color: '#00ff00' });
  });

  test('a new rect with a new shape is refused: which to follow would be a guess', () => {
    expect(() =>
      resolveRectCommand(square, {
        subtype: 'square',
        rect: { x: 300, y: 100, width: 100, height: 60 },
        box: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).toThrow(
      expect.objectContaining({ code: EngineErrorCode.InvalidArg, details: { field: 'rect' } }),
    );
  });

  test('a kind whose shape is its rect keeps the rect as it is', () => {
    const link = {
      subtype: 'link',
      rect: { x: 0, y: 0, width: 10, height: 10 },
    } as unknown as Parameters<typeof resolveRectCommand>[0];
    const patch = { subtype: 'link', rect: { x: 5, y: 5, width: 10, height: 10 } } as const;
    expect(resolveRectCommand(link, patch)).toBe(patch);
  });
});
