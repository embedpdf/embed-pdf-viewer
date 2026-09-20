import { describe, expect, it } from 'vitest';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { DRAWN_FLAGS } from './flags';
import { DEFAULT_CHROME_GEOM, pointInQuad, rotatePoint, unionRect } from './geometry';
import { hitTest, groupUnionBounds } from './hit';
import { distanceLayout, type DistanceAppearance } from './measurement';
import { annotationSelectionFrame } from './selection';
import { initialModel, initialStyle, update, annotsInBox } from './update';
import { chrome, pageItems } from './view';
import type { Annot, Model, Quad, Vec } from './types';

const PAGE = toPageRef(1);
const appearance: DistanceAppearance = {
  intent: 'LineDimension',
  measure: null,
  text: '6.90 m',
  crop: { left: -20, bottom: -40, right: 580, top: 760 },
  leader: { length: -120, extension: 5 },
  caption: { enabled: true, offset: { along: 70, perpendicular: -50 } },
};

function measurement(overrides: Partial<Annot> = {}): Annot {
  return {
    id: 'distance',
    ref: null,
    page: toPageRef(1),
    subtype: 'line',
    geom: {
      t: 'line',
      a: { x: 140, y: 180 },
      b: { x: 340, y: 180 },
      ends: { start: 'closed-arrow', end: 'closed-arrow' },
    },
    style: initialStyle,
    source: 'vector',
    flags: DRAWN_FLAGS,
    measure: appearance,
    ...overrides,
  };
}

function selected(annotation = measurement()): Model {
  return {
    ...initialModel,
    snap: { ...initialModel.snap, rotation: false },
    byId: { [annotation.id]: annotation },
    order: [annotation.id],
    selected: [annotation.id],
  };
}

function expectPoint(actual: Vec, expected: Vec) {
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

function outlineCorners(model: Model): Quad {
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

function pointer(model: Model, phase: 'down' | 'move' | 'up', point: Vec): Model {
  return update(model, {
    t: 'editPointer',
    phase,
    in: { page: toPageRef(1), point, shift: false },
  })[0];
}

describe('measurement selection frame and rotation', () => {
  const cases = [
    { name: 'displaced inline caption', annotation: measurement() },
    {
      name: 'top caption',
      annotation: measurement({
        measure: { ...appearance, caption: { enabled: true, position: 'top' } },
      }),
    },
    {
      name: 'short dimension with outside arrows',
      annotation: measurement({
        geom: { t: 'line', a: { x: 140, y: 180 }, b: { x: 170, y: 180 } },
        measure: { ...appearance, caption: { enabled: true } },
      }),
    },
  ];

  it.each(cases)('rotates the complete $name around the visible frame center', ({ annotation }) => {
    const start = selected(annotation);
    const outline = outlineCorners(start);
    const bounds = unionRect(outline);
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const knob = chrome(start, PAGE).find((node) => node.kind === 'rotate-knob');
    if (knob?.kind !== 'rotate-knob') throw new Error('Missing rotation handle');
    expectPoint(knob.from, {
      x: (outline[0].x + outline[1].x) / 2,
      y: (outline[0].y + outline[1].y) / 2,
    });
    const hit = hitTest(start, PAGE, knob.at, DEFAULT_CHROME_GEOM, 6);
    expect(hit).toMatchObject({ t: 'rotate', pivot: center });

    const armed = pointer(start, 'down', knob.at);
    const initialCaption = distanceLayout(
      annotation.geom,
      annotation.measure as DistanceAppearance,
      2,
    )!.caption!;
    for (const angle of [30, 89, 91, 137, 180, 269, 271, 359]) {
      const at = rotatePoint(knob.at, center, angle);
      const moving = pointer(armed, 'move', at);
      const item = pageItems(moving, PAGE)[0];
      const layout = distanceLayout(item.geom, item.measure as DistanceAppearance, 2)!;
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
      expectPoint(annotationSelectionFrame(committed.byId.distance).center, center);
      expect(committed.byId.distance.measure).toEqual(annotation.measure);
      expect(committed.byId.distance.geom).toEqual(item.geom);
    }
    expect(pointer(armed, 'move', knob.at).draft).toMatchObject({ pivot: center });
    expect(update(armed, { t: 'cancel' })[0].byId.distance).toBe(annotation);
  });

  it('uses the same center for quarter turns and reset, without moving the annotation', () => {
    const initial = selected();
    const center = annotationSelectionFrame(initial.byId.distance).center;
    const once = update(initial, { t: 'rotate90' })[0];
    expectPoint(annotationSelectionFrame(once.byId.distance).center, center);
    const reset = update(once, { t: 'resetRotation' })[0];
    expect(reset.byId.distance.geom).toMatchObject(initial.byId.distance.geom);

    let state = initial;
    for (let turn = 0; turn < 4; turn++) {
      state = update(state, { t: 'rotate90' })[0];
      expectPoint(annotationSelectionFrame(state.byId.distance).center, center);
    }
    const geometry = state.byId.distance.geom;
    if (geometry.t !== 'line') throw new Error('Expected line geometry');
    expectPoint(geometry.a, { x: 140, y: 180 });
    expectPoint(geometry.b, { x: 340, y: 180 });
  });

  it('keeps its frame after a native appearance with conservative bounds arrives', () => {
    const state = update(selected(), { t: 'rotate90' })[0];
    const annotation = state.byId.distance;
    const baked: Annot = {
      ...annotation,
      source: 'baked',
      apBox: { x: 40, y: 60, width: 450, height: 400 },
    };
    expect(annotationSelectionFrame(baked)).toEqual(annotationSelectionFrame(annotation));
  });

  it('uses the full measurement frame for marquee and group rotation', () => {
    const state = selected();
    expect(annotsInBox(state, toPageRef(1), { x: 290, y: 340 }, { x: 325, y: 355 })).toEqual([
      'distance',
    ]);
    const square: Annot = {
      ...measurement(),
      id: 'square',
      subtype: 'square',
      geom: { t: 'rect', rect: { x: 400, y: 180, width: 80, height: 80 }, ellipse: false },
      measure: undefined,
    };
    state.byId.square = square;
    state.order.push(square.id);
    state.selected.push(square.id);
    const bounds = groupUnionBounds(state, toPageRef(1))!;
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const before = annotationSelectionFrame(state.byId.distance).center;
    const rotated = update(state, { t: 'rotate90' })[0];
    expectPoint(
      annotationSelectionFrame(rotated.byId.distance).center,
      rotatePoint(before, center, 90),
    );
  });
});
