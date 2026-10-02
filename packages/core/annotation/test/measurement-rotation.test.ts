import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { recordOf, step, type RecordInput, STYLE } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import { DEFAULT_CHROME_GEOMETRY, pointInQuad, turnPivotOf } from '../src/geometry';
import { rectFromPoints, rotatePoint, unionRect } from '../src/rect';
import { drawnLineOf } from '../src/shapes/points';
import { hitTest, groupUnionBounds } from '../src/hit';
import { type DistanceAppearance, distanceLayout, measurementOf } from '../src/measurement';
import { annotationSelectionFrame } from '../src/selection';
import type { ModelAnnotation, Model, QuadRing, Point } from '../src/types';
import { initialModel, annotsInBox } from '../src/update';
import { chrome, pageItems } from '../src/view';
import { shapeOf } from '../src/record';

const PAGE = toPageRef(1);
const appearance: DistanceAppearance = {
  intent: 'line-dimension',
  measure: null,
  contents: '6.90 m',
  leader: { length: -120, extension: 5 },
  captionEnabled: true,
  captionPosition: 'inline',
  captionOffset: { along: 70, perpendicular: -50 },
};

function measurement(overrides: Partial<RecordInput> = {}): ModelAnnotation {
  return recordOf({
    id: 'distance',
    ref: null,
    page: toPageRef(1),
    subtype: 'line',
    geometry: {
      kind: 'line',
      linePoints: { start: { x: 140, y: 180 }, end: { x: 340, y: 180 } },
      lineEndings: { start: 'closed-arrow', end: 'closed-arrow' },
      rotation: 0,
    },
    style: STYLE,
    source: 'vector',
    flags: DRAWN_FLAGS,
    measure: appearance,
    ...overrides,
  });
}

function selected(record = measurement()): Model {
  return {
    ...initialModel,
    snap: { ...initialModel.snap, rotation: false },
    byId: { [record.id]: record },
    order: [record.id],
    selected: [record.id],
  };
}

function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

function outlineCorners(model: Model): QuadRing {
  const node = chrome(model, PAGE).find((item) => item.kind === 'outline' || item.kind === 'obb');
  if (node?.kind === 'obb') return node.corners;
  if (node?.kind !== 'outline') throw new Error('Missing selection outline');
  const { x, y, width, height } = node.rect;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

function pointer(model: Model, phase: 'down' | 'move' | 'up', point: Point): Model {
  return step(model, {
    type: 'editPointer',
    phase,
    in: { page: toPageRef(1), point, shift: false },
  })[0];
}

describe('measurement selection frame and rotation', () => {
  const cases = [
    { name: 'displaced inline caption', record: measurement() },
    {
      name: 'top caption',
      record: measurement({
        measure: { ...appearance, captionPosition: 'top', captionOffset: null },
      }),
    },
    {
      name: 'short dimension with outside arrows',
      record: measurement({
        geometry: {
          kind: 'line',
          linePoints: { start: { x: 140, y: 180 }, end: { x: 170, y: 180 } },
          rotation: 0,
        },
        measure: { ...appearance, captionOffset: null },
      }),
    },
  ];

  it.each(cases)('rotates the complete $name about the middle of its line', ({ record }) => {
    const start = selected(record);
    const outline = outlineCorners(start);
    // The pivot is where the engine turns the line: its own middle, not the
    // middle of the frame the caption and leaders widen.
    const center = turnPivotOf(shapeOf(record.annotation));
    const frameCenter = annotationSelectionFrame(record).center;
    const knob = chrome(start, PAGE).find((node) => node.kind === 'rotate-knob');
    if (knob?.kind !== 'rotate-knob') throw new Error('Missing rotation handle');
    expectPoint(knob.from, {
      x: (outline[0].x + outline[1].x) / 2,
      y: (outline[0].y + outline[1].y) / 2,
    });
    const hit = hitTest(start, PAGE, knob.at, DEFAULT_CHROME_GEOMETRY, 6);
    expect(hit).toMatchObject({ kind: 'rotate', pivot: center });

    const armed = pointer(start, 'down', knob.at);
    const initialCaption = distanceLayout(
      shapeOf(record.annotation),
      measurementOf(record.annotation) as DistanceAppearance,
      2,
    )!.caption!;
    for (const angle of [30, 89, 91, 137, 180, 269, 271, 359]) {
      const at = rotatePoint(knob.at, center, angle);
      const moving = pointer(armed, 'move', at);
      const item = pageItems(moving, PAGE)[0];
      const layout = distanceLayout(item.geometry, item.measure as DistanceAppearance, 2)!;
      const rotatedOutline = outlineCorners(moving);
      rotatedOutline.forEach((point, index) => {
        expectPoint(point, rotatePoint(outline[index], center, angle));
      });
      expectPoint(layout.caption!.center, rotatePoint(initialCaption.center, center, angle));
      for (const point of layout.selectionPoints) {
        expect(pointInQuad(point, rotatedOutline)).toBe(true);
      }
      const guides = chrome(moving, PAGE).find((node) => node.kind === 'rotate-guides');
      expect(guides).toMatchObject({ center });

      const committed = pointer(moving, 'up', at);
      expectPoint(turnPivotOf(shapeOf(committed.byId.distance.annotation)), center);
      expectPoint(
        annotationSelectionFrame(committed.byId.distance).center,
        rotatePoint(frameCenter, center, angle),
      );
      expect(measurementOf(committed.byId.distance.annotation)).toEqual(
        measurementOf(record.annotation),
      );
      expect(shapeOf(committed.byId.distance.annotation)).toEqual(item.geometry);
    }
    expect(pointer(armed, 'move', knob.at).draft).toMatchObject({ pivot: center });
    expect(step(armed, { type: 'cancel' })[0].byId.distance).toBe(record);
  });

  it('uses the same center for quarter turns and reset, without moving the annotation', () => {
    const initial = selected();
    const center = turnPivotOf(shapeOf(initial.byId.distance.annotation));
    const once = step(initial, { type: 'rotateSelection', degrees: 90 })[0];
    expectPoint(turnPivotOf(shapeOf(once.byId.distance.annotation)), center);
    const reset = step(once, { type: 'resetRotation' })[0];
    expect(shapeOf(reset.byId.distance.annotation)).toEqual(
      shapeOf(initial.byId.distance.annotation),
    );

    let state = initial;
    for (let turn = 0; turn < 4; turn++) {
      state = step(state, { type: 'rotateSelection', degrees: 90 })[0];
      expectPoint(turnPivotOf(shapeOf(state.byId.distance.annotation)), center);
    }
    const geometry = shapeOf(state.byId.distance.annotation);
    if (geometry.kind !== 'line') throw new Error('Expected line geometry');
    const drawn = drawnLineOf(geometry);
    expectPoint(drawn.start, { x: 140, y: 180 });
    expectPoint(drawn.end, { x: 340, y: 180 });
  });

  it('keeps its frame after a native appearance with conservative bounds arrives', () => {
    const state = step(selected(), { type: 'rotateSelection', degrees: 90 })[0];
    const record = state.byId.distance;
    const baked: ModelAnnotation = {
      ...record,
      source: 'baked',
      apBox: { x: 40, y: 60, width: 450, height: 400 },
    };
    expect(annotationSelectionFrame(baked)).toEqual(annotationSelectionFrame(record));
  });

  it('uses the full measurement frame for marquee and group rotation', () => {
    const state = selected();
    expect(
      annotsInBox(state, toPageRef(1), rectFromPoints({ x: 290, y: 340 }, { x: 325, y: 355 })),
    ).toEqual(['distance']);
    const square = recordOf({
      id: 'square',
      ref: null,
      page: toPageRef(1),
      subtype: 'square',
      geometry: {
        kind: 'box',
        box: { x: 400, y: 180, width: 80, height: 80 },
        rotation: 0,
        ellipse: false,
      },
      style: STYLE,
      source: 'vector',
      flags: DRAWN_FLAGS,
    });
    state.byId.square = square;
    state.order.push(square.id);
    state.selected.push(square.id);
    const bounds = groupUnionBounds(state, toPageRef(1))!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const before = annotationSelectionFrame(state.byId.distance).center;
    const rotated = step(state, { type: 'rotateSelection', degrees: 90 })[0];
    expectPoint(
      annotationSelectionFrame(rotated.byId.distance).center,
      rotatePoint(before, center, 90),
    );
  });
});
