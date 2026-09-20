import { describe, expect, it } from 'vitest';
import { measureFromKnownLength } from '@embedpdf/engine-core/runtime';
import { DRAWN_FLAGS } from './flags';
import { DEFAULT_CHROME_GEOM, geomTranslate, pointInPoly, rotatePoint } from './geometry';
import { hitTest } from './hit';
import {
  automaticShapeCaptionCenter,
  shapeCaptionPoint,
  shapeMeasurementLayout,
  shapeMeasurementReadout,
  withShapeCaptionPoint,
  type ShapeMeasurementAppearance,
} from './measurement-shape';
import { annotationSelectionFrame } from './selection';
import { scene } from './scene';
import { initialModel, initialStyle, update } from './update';
import { chrome, creationDraftAnchor, pageItems } from './view';
import type { Annot, Geom, Model, Msg, Vec } from './types';

const crop = { left: -20, bottom: -40, right: 580, top: 760 };
const appearance: ShapeMeasurementAppearance = {
  intent: 'PolygonDimension',
  measure: measureFromKnownLength(100, { value: 2, unit: 'm' }),
  caption: { enabled: true },
  crop,
  text: '',
};
const points = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 200 },
  { x: 100, y: 200 },
];
const geometry: Geom = { t: 'poly', closed: true, points };

function annotation(measure = appearance, geom = geometry): Annot {
  return {
    id: 'shape',
    ref: null,
    pon: 1,
    subtype: geom.t === 'poly' && geom.closed ? 'polygon' : 'polyline',
    geom,
    measure,
    style: initialStyle,
    flags: DRAWN_FLAGS,
    source: 'baked',
  };
}

function selected(a = annotation()): Model {
  return {
    ...initialModel,
    snap: { ...initialModel.snap, rotation: false },
    byId: { shape: a },
    order: ['shape'],
    selected: ['shape'],
  };
}

function pointer(model: Model, phase: 'down' | 'move' | 'up', point: Vec): Model {
  return update(model, { t: 'editPointer', phase, in: { pon: 1, point, shift: false } })[0];
}

function expectPoint(actual: Vec, expected: Vec) {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
}

describe('area and perimeter authoring', () => {
  it.each([true, false])('creates a closed=%s measurement with a frozen scale', (closed) => {
    const measure: ShapeMeasurementAppearance = {
      ...appearance,
      intent: closed ? 'PolygonDimension' : 'PolyLineDimension',
    };
    const create = (point: Vec, nextMeasure = measure): Msg => ({
      t: 'createPointer',
      phase: 'down',
      subtype: closed ? 'polygon' : 'polyline',
      preset: closed ? 'area' : 'perimeter',
      measure: nextMeasure,
      in: { pon: 1, point, shift: false },
    });
    let model = update(initialModel, create(points[0]))[0];
    model = update(model, create(points[1], { ...measure, measure: null }))[0];
    model = update(model, create(points[2], { ...measure, measure: null }))[0];
    const ghost = pageItems(model, 1)[0];
    expect(ghost.measure?.measure).toEqual(measure.measure);
    expect(
      scene(ghost).some((node) => node.kind === 'text' && node.text === (closed ? '4 m²' : '6 m')),
    ).toBe(true);
    expect(creationDraftAnchor(model)?.canFinish).toBe(true);
    const [committed, effects] = update(model, { t: 'finishCreationDraft' });
    expect(effects).toMatchObject([{ fx: 'create' }]);
    const created = committed.byId[committed.order[0]];
    expect(created.geom).toMatchObject({ closed, points: points.slice(0, 3) });
    expect(created.measure).toBe(measure);
    expect(created.source).toBe('vector');
  });

  it('keeps open perimeter lengths and computes area with its closed perimeter', () => {
    expect(shapeMeasurementReadout(geometry, appearance)).toMatchObject({
      label: '8 m²',
      perimeter: '12 m',
    });
    expect(
      shapeMeasurementReadout(
        { ...geometry, closed: false },
        { ...appearance, intent: 'PolyLineDimension' },
      ),
    ).toMatchObject({ label: '10 m' });
  });

  it('places concave area labels inside and perimeter labels at half the path length', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 80, y: 100 },
      { x: 80, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 100 },
      { x: 0, y: 100 },
    ];
    for (const ring of [concave, [...concave].reverse()]) {
      expect(pointInPoly(automaticShapeCaptionCenter(ring, true), ring)).toBe(true);
    }
    expect(automaticShapeCaptionCenter(points.slice(0, 3), false)).toEqual({ x: 250, y: 93.5 });
  });

  it('drags text directly, preserves vertices, and emits only a caption patch', () => {
    let model = selected();
    const center = shapeMeasurementLayout(geometry, appearance, initialStyle)!.caption!.center;
    expect(hitTest(model, 1, center, DEFAULT_CHROME_GEOM, 6)).toMatchObject({ handle: 'caption' });
    expect(chrome(model, 1).filter((node) => node.kind === 'handle')).toHaveLength(4);
    model = pointer(model, 'down', center);
    model = pointer(model, 'move', { x: center.x + 150, y: center.y - 100 });
    const preview = pageItems(model, 1)[0];
    expect(preview.source).toBe('vector');
    expect(preview.measure?.caption).toEqual({ enabled: true, center: { x: 330, y: 710 } });
    expect(update(model, { t: 'cancel' })[0].byId.shape.measure).toBe(appearance);
    const [committed, effects] = update(model, {
      t: 'editPointer',
      phase: 'up',
      in: { pon: 1, point: center, shift: false },
    });
    expect(committed.byId.shape.geom).toBe(geometry);
    expect(committed.byId.shape.measure).toEqual(preview.measure);
    expect(effects).toEqual([{ fx: 'patch', id: 'shape', scope: { kind: 'caption' } }]);
  });

  it.each([false, true])(
    'keeps the complete selection center stable when rotating, manual=%s',
    (manual) => {
      const measure = manual ? withShapeCaptionPoint(appearance, { x: 420, y: 80 }) : appearance;
      const initial = selected(annotation(measure));
      const frame = annotationSelectionFrame(initial.byId.shape);
      const caption = shapeMeasurementLayout(geometry, measure, initialStyle)!.caption!;
      const knob = chrome(initial, 1).find((node) => node.kind === 'rotate-knob');
      if (knob?.kind !== 'rotate-knob') throw new Error('Missing rotation knob');
      const armed = pointer(initial, 'down', knob.at);
      for (const angle of [30, 90, 137, 180, 270]) {
        const at = rotatePoint(knob.at, frame.center, angle);
        const moving = pointer(armed, 'move', at);
        const item = pageItems(moving, 1)[0];
        if (item.measure?.intent === 'LineDimension' || !item.measure)
          throw new Error('Missing shape');
        const layout = shapeMeasurementLayout(item.geom, item.measure, item.style)!;
        expectPoint(layout.caption!.center, rotatePoint(caption.center, frame.center, angle));
        const committed = pointer(moving, 'up', at);
        expectPoint(annotationSelectionFrame(committed.byId.shape).center, frame.center);
        expect(committed.byId.shape.measure).toEqual(item.measure);
        expect(committed.byId.shape.source).toBe('vector');
      }
      const quarter = update(initial, { t: 'rotate90' })[0];
      const reset = update(quarter, { t: 'resetRotation' })[0];
      expectPoint(annotationSelectionFrame(reset.byId.shape).center, frame.center);
    },
  );

  it('keeps a manually placed label fixed during vertex edits and moves it with the whole shape', () => {
    const measure = withShapeCaptionPoint(appearance, { x: 420, y: 80 });
    const original = selected(annotation(measure));
    let model = pointer(original, 'down', points[0]);
    model = pointer(model, 'move', { x: 80, y: 90 });
    model = pointer(model, 'up', { x: 80, y: 90 });
    expect(model.byId.shape.measure).toEqual(measure);
    model = pointer(model, 'down', { x: 200, y: 150 });
    model = pointer(model, 'move', { x: 220, y: 175 });
    model = pointer(model, 'up', { x: 220, y: 175 });
    expect(shapeCaptionPoint(model.byId.shape.measure as ShapeMeasurementAppearance)).toEqual({
      x: 440,
      y: 105,
    });
  });

  it('does not finish a crossing area boundary', () => {
    let model = initialModel;
    for (const point of [points[0], points[2], points[1], points[3]]) {
      model = update(model, {
        t: 'createPointer',
        phase: 'down',
        subtype: 'polygon',
        measure: appearance,
        in: { pon: 1, point, shift: false },
      })[0];
    }
    expect(creationDraftAnchor(model)?.canFinish).toBe(false);
    expect(
      scene(pageItems(model, 1)[0]).some((node) => node.kind === 'text' && node.text === '—'),
    ).toBe(true);
    expect(update(model, { t: 'finishCreationDraft' })[0].order).toEqual([]);
    expect(update(model, { t: 'cancel' })[0].draft).toBeNull();
  });

  it('reverts a vertex edit that would cross the area boundary', () => {
    const original = selected();
    let model = pointer(original, 'down', points[0]);
    model = pointer(model, 'move', { x: 350, y: 150 });
    const preview = pageItems(model, 1)[0];
    expect(shapeMeasurementReadout(preview.geom, appearance)).toMatchObject({
      unavailable: 'invalid-geometry',
    });
    const [committed, effects] = update(model, {
      t: 'editPointer',
      phase: 'up',
      in: { pon: 1, point: { x: 350, y: 150 }, shift: false },
    });
    expect(committed.byId.shape).toBe(original.byId.shape);
    expect(committed.draft).toBeNull();
    expect(effects).toEqual([]);
  });

  it('scales a manual caption with its group and commits the released preview', () => {
    const measure = withShapeCaptionPoint(appearance, { x: 420, y: 80 });
    const first = annotation(measure);
    const second = {
      ...annotation(appearance, geomTranslate(geometry, { x: 400, y: 0 })),
      id: 'second',
    };
    let model: Model = {
      ...selected(first),
      byId: { shape: first, second },
      order: ['shape', 'second'],
      selected: ['shape', 'second'],
    };
    const outline = chrome(model, 1).find((node) => node.kind === 'outline');
    if (outline?.kind !== 'outline') throw new Error('Missing group outline');
    const corner = {
      x: outline.rect.x + outline.rect.width,
      y: outline.rect.y + outline.rect.height,
    };
    const target = { x: corner.x + 100, y: corner.y + 70 };
    model = pointer(model, 'down', corner);
    model = pointer(model, 'move', target);
    if (model.draft?.g !== 'group') throw new Error('Missing group resize');
    const draft = model.draft;
    const center = shapeCaptionPoint(measure)!;
    const expected = {
      x: draft.anchor.x + (center.x - draft.anchor.x) * (draft.cur.width / draft.base.width),
      y: draft.anchor.y + (center.y - draft.anchor.y) * (draft.cur.height / draft.base.height),
    };
    const preview = pageItems(model, 1).find((item) => item.id === 'shape')!;
    expectPoint(shapeCaptionPoint(preview.measure as ShapeMeasurementAppearance)!, expected);
    const committed = pointer(model, 'up', target);
    expect(committed.byId.shape.measure).toEqual(preview.measure);
    expect(committed.byId.shape.geom).toEqual(preview.geom);
    expect(committed.byId.shape.source).toBe('vector');
  });
});
