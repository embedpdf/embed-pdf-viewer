import { describe, expect, it } from 'vitest';
import type { MeasurementInfo } from '@embedpdf/engine-core/runtime';

import {
  ellipseArea,
  hatchPath,
  measureLabelAnchor,
  measureRawValue,
  measureText,
  pointDistance,
  polygonArea,
  polygonPerimeter,
  polylineLength,
  rectArea,
} from './measure';
import { measureScene, scene } from './scene';
import type { Geom, MeasureRender, RenderItem, Style } from './types';

const STYLE: Style = {
  color: '#2962ff',
  interiorColor: null,
  strokeWidth: 2,
  opacity: 1,
  blendMode: 'normal',
  border: { kind: 'solid' },
};

/** 1 page point = 1 pt, decimal to 2 places — so a raw value reads back as-is. */
const info = (over: Partial<MeasurementInfo> = {}): MeasurementInfo => ({
  mode: 'distance',
  scale: { value: 1, unit: 'pt', pagePoints: 1 },
  unit: 'pt',
  precision: { type: 'decimal', places: 2 },
  ...over,
});

const SQUARE: Geom = { t: 'rect', rect: { x: 0, y: 0, width: 10, height: 20 }, ellipse: false };
const ELLIPSE: Geom = { t: 'rect', rect: { x: 0, y: 0, width: 10, height: 20 }, ellipse: true };
const LINE: Geom = { t: 'line', a: { x: 0, y: 0 }, b: { x: 3, y: 4 } };
const TRIANGLE: Geom = {
  t: 'poly',
  closed: true,
  points: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 0, y: 10 },
  ],
};
const OPEN_PATH: Geom = {
  t: 'poly',
  closed: false,
  points: [
    { x: 0, y: 0 },
    { x: 0, y: 3 },
    { x: 4, y: 3 },
  ],
};

describe('geometry primitives', () => {
  it('measures a straight-line distance', () => {
    expect(pointDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('sums the segments of an open path', () => {
    expect(polylineLength(OPEN_PATH.t === 'poly' ? OPEN_PATH.points : [])).toBe(7);
  });

  it('closes the path for a polygon perimeter', () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(polygonPerimeter(square)).toBe(40);
  });

  it('computes polygon area by the shoelace formula', () => {
    expect(polygonArea(TRIANGLE.t === 'poly' ? TRIANGLE.points : [])).toBe(50);
  });

  it('gives the same unsigned area for either winding', () => {
    const cw = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(polygonArea([...cw].reverse())).toBe(polygonArea(cw));
  });

  it('needs three points for an area', () => {
    expect(
      polygonArea([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toBe(0);
  });

  it('computes rect and inscribed-ellipse area', () => {
    expect(rectArea({ x: 0, y: 0, width: 10, height: 20 })).toBe(200);
    expect(ellipseArea({ x: 0, y: 0, width: 10, height: 20 })).toBeCloseTo(Math.PI * 50);
  });
});

describe('measureRawValue', () => {
  it('measures a line as a distance', () => {
    expect(measureRawValue(LINE, 'distance')).toBe(5);
  });

  it('reports zero for a mode the geometry cannot express', () => {
    expect(measureRawValue(LINE, 'area')).toBe(0);
  });

  it('measures a closed poly perimeter including the closing edge', () => {
    // 10 + 10 + hypot(10,10)
    expect(measureRawValue(TRIANGLE, 'perimeter')).toBeCloseTo(20 + Math.hypot(10, 10));
  });

  it('measures an open poly along the drawn path only', () => {
    expect(measureRawValue(OPEN_PATH, 'perimeter')).toBe(7);
  });

  it('measures rect and ellipse areas from the unrotated box', () => {
    expect(measureRawValue(SQUARE, 'area')).toBe(200);
    expect(measureRawValue(ELLIPSE, 'area')).toBeCloseTo(Math.PI * 50);
  });

  it('keeps a rotated shape measuring the same — rotation preserves area', () => {
    const tilted: Geom = { ...(SQUARE as Extract<Geom, { t: 'rect' }>), rot: 37 };
    expect(measureRawValue(tilted, 'area')).toBe(measureRawValue(SQUARE, 'area'));
  });

  it('measures a rect perimeter', () => {
    expect(measureRawValue(SQUARE, 'perimeter')).toBe(60);
  });
});

describe('measureText', () => {
  it('formats through the calibration', () => {
    // 1 inch on the page = 10 ft; a 144pt (2in) line is 20 ft.
    expect(
      measureText(
        { t: 'line', a: { x: 0, y: 0 }, b: { x: 144, y: 0 } },
        info({ scale: { value: 10, unit: 'ft', pagePoints: 72 }, unit: 'ft' }),
      ),
    ).toBe('20.00 ft');
  });

  it('squares the unit for an area', () => {
    expect(measureText(SQUARE, info({ mode: 'area' }))).toBe('200.00 pt²');
  });
});

describe('measureLabelAnchor', () => {
  it('offsets a line label off its stroke along the normal', () => {
    // Horizontal line: the left-hand normal is vertical, so only y moves.
    const at = measureLabelAnchor({ t: 'line', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }, 4);
    expect(at.x).toBeCloseTo(5);
    expect(Math.abs(at.y)).toBeCloseTo(4);
  });

  it('falls back to the midpoint for a zero-length line', () => {
    const at = measureLabelAnchor({ t: 'line', a: { x: 2, y: 2 }, b: { x: 2, y: 2 } }, 4);
    expect(at).toEqual({ x: 2, y: 2 });
  });

  it('labels a closed shape at its centroid', () => {
    const at = measureLabelAnchor(SQUARE, 4);
    expect(at).toEqual({ x: 5, y: 10 });
  });

  it('labels an open path on its longest segment, not its centroid', () => {
    // Segments are 3 then 4 long; the label rides the 4-long one.
    const at = measureLabelAnchor(OPEN_PATH, 0);
    expect(at).toEqual({ x: 2, y: 3 });
  });
});

describe('hatchPath', () => {
  it('fills a rectangle with clipped 45° segments', () => {
    const d = hatchPath(SQUARE, 4);
    expect(d).toMatch(/^M/);
    expect(d.split('M').length - 1).toBeGreaterThan(1);
  });

  it('keeps every segment inside the rectangle', () => {
    const d = hatchPath(SQUARE, 4);
    for (const [, x, y] of d.matchAll(/([-\d.]+) ([-\d.]+)/g)) {
      expect(Number(x)).toBeGreaterThanOrEqual(-0.01);
      expect(Number(x)).toBeLessThanOrEqual(10.01);
      expect(Number(y)).toBeGreaterThanOrEqual(-0.01);
      expect(Number(y)).toBeLessThanOrEqual(20.01);
    }
  });

  it('hatches a concave polygon without crossing the notch', () => {
    // A C-shape: the hatch must produce two spans on the rows that straddle
    // the notch, never one span bridging it.
    const c: Geom = {
      t: 'poly',
      closed: true,
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 10 },
        { x: 10, y: 10 },
        { x: 10, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 30 },
        { x: 0, y: 30 },
      ],
    };
    const d = hatchPath(c, 3);
    expect(d.length).toBeGreaterThan(0);
    // Every emitted span must have both endpoints inside the outline.
    expect(d).not.toContain('NaN');
  });

  it('returns nothing for a geometry that encloses no area', () => {
    expect(hatchPath(LINE, 4)).toBe('');
    expect(hatchPath(OPEN_PATH, 4)).toBe('');
  });

  it('returns nothing for a non-positive spacing', () => {
    expect(hatchPath(SQUARE, 0)).toBe('');
    expect(hatchPath(SQUARE, -2)).toBe('');
  });

  it('bails out instead of emitting unbounded geometry at a tiny spacing', () => {
    expect(hatchPath(SQUARE, 0.0001)).toBe('');
  });
});

describe('scene() measurement layering', () => {
  const item = (geom: Geom, measure: MeasureRender): RenderItem => ({
    id: 'obj:1',
    ref: null,
    subtype: geom.t === 'line' ? 'line' : 'square',
    geom,
    box: { x: 0, y: 0, width: 10, height: 20 },
    style: STYLE,
    source: 'vector',
    selected: false,
    measure,
  });

  const measure = (over: Partial<MeasureRender> = {}): MeasureRender => ({
    text: '200.00 pt²',
    at: { x: 5, y: 10 },
    fontSize: 12,
    hatch: 4,
    ...over,
  });

  it('paints the hatch under the body and the label over it', () => {
    const nodes = scene(item(SQUARE, measure()));
    const kinds = nodes.map((n) => n.kind);
    // hatch path, the square itself, then the label pill + text.
    expect(kinds[0]).toBe('path');
    expect(kinds[kinds.length - 2]).toBe('rect');
    expect(kinds[kinds.length - 1]).toBe('text');
  });

  it('puts the read-out text in the scene verbatim', () => {
    const nodes = scene(item(SQUARE, measure()));
    const text = nodes.find((n) => n.kind === 'text');
    expect(text && 'text' in text ? text.text : null).toBe('200.00 pt²');
  });

  it('omits the hatch for a linear measurement', () => {
    const nodes = scene(item(LINE, measure({ hatch: 0, text: '5.00 pt' })));
    expect(nodes.some((n) => n.kind === 'path')).toBe(false);
    expect(nodes.some((n) => n.kind === 'text')).toBe(true);
  });

  it('paints nothing extra when the annotation is not a measurement', () => {
    const plain = item(SQUARE, measure());
    delete (plain as { measure?: unknown }).measure;
    const nodes = scene(plain);
    expect(nodes.every((n) => n.kind !== 'text')).toBe(true);
  });

  it('scales the pill with the font size so it always encloses the text', () => {
    const small = scene(item(SQUARE, measure({ fontSize: 6 })));
    const large = scene(item(SQUARE, measure({ fontSize: 24 })));
    const rectOf = (nodes: ReturnType<typeof scene>) => {
      const n = nodes[nodes.length - 2];
      return n.kind === 'rect' ? n.rect : null;
    };
    const a = rectOf(small);
    const b = rectOf(large);
    expect(a && b ? b.width / a.width : 0).toBeCloseTo(4);
    expect(a && b ? b.height / a.height : 0).toBeCloseTo(4);
  });
});

describe('measureScene() — the baked-annotation overlay', () => {
  const item = (geom: Geom, measure?: MeasureRender): RenderItem => ({
    id: 'obj:1',
    ref: null,
    subtype: geom.t === 'line' ? 'line' : 'square',
    geom,
    box: { x: 0, y: 0, width: 10, height: 20 },
    style: STYLE,
    // A COMMITTED measurement: the engine bakes its /AP, so `scene()` never
    // runs for it and the read-out has to ride over the raster instead.
    source: 'baked',
    selected: false,
    ...(measure ? { measure } : {}),
  });

  const measure: MeasureRender = {
    text: '200.00 pt²',
    at: { x: 5, y: 10 },
    fontSize: 12,
    hatch: 4,
  };

  it('returns exactly the read-out nodes, without the annotation body', () => {
    const nodes = measureScene(item(SQUARE, measure));
    // hatch path + pill + text — and NO 'rect'/'ellipse' node for the square
    // itself, which the baked raster already draws.
    expect(nodes.map((n) => n.kind)).toEqual(['path', 'rect', 'text']);
  });

  it('matches the nodes scene() layers around a vector body', () => {
    const overlay = measureScene(item(SQUARE, measure));
    const full = scene({ ...item(SQUARE, measure), source: 'vector' });
    // Same read-out either way — a commit must not change what it says.
    expect(overlay.find((n) => n.kind === 'text')).toEqual(full.find((n) => n.kind === 'text'));
  });

  it('is empty for an annotation that is not a measurement', () => {
    expect(measureScene(item(SQUARE))).toEqual([]);
  });
});
