import { measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { record, rounded, step, withoutLabel, STYLE } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import { DEFAULT_CHROME_GEOMETRY, geomTranslate, turnPivotOf } from '../src/geometry';
import { pointInPoly, rotatePoint } from '../src/rect';
import { hitTest } from '../src/hit';
import {
  automaticShapeCaptionCenter,
  shapeCaptionPoint,
  shapeMeasurementLayout,
  shapeMeasurementReadout,
  withShapeCaptionPoint,
  type ShapeMeasurementAppearance,
} from '../src/measurement-shape';
import { scene } from '../src/scene';
import { annotationSelectionFrame } from '../src/selection';
import type { ModelAnnotation, ModelGeometry, Model, Message, Point } from '../src/types';
import { initialModel } from '../src/update';
import { chrome, creationDraftAnchor, pageItems } from '../src/view';
import { fieldsOf } from '../src/record';

const PAGE = toPageRef(1);
const appearance: ShapeMeasurementAppearance = {
  intent: 'polygon-dimension',
  measure: measureFromKnownLength(100, { value: 2, unit: 'm' }),
  caption: { enabled: true },
  text: '',
};
const points = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 200 },
  { x: 100, y: 200 },
];
const geometry: ModelGeometry = { kind: 'poly', closed: true, vertices: points, rotation: 0 };

function annotation(measure = appearance, geom = geometry): ModelAnnotation {
  return record({
    id: 'shape',
    ref: null,
    page: toPageRef(1),
    subtype: geom.kind === 'poly' && geom.closed ? 'polygon' : 'polyline',
    geometry: geom,
    measure,
    style: STYLE,
    flags: DRAWN_FLAGS,
    source: 'baked',
  });
}

function selected(shape = annotation()): Model {
  return {
    ...initialModel,
    snap: { ...initialModel.snap, rotation: false },
    byId: { shape },
    order: ['shape'],
    selected: ['shape'],
  };
}

function pointer(model: Model, phase: 'down' | 'move' | 'up', point: Point): Model {
  return step(model, {
    type: 'editPointer',
    phase,
    in: { page: toPageRef(1), point, shift: false },
  })[0];
}

function expectPoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x, 5);
  expect(actual.y).toBeCloseTo(expected.y, 5);
}

describe('area and perimeter authoring', () => {
  it.each([true, false])('creates a closed=%s measurement with a frozen scale', (closed) => {
    const measure: ShapeMeasurementAppearance = {
      ...appearance,
      intent: closed ? 'polygon-dimension' : 'polyline-dimension',
    };
    const create = (point: Point, nextMeasure = measure): Message => ({
      type: 'createPointer',
      phase: 'down',
      subtype: closed ? 'polygon' : 'polyline',
      preset: closed ? 'area' : 'perimeter',
      measure: nextMeasure,
      in: { page: toPageRef(1), point, shift: false },
    });
    let model = step(initialModel, create(points[0]))[0];
    model = step(model, create(points[1], { ...measure, measure: null }))[0];
    model = step(model, create(points[2], { ...measure, measure: null }))[0];
    const ghost = pageItems(model, PAGE)[0];
    expect(ghost.measure?.measure).toEqual(measure.measure);
    expect(
      scene(ghost).some(
        (node) => node.kind === 'text' && node.text === (closed ? '4.00 m²' : '6.00 m'),
      ),
    ).toBe(true);
    expect(creationDraftAnchor(model)?.canFinish).toBe(true);
    const [committed, effects] = step(model, { type: 'finishCreationDraft' });
    expect(effects).toMatchObject([{ type: 'create' }]);
    const created = committed.byId[committed.order[0]];
    expect(fieldsOf(created).geometry).toMatchObject({ closed, vertices: points.slice(0, 3) });
    expect(fieldsOf(created).measure).toEqual({ ...measure, text: closed ? '4.00 m²' : '6.00 m' });
    expect(created.source).toBe('vector');
  });

  it('keeps open perimeter lengths and computes area with its closed perimeter', () => {
    expect(shapeMeasurementReadout(geometry, appearance)).toMatchObject({
      label: '8.00 m²',
      perimeter: '12.00 m',
    });
    expect(
      shapeMeasurementReadout(
        { ...geometry, closed: false },
        { ...appearance, intent: 'polyline-dimension' },
      ),
    ).toMatchObject({ label: '10.00 m' });
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
    const center = shapeMeasurementLayout(geometry, appearance, STYLE)!.caption!.center;
    expect(hitTest(model, PAGE, center, DEFAULT_CHROME_GEOMETRY, 6)).toMatchObject({
      handle: 'caption',
    });
    expect(chrome(model, PAGE).filter((node) => node.kind === 'handle')).toHaveLength(4);
    model = pointer(model, 'down', center);
    model = pointer(model, 'move', { x: center.x + 150, y: center.y - 100 });
    const preview = pageItems(model, PAGE)[0];
    expect(preview.source).toBe('vector');
    expect(preview.measure?.caption).toEqual({ enabled: true, center: { x: 350, y: 50 } });
    expect(withoutLabel(fieldsOf(step(model, { type: 'cancel' })[0].byId.shape).measure)).toEqual(
      withoutLabel(appearance),
    );
    const [committed, effects] = step(model, {
      type: 'editPointer',
      phase: 'up',
      in: { page: toPageRef(1), point: center, shift: false },
    });
    expect(fieldsOf(committed.byId.shape).geometry).toEqual(geometry);
    expect(withoutLabel(fieldsOf(committed.byId.shape).measure)).toEqual(
      withoutLabel(preview.measure),
    );
    // Only the caption is written: its center, not the vertices.
    expect(effects).toEqual([
      {
        type: 'patch',
        id: 'shape',
        patch: { subtype: 'polygon', captionCenter: { x: 350, y: 50 } },
      },
    ]);
  });

  it.each([false, true])(
    'turns the shape and its caption about the middle of its points, manual=%s',
    (manual) => {
      const measure = manual ? withShapeCaptionPoint(appearance, { x: 420, y: 80 }) : appearance;
      const initial = selected(annotation(measure));
      const frame = annotationSelectionFrame(initial.byId.shape);
      const pivot = turnPivotOf(fieldsOf(initial.byId.shape).geometry);
      const caption = shapeMeasurementLayout(geometry, measure, STYLE)!.caption!;
      const knob = chrome(initial, PAGE).find((node) => node.kind === 'rotate-knob');
      if (knob?.kind !== 'rotate-knob') throw new Error('Missing rotation knob');
      const armed = pointer(initial, 'down', knob.at);
      for (const angle of [30, 90, 137, 180, 270]) {
        const at = rotatePoint(knob.at, pivot, angle);
        const moving = pointer(armed, 'move', at);
        const item = pageItems(moving, PAGE)[0];
        if (item.measure?.intent === 'line-dimension' || !item.measure)
          throw new Error('Missing shape');
        const layout = shapeMeasurementLayout(item.geometry, item.measure, item.style)!;
        expectPoint(layout.caption!.center, rotatePoint(caption.center, pivot, angle));
        const committed = pointer(moving, 'up', at);
        expectPoint(turnPivotOf(fieldsOf(committed.byId.shape).geometry), pivot);
        expectPoint(
          annotationSelectionFrame(committed.byId.shape).center,
          rotatePoint(frame.center, pivot, angle),
        );
        expect(rounded(withoutLabel(fieldsOf(committed.byId.shape).measure))).toEqual(
          rounded(withoutLabel(item.measure)),
        );
        expect(committed.byId.shape.source).toBe('vector');
      }
      const quarter = step(initial, { type: 'rotate90' })[0];
      const reset = step(quarter, { type: 'resetRotation' })[0];
      expectPoint(annotationSelectionFrame(reset.byId.shape).center, frame.center);
    },
  );

  it('keeps a manually placed label fixed during vertex edits and moves it with the whole shape', () => {
    const measure = withShapeCaptionPoint(appearance, { x: 420, y: 80 });
    const original = selected(annotation(measure));
    let model = pointer(original, 'down', points[0]);
    model = pointer(model, 'move', { x: 80, y: 90 });
    model = pointer(model, 'up', { x: 80, y: 90 });
    expect(withoutLabel(fieldsOf(model.byId.shape).measure)).toEqual(withoutLabel(measure));
    model = pointer(model, 'down', { x: 200, y: 150 });
    model = pointer(model, 'move', { x: 220, y: 175 });
    model = pointer(model, 'up', { x: 220, y: 175 });
    expect(
      shapeCaptionPoint(fieldsOf(model.byId.shape).measure as ShapeMeasurementAppearance),
    ).toEqual({
      x: 440,
      y: 105,
    });
  });

  it('does not finish a crossing area boundary', () => {
    let model = initialModel;
    for (const point of [points[0], points[2], points[1], points[3]]) {
      model = step(model, {
        type: 'createPointer',
        phase: 'down',
        subtype: 'polygon',
        measure: appearance,
        in: { page: toPageRef(1), point, shift: false },
      })[0];
    }
    expect(creationDraftAnchor(model)?.canFinish).toBe(false);
    expect(
      scene(pageItems(model, PAGE)[0]).some((node) => node.kind === 'text' && node.text === '—'),
    ).toBe(true);
    expect(step(model, { type: 'finishCreationDraft' })[0].order).toEqual([]);
    expect(step(model, { type: 'cancel' })[0].draft).toBeNull();
  });

  it('reverts a vertex edit that would cross the area boundary', () => {
    const original = selected();
    let model = pointer(original, 'down', points[0]);
    model = pointer(model, 'move', { x: 350, y: 150 });
    const preview = pageItems(model, PAGE)[0];
    expect(shapeMeasurementReadout(preview.geometry, appearance)).toMatchObject({
      unavailable: 'invalid-geometry',
    });
    const [committed, effects] = step(model, {
      type: 'editPointer',
      phase: 'up',
      in: { page: toPageRef(1), point: { x: 350, y: 150 }, shift: false },
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
    const outline = chrome(model, PAGE).find((node) => node.kind === 'outline');
    if (outline?.kind !== 'outline') throw new Error('Missing group outline');
    const corner = {
      x: outline.rect.x + outline.rect.width,
      y: outline.rect.y + outline.rect.height,
    };
    const target = { x: corner.x + 100, y: corner.y + 70 };
    model = pointer(model, 'down', corner);
    model = pointer(model, 'move', target);
    if (model.draft?.kind !== 'group') throw new Error('Missing group resize');
    const draft = model.draft;
    const center = shapeCaptionPoint(measure)!;
    const expected = {
      x: draft.anchor.x + (center.x - draft.anchor.x) * (draft.current.width / draft.base.width),
      y: draft.anchor.y + (center.y - draft.anchor.y) * (draft.current.height / draft.base.height),
    };
    const preview = pageItems(model, PAGE).find((item) => item.id === 'shape')!;
    expectPoint(shapeCaptionPoint(preview.measure as ShapeMeasurementAppearance)!, expected);
    const committed = pointer(model, 'up', target);
    expect(withoutLabel(fieldsOf(committed.byId.shape).measure)).toEqual(
      withoutLabel(preview.measure),
    );
    expect(fieldsOf(committed.byId.shape).geometry).toEqual(preview.geometry);
    expect(committed.byId.shape.source).toBe('vector');
  });
});
