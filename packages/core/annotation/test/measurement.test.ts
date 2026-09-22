import { describe, expect, it } from 'vitest';
import { measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import {
  distanceCaptionAt,
  distanceLabel,
  distanceLayout,
  distanceHit,
  distanceScene,
  moveDistanceCaption,
  type DistanceAppearance,
} from '../src/measurement';
import { initialModel, initialStyle, update } from '../src/update';
import { pageItems, chrome } from '../src/view';
import { hitTest } from '../src/hit';
import { DRAWN_FLAGS } from '../src/flags';
import { DEFAULT_CHROME_GEOMETRY } from '../src/geometry';
import type { ModelAnnotation, ContentGeometry, Model, Message } from '../src/types';
const PAGE = toPageRef(1);
const geom: ContentGeometry = {
  kind: 'line',
  a: { x: 40, y: 100 },
  b: { x: 240, y: 100 },
  ends: { start: 'closed-arrow', end: 'closed-arrow' },
};
const measure: DistanceAppearance = {
  intent: 'LineDimension',
  measure: measureFromKnownLength(100, { value: 2, unit: 'm' }),
  crop: { left: -20, bottom: -40, top: 760, right: 580 },
  caption: { enabled: true, position: 'inline' },
  leader: { length: 12, extension: 5 },
  text: 'stored',
};
const annotation: ModelAnnotation = {
  id: 'a',
  ref: null,
  page: toPageRef(1),
  subtype: 'line',
  geometry: geom,
  measure,
  style: initialStyle,
  source: 'baked',
  flags: DRAWN_FLAGS,
};
const model = (): Model => ({
  ...initialModel,
  byId: { a: annotation },
  order: ['a'],
  selected: ['a'],
});
const pointer = (phase: 'down' | 'move' | 'up', point: { x: number; y: number }): Message => ({
  type: 'editPointer',
  phase,
  in: { page: toPageRef(1), point, shift: false },
});
describe('distance gestures and captions', () => {
  it('rounds in original PDF coordinates at large nonzero origins', () => {
    const crop = { left: 100000000, right: 100001000, top: 100000000, bottom: 99999000 };
    const geometry: ContentGeometry = { kind: 'line', a: { x: 1, y: 1 }, b: { x: 12, y: 1 } };
    expect(distanceLabel(geometry, { ...measure, crop })).toBe('0.32 m');
  });
  it('derives live labels and preserves foreign stored contents', () => {
    expect(distanceLabel(geom, measure)).toBe('4 m');
    expect(distanceLabel(geom, { ...measure, measure: { subtype: 'GEO' } })).toBe('stored');
    expect(
      distanceScene(geom, measure, initialStyle).some(
        (node) => node.kind === 'text' && node.text === '4 m',
      ),
    ).toBe(true);
  });
  it('drags captions in PDF line axes without touching geometry, and can cancel', () => {
    let state = model();
    const at = distanceCaptionAt(geom, measure, initialStyle.strokeWidth)!;
    expect(at).toEqual({ x: 140, y: 88 });
    expect(hitTest(state, PAGE, at, DEFAULT_CHROME_GEOMETRY, 6)).toMatchObject({
      kind: 'handle',
      handle: 'caption',
    });
    state = update(state, pointer('down', at))[0];
    state = update(state, pointer('move', { x: at.x + 20, y: at.y - 30 }))[0];
    expect(pageItems(state, PAGE)[0].source).toBe('vector');
    expect((pageItems(state, PAGE)[0].measure as DistanceAppearance).caption.offset).toEqual({
      along: 20,
      perpendicular: 30,
    });
    const handles = chrome(state, PAGE).filter((node) => node.kind === 'handle');
    expect(handles).toHaveLength(4);
    expect(handles.some((node) => node.at.x === at.x + 20 && node.at.y === at.y - 30)).toBe(false);
    expect(update(state, { type: 'cancel' })[0].byId.a).toBe(annotation);
    const [committed, effects] = update(state, pointer('up', at));
    expect(committed.byId.a.geometry).toBe(geom);
    expect(effects).toEqual([{ type: 'patch', id: 'a', scope: { kind: 'caption' } }]);
  });
  it('keeps directed offset signs for a reversed diagonal', () => {
    const geometry: ContentGeometry = { kind: 'line', a: { x: 100, y: 100 }, b: { x: 0, y: 0 } };
    const moved = moveDistanceCaption(geometry, measure, { x: -10, y: 0 });
    expect(moved.caption.offset?.along).toBeCloseTo(Math.sqrt(50));
    expect(moved.caption.offset?.perpendicular).toBeCloseTo(Math.sqrt(50));
  });
  it('captures the original tool without inserting an annotation', () => {
    let model = initialModel;
    const message = (phase: 'down' | 'move' | 'up', x: number): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'line',
      capture: 'calibrate',
      in: { page: toPageRef(1), point: { x, y: 20 }, shift: false },
    });
    model = update(model, message('down', 10))[0];
    model = update(model, message('move', 150))[0];
    const [next, effects] = update(model, {
      ...message('up', 150),
      capture: 'another-tool',
    } as Message);
    expect(next.order).toEqual([]);
    expect(next.draft).toBeNull();
    expect(effects).toMatchObject([{ type: 'captured', tool: 'calibrate', page: toPageRef(1) }]);
  });
  it('hides caption handles on locked records', () => {
    const state = model();
    state.byId = { a: { ...annotation, flags: { ...annotation.flags, locked: true } } };
    expect(chrome(state, PAGE).some((node) => node.kind === 'handle')).toBe(false);
  });

  it('places the dimension line after releasing the measured endpoints', () => {
    let state = initialModel;
    const create = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'line',
      measure,
      in: { page: toPageRef(1), point: { x, y }, shift: false },
    });

    state = update(state, create('down', 40, 100))[0];
    state = update(state, create('move', 240, 100))[0];
    const [released, releaseEffects] = update(state, create('up', 240, 100));
    expect(released.draft).toMatchObject({ kind: 'create-distance', step: 'offset' });
    expect(released.order).toEqual([]);
    expect(releaseEffects).toEqual([]);

    state = update(released, create('move', 190, 160))[0];
    const preview = pageItems(state, PAGE)[0];
    expect(preview.geometry).toMatchObject({ a: { x: 40, y: 100 }, b: { x: 240, y: 100 } });
    expect((preview.measure as DistanceAppearance).leader?.length).toBe(-60);
    expect(distanceLabel(preview.geometry, preview.measure as DistanceAppearance)).toBe('4 m');
    expect(update(state, { type: 'cancel' })[0].order).toEqual([]);

    const [committed, effects] = update(state, create('down', 190, 160));
    expect(committed.order).toHaveLength(1);
    expect(committed.draft).toBeNull();
    expect(effects).toEqual([{ type: 'create', id: committed.order[0] }]);
    expect(update(committed, create('up', 190, 160))[1]).toEqual([]);
  });

  it('keeps offset placement on its home page and discards a click without a length', () => {
    const message = (phase: 'down' | 'move' | 'up', x: number, pageObjectNumber = 1): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'line',
      measure,
      in: { page: toPageRef(pageObjectNumber), point: { x, y: 100 }, shift: false },
    });
    let state = update(initialModel, message('down', 40))[0];
    expect(update(state, message('up', 40))[0].draft).toBeNull();

    state = update(state, message('up', 240))[0];
    expect(update(state, message('down', 180, 2))[0]).toBe(state);
    expect(update(state, message('move', 180, 2))[0]).toBe(state);
  });

  it.each(['leader-start', 'leader-end'])(
    'edits %s without changing the measured points',
    (handle) => {
      let state = model();
      const point = { x: handle === 'leader-start' ? 40 : 240, y: 88 };
      expect(hitTest(state, PAGE, point, DEFAULT_CHROME_GEOMETRY, 6)).toMatchObject({ handle });

      state = update(state, pointer('down', point))[0];
      state = update(state, pointer('move', { x: point.x + 35, y: 160 }))[0];
      expect((pageItems(state, PAGE)[0].measure as DistanceAppearance).leader?.length).toBe(-60);
      expect(pageItems(state, PAGE)[0].geometry).toEqual(geom);
      expect(update(state, { type: 'cancel' })[0].byId.a).toBe(annotation);

      const [committed, effects] = update(state, pointer('up', point));
      expect((committed.byId.a.measure as DistanceAppearance).leader?.length).toBe(-60);
      expect(committed.byId.a.geometry).toBe(geom);
      expect(effects).toEqual([{ type: 'patch', id: 'a', scope: { kind: 'leader' } }]);
    },
  );

  it('drags the measured endpoint independently of leader and caption offsets', () => {
    let state = model();
    state = update(state, pointer('down', { x: 40, y: 100 }))[0];
    state = update(state, pointer('move', { x: 100, y: 100 }))[0];
    const [committed] = update(state, pointer('up', { x: 100, y: 100 }));
    expect(committed.byId.a.geometry).toMatchObject({
      a: { x: 100, y: 100 },
      b: { x: 240, y: 100 },
    });
    expect(committed.byId.a.measure).toBe(measure);
    expect(distanceLabel(committed.byId.a.geometry, measure)).toBe('2.8 m');
  });

  it('encloses leaders, displaced captions, connectors and handles in the selection', () => {
    const state = model();
    state.byId = {
      a: {
        ...annotation,
        measure: {
          ...measure,
          caption: { enabled: true, offset: { along: 170, perpendicular: -90 } },
        },
      },
    };
    const layout = distanceLayout(geom, state.byId.a.measure as DistanceAppearance, 1)!;
    const nodes = chrome(state, PAGE);
    const outline = nodes.find((node) => node.kind === 'outline')!;
    expect(outline.kind).toBe('outline');
    if (outline.kind !== 'outline') return;

    const points = [geom.a, geom.b, ...layout.caption!.bounds];
    for (const node of nodes) {
      if (node.kind === 'handle') points.push(node.at);
    }
    for (const point of points) {
      expect(point.x).toBeGreaterThan(outline.rect.x);
      expect(point.x).toBeLessThan(outline.rect.x + outline.rect.width);
      expect(point.y).toBeGreaterThan(outline.rect.y);
      expect(point.y).toBeLessThan(outline.rect.y + outline.rect.height);
    }
    expect(layout.captionConnector).toHaveLength(2);
    expect(distanceHit(layout, { x: 40, y: 94 }, 1, 1)).toBe(true);
  });

  it('matches the fixture short-arrow cases without painting the inner shaft', () => {
    const fixtureMeasure = {
      ...measure,
      measure: null,
      text: '1.75 m',
      leader: { length: -15, extension: 5 },
    };
    const short: ContentGeometry = { ...geom, a: { x: 0, y: 0 }, b: { x: 49.7457, y: 0 } };
    const layout = distanceLayout(short, fixtureMeasure, 1)!;
    expect(layout.arrowPlacement).toBe('outside');
    expect(layout.dimensionSegments).toEqual([
      { from: { x: -20, y: 15 }, to: { x: 0, y: 15 } },
      { from: { x: 49.7457, y: 15 }, to: { x: 69.7457, y: 15 } },
    ]);
    expect(layout.caption!.center.y).toBe(26.5);
    expect(distanceHit(layout, { x: 24, y: 15 }, 1, 1)).toBe(false);

    const longer: ContentGeometry = { ...short, b: { x: 56.9457, y: 0 } };
    expect(distanceLayout(longer, { ...fixtureMeasure, text: '2.01 m' }, 1)!.arrowPlacement).toBe(
      'inside',
    );
  });

  it('hit-tests the rotated caption rectangle rather than a circle around it', () => {
    const diagonal: ContentGeometry = { kind: 'line', a: { x: 50, y: 50 }, b: { x: 250, y: 250 } };
    const appearance = {
      ...measure,
      caption: { enabled: true, offset: { along: 0, perpendicular: 80 } },
    };
    const state = model();
    state.byId = { a: { ...annotation, geometry: diagonal, measure: appearance } };
    const layout = distanceLayout(diagonal, appearance, 1)!;
    const caption = layout.caption!;
    const nearText = {
      x: caption.center.x + caption.along.x * (caption.width / 2 - 1),
      y: caption.center.y + caption.along.y * (caption.width / 2 - 1),
    };
    expect(hitTest(state, PAGE, nearText, DEFAULT_CHROME_GEOMETRY, 6)).toMatchObject({
      handle: 'caption',
    });
    const awayFromText = {
      x: caption.center.x + caption.normal.x * 12,
      y: caption.center.y + caption.normal.y * 12,
    };
    expect(hitTest(state, PAGE, awayFromText, DEFAULT_CHROME_GEOMETRY, 6).kind).not.toBe('handle');
  });

  it('selects the nearest handle when the endpoint and leader hit areas overlap', () => {
    const state = model();
    const chromeGeometry = { ...DEFAULT_CHROME_GEOMETRY, handleTol: 16 };
    expect(hitTest(state, PAGE, { x: 240, y: 88 }, chromeGeometry, 6)).toMatchObject({
      handle: 'leader-end',
    });
    expect(hitTest(state, PAGE, { x: 240, y: 100 }, chromeGeometry, 6)).toMatchObject({
      handle: 'v1',
    });
  });

  it('keeps the rotate knob clear of the caption when the dimension line moves above the endpoints', () => {
    const state = model();
    state.byId = { a: { ...annotation, measure: { ...measure, leader: { length: 36 } } } };
    expect(hitTest(state, PAGE, { x: 140, y: 64 }, DEFAULT_CHROME_GEOMETRY, 6)).toMatchObject({
      handle: 'caption',
    });
    const knob = chrome(state, PAGE).find((node) => node.kind === 'rotate-knob');
    expect(knob).toBeDefined();
    if (knob?.kind === 'rotate-knob') {
      expect(hitTest(state, PAGE, knob.at, DEFAULT_CHROME_GEOMETRY, 6).kind).toBe('rotate');
    }
  });
});
