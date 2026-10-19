import { measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { DRAWN_FLAGS } from '../../src/flags';
import { distanceLayout, measurementOf, type DistanceAppearance } from '../../src/measurement';
import {
  shapeMeasurementLayout,
  type ShapeMeasurementAppearance,
} from '../../src/measurement-shape';
import { shapeOf } from '../../src/record';
import { annotationSelectionFrame } from '../../src/selection';
import type { Message, Model, ModelAnnotation, Point, Rect } from '../../src/types';
import { initialModel } from '../../src/update';
import { fractionOnPage } from '../../src/update/page-bound';
import { modelWith, named, recordOf, run, STYLE } from '../support';

const PAGE = toPageRef(1);
const PAGE_BOX: Rect = { x: 0, y: 0, width: 600, height: 800 };

const MEASURE: DistanceAppearance = {
  intent: 'line-dimension',
  measure: measureFromKnownLength(100, { value: 2, unit: 'm' }),
  captionEnabled: true,
  captionPosition: 'inline',
  captionOffset: null,
  leader: { length: -20, extension: 5 },
  contents: 'stored',
};

/** A distance measuring from `start` to `end`, its dimension line `leader` off the measured line. */
const distance = (start: Point, end: Point, leader = -20) =>
  recordOf({
    ...named('distance', PAGE),
    page: PAGE,
    subtype: 'line',
    geometry: {
      kind: 'line',
      linePoints: { start, end },
      lineEndings: { start: 'closed-arrow', end: 'closed-arrow' },
      rotation: 0,
    },
    measure: { ...MEASURE, leader: { length: leader, extension: 5 } },
    style: STYLE,
    flags: DRAWN_FLAGS,
    source: 'vector',
  });

const edit = (phase: 'down' | 'move' | 'up', point: Point): Message => ({
  type: 'editPointer',
  phase,
  in: { page: PAGE, point, shift: false, pageBox: PAGE_BOX },
});

/** Is every corner of the record's frame on the page? */
const onPage = (record: ModelAnnotation): boolean =>
  annotationSelectionFrame(record).corners.every(
    (corner) =>
      corner.x >= -1e-6 && corner.y >= -1e-6 && corner.x <= 600 + 1e-6 && corner.y <= 800 + 1e-6,
  );

const only = (model: Model): ModelAnnotation => model.byId[model.order[0]!]!;

describe('fractionOnPage', () => {
  const box = (x: number): Point[] => [
    { x, y: 10 },
    { x: x + 20, y: 30 },
  ];

  it('allows all of a gesture that stays on the page, and stops one at the edge', () => {
    expect(fractionOnPage(PAGE_BOX, (part) => box(100 + 100 * part))).toBe(1);
    // From x 100 toward 700: the box's right side (x + 20) meets 600 at x 580.
    expect(fractionOnPage(PAGE_BOX, (part) => box(100 + 600 * part))).toBeCloseTo(480 / 600, 6);
  });

  it('never pushes a frame further past the edge than it started, but lets it come back', () => {
    // Starts 10 past the left edge.
    expect(fractionOnPage(PAGE_BOX, (part) => box(-10 - 50 * part))).toBeCloseTo(0, 6);
    expect(fractionOnPage(PAGE_BOX, (part) => box(-10 + 50 * part))).toBe(1);
  });

  it('allows anything without a page', () => {
    expect(fractionOnPage(undefined, (part) => box(100 + 10000 * part))).toBe(1);
  });
});

describe('a measurement stays on its page', () => {
  it('drawing a distance: the offset stops where the dimension line reaches the edge', () => {
    const draw = (phase: 'down' | 'move' | 'up', point: Point): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'line',
      measure: MEASURE,
      in: { page: PAGE, point, shift: false, pageBox: PAGE_BOX },
    });
    // A diagonal line near the top, then the pointer far above the page.
    const model = run(initialModel, [
      draw('down', { x: 200, y: 120 }),
      draw('move', { x: 300, y: 40 }),
      draw('up', { x: 300, y: 40 }),
      draw('move', { x: 50, y: -400 }),
      draw('down', { x: 50, y: -400 }),
    ]);
    const created = only(model);
    expect(measurementOf(created.annotation)?.intent).toBe('line-dimension');
    expect(onPage(created)).toBe(true);
    // It went as far as the page lets it: a frame corner lies on the top edge.
    const top = Math.min(...annotationSelectionFrame(created).corners.map((corner) => corner.y));
    expect(top).toBeCloseTo(0, 3);
  });

  it("dragging a leader far off the page stops it at the page's edge", () => {
    const record = distance({ x: 250, y: 150 }, { x: 400, y: 60 });
    const layout = distanceLayout(shapeOf(record.annotation), MEASURE, STYLE.strokeWidth)!;
    const grab = layout.dimensionStart;
    let model: Model = { ...modelWith([record]), selected: [record.id] };
    model = run(model, [edit('down', grab), edit('move', { x: grab.x - 300, y: grab.y - 500 })]);
    expect(model.draft?.kind).toBe('leader');
    model = run(model, [edit('up', { x: grab.x - 300, y: grab.y - 500 })]);
    expect(onPage(only(model))).toBe(true);
    expect(measurementOf(only(model).annotation)).not.toEqual(measurementOf(record.annotation));
  });

  it('dragging the caption far up stops it at the edge, and it still slides across', () => {
    const record = distance({ x: 250, y: 150 }, { x: 400, y: 150 });
    const layout = distanceLayout(shapeOf(record.annotation), MEASURE, STYLE.strokeWidth)!;
    const grab = layout.caption!.center;
    let model: Model = { ...modelWith([record]), selected: [record.id] };
    const far = { x: grab.x + 40, y: grab.y - 900 };
    model = run(model, [edit('down', grab), edit('move', far)]);
    expect(model.draft?.kind).toBe('caption');
    const draft = model.draft!.kind === 'caption' ? model.draft : null;
    expect(draft!.delta.x).toBeCloseTo(40, 6);
    model = run(model, [edit('up', far)]);
    expect(onPage(only(model))).toBe(true);
  });

  it('dragging an end of a distance to the edge keeps its dimension line on the page', () => {
    // The dimension line runs 20 above the measured line; the end is dragged to the top edge.
    const record = distance({ x: 250, y: 150 }, { x: 400, y: 150 }, 20);
    const dimension = distanceLayout(
      shapeOf(record.annotation),
      measurementOf(record.annotation) as DistanceAppearance,
      STYLE.strokeWidth,
    )!;
    expect(dimension.dimensionStart.y).toBeLessThan(150);
    let model: Model = { ...modelWith([record]), selected: [record.id] };
    model = run(model, [
      edit('down', { x: 400, y: 150 }),
      edit('move', { x: 420, y: -50 }),
      edit('up', { x: 420, y: -50 }),
    ]);
    expect(onPage(only(model))).toBe(true);
    const line = shapeOf(only(model).annotation);
    expect(line.kind === 'line' && line.linePoints.end.y).toBeGreaterThan(10);
  });

  it("dragging an area's caption far off the page stops it at the edge", () => {
    const area = recordOf({
      ...named('area', PAGE),
      page: PAGE,
      subtype: 'polygon',
      geometry: {
        kind: 'poly',
        closed: true,
        vertices: [
          { x: 100, y: 100 },
          { x: 300, y: 100 },
          { x: 300, y: 200 },
          { x: 100, y: 200 },
        ],
        rotation: 0,
      },
      measure: {
        intent: 'polygon-dimension',
        measure: measureFromKnownLength(100, { value: 2, unit: 'm' }),
        captionEnabled: true,
        contents: '',
      },
      style: STYLE,
      flags: DRAWN_FLAGS,
      source: 'vector',
    });
    const grab = shapeMeasurementLayout(
      shapeOf(area.annotation),
      measurementOf(area.annotation) as ShapeMeasurementAppearance,
      STYLE,
    )!.caption!.center;
    let model: Model = { ...modelWith([area]), selected: [area.id] };
    const far = { x: grab.x - 900, y: grab.y - 900 };
    model = run(model, [edit('down', grab), edit('move', far)]);
    expect(model.draft?.kind).toBe('caption');
    model = run(model, [edit('up', far)]);
    expect(onPage(only(model))).toBe(true);
    expect(shapeOf(only(model).annotation)).not.toEqual(shapeOf(area.annotation));
  });

  it('a line dragged to the edge stops before its arrowhead leaves the page', () => {
    const arrow = recordOf({
      ...named('arrow', PAGE),
      page: PAGE,
      subtype: 'line',
      geometry: {
        kind: 'line',
        linePoints: { start: { x: 300, y: 300 }, end: { x: 400, y: 300 } },
        lineEndings: { start: 'none', end: 'closed-arrow' },
        rotation: 0,
      },
      style: { ...STYLE, strokeWidth: 4 },
      flags: DRAWN_FLAGS,
      source: 'vector',
    });
    let model: Model = { ...modelWith([arrow]), selected: [arrow.id] };
    model = run(model, [
      edit('down', { x: 400, y: 300 }),
      edit('move', { x: 900, y: 300 }),
      edit('up', { x: 900, y: 300 }),
    ]);
    expect(onPage(only(model))).toBe(true);
    const line = shapeOf(only(model).annotation);
    expect(line.kind === 'line' && line.linePoints.end.x).toBeLessThan(600);
    expect(line.kind === 'line' && line.linePoints.end.x).toBeGreaterThan(560);
  });
});
