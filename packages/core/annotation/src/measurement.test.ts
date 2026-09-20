import { describe, expect, it } from 'vitest';
import { measureFromKnownLength } from '@embedpdf/engine-core/runtime';
import {
  distanceCaptionAt,
  distanceLabel,
  distanceLayout,
  distanceHit,
  distanceScene,
  moveDistanceCaption,
  type DistanceAppearance,
} from './measurement';
import { initialModel, initialStyle, update } from './update';
import { pageItems, chrome } from './view';
import { hitTest } from './hit';
import { DRAWN_FLAGS } from './flags';
import { DEFAULT_CHROME_GEOM } from './geometry';
import type { Annot, Geom, Model, Msg } from './types';
const geom: Geom = {
  t: 'line',
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
const annot: Annot = {
  id: 'a',
  ref: null,
  pon: 1,
  subtype: 'line',
  geom,
  measure,
  style: initialStyle,
  source: 'baked',
  flags: DRAWN_FLAGS,
};
const model = (): Model => ({ ...initialModel, byId: { a: annot }, order: ['a'], selected: ['a'] });
const pointer = (phase: 'down' | 'move' | 'up', point: { x: number; y: number }): Msg => ({
  t: 'editPointer',
  phase,
  in: { pon: 1, point, shift: false },
});
describe('distance gestures and captions', () => {
  it('rounds in original PDF coordinates at large nonzero origins', () => {
    const crop = { left: 100000000, right: 100001000, top: 100000000, bottom: 99999000 };
    const g: Geom = { t: 'line', a: { x: 1, y: 1 }, b: { x: 12, y: 1 } };
    expect(distanceLabel(g, { ...measure, crop })).toBe('0.32 m');
  });
  it('derives live labels and preserves foreign stored contents', () => {
    expect(distanceLabel(geom, measure)).toBe('4 m');
    expect(distanceLabel(geom, { ...measure, measure: { subtype: 'GEO' } })).toBe('stored');
    expect(
      distanceScene(geom, measure, initialStyle).some((n) => n.kind === 'text' && n.text === '4 m'),
    ).toBe(true);
  });
  it('drags captions in PDF line axes without touching geometry, and can cancel', () => {
    let m = model();
    const at = distanceCaptionAt(geom, measure, initialStyle.strokeWidth)!;
    expect(at).toEqual({ x: 140, y: 88 });
    expect(hitTest(m, 1, at, DEFAULT_CHROME_GEOM, 6)).toMatchObject({
      t: 'handle',
      handle: 'caption',
    });
    m = update(m, pointer('down', at))[0];
    m = update(m, pointer('move', { x: at.x + 20, y: at.y - 30 }))[0];
    expect(pageItems(m, 1)[0].source).toBe('vector');
    expect((pageItems(m, 1)[0].measure as DistanceAppearance).caption.offset).toEqual({
      along: 20,
      perpendicular: 30,
    });
    const handles = chrome(m, 1).filter((node) => node.kind === 'handle');
    expect(handles).toHaveLength(4);
    expect(handles.some((node) => node.at.x === at.x + 20 && node.at.y === at.y - 30)).toBe(false);
    expect(update(m, { t: 'cancel' })[0].byId.a).toBe(annot);
    const [committed, effects] = update(m, pointer('up', at));
    expect(committed.byId.a.geom).toBe(geom);
    expect(effects).toEqual([{ fx: 'patch', id: 'a', scope: { kind: 'caption' } }]);
  });
  it('keeps directed offset signs for a reversed diagonal', () => {
    const g: Geom = { t: 'line', a: { x: 100, y: 100 }, b: { x: 0, y: 0 } };
    const moved = moveDistanceCaption(g, measure, { x: -10, y: 0 });
    expect(moved.caption.offset?.along).toBeCloseTo(Math.sqrt(50));
    expect(moved.caption.offset?.perpendicular).toBeCloseTo(Math.sqrt(50));
  });
  it('captures the original tool without inserting an annotation', () => {
    let m = initialModel;
    const msg = (phase: 'down' | 'move' | 'up', x: number): Msg => ({
      t: 'createPointer',
      phase,
      subtype: 'line',
      capture: 'calibrate',
      in: { pon: 1, point: { x, y: 20 }, shift: false },
    });
    m = update(m, msg('down', 10))[0];
    m = update(m, msg('move', 150))[0];
    const [next, effects] = update(m, { ...msg('up', 150), capture: 'another-tool' } as Msg);
    expect(next.order).toEqual([]);
    expect(next.draft).toBeNull();
    expect(effects).toMatchObject([{ fx: 'captured', tool: 'calibrate', pon: 1 }]);
  });
  it('hides caption handles on locked records', () => {
    const m = model();
    m.byId = { a: { ...annot, flags: { ...annot.flags, locked: true } } };
    expect(chrome(m, 1).some((n) => n.kind === 'handle')).toBe(false);
  });

  it('places the dimension line after releasing the measured endpoints', () => {
    let state = initialModel;
    const create = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
      t: 'createPointer',
      phase,
      subtype: 'line',
      measure,
      in: { pon: 1, point: { x, y }, shift: false },
    });

    state = update(state, create('down', 40, 100))[0];
    state = update(state, create('move', 240, 100))[0];
    const [released, releaseEffects] = update(state, create('up', 240, 100));
    expect(released.draft).toMatchObject({ g: 'create-distance', step: 'offset' });
    expect(released.order).toEqual([]);
    expect(releaseEffects).toEqual([]);

    state = update(released, create('move', 190, 160))[0];
    const preview = pageItems(state, 1)[0];
    expect(preview.geom).toMatchObject({ a: { x: 40, y: 100 }, b: { x: 240, y: 100 } });
    expect((preview.measure as DistanceAppearance).leader?.length).toBe(-60);
    expect(distanceLabel(preview.geom, preview.measure as DistanceAppearance)).toBe('4 m');
    expect(update(state, { t: 'cancel' })[0].order).toEqual([]);

    const [committed, effects] = update(state, create('down', 190, 160));
    expect(committed.order).toHaveLength(1);
    expect(committed.draft).toBeNull();
    expect(effects).toEqual([{ fx: 'create', id: committed.order[0] }]);
    expect(update(committed, create('up', 190, 160))[1]).toEqual([]);
  });

  it('keeps offset placement on its home page and discards a click without a length', () => {
    const message = (phase: 'down' | 'move' | 'up', x: number, pon = 1): Msg => ({
      t: 'createPointer',
      phase,
      subtype: 'line',
      measure,
      in: { pon, point: { x, y: 100 }, shift: false },
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
      expect(hitTest(state, 1, point, DEFAULT_CHROME_GEOM, 6)).toMatchObject({ handle });

      state = update(state, pointer('down', point))[0];
      state = update(state, pointer('move', { x: point.x + 35, y: 160 }))[0];
      expect((pageItems(state, 1)[0].measure as DistanceAppearance).leader?.length).toBe(-60);
      expect(pageItems(state, 1)[0].geom).toEqual(geom);
      expect(update(state, { t: 'cancel' })[0].byId.a).toBe(annot);

      const [committed, effects] = update(state, pointer('up', point));
      expect((committed.byId.a.measure as DistanceAppearance).leader?.length).toBe(-60);
      expect(committed.byId.a.geom).toBe(geom);
      expect(effects).toEqual([{ fx: 'patch', id: 'a', scope: { kind: 'leader' } }]);
    },
  );

  it('drags the measured endpoint independently of leader and caption offsets', () => {
    let state = model();
    state = update(state, pointer('down', { x: 40, y: 100 }))[0];
    state = update(state, pointer('move', { x: 100, y: 100 }))[0];
    const [committed] = update(state, pointer('up', { x: 100, y: 100 }));
    expect(committed.byId.a.geom).toMatchObject({ a: { x: 100, y: 100 }, b: { x: 240, y: 100 } });
    expect(committed.byId.a.measure).toBe(measure);
    expect(distanceLabel(committed.byId.a.geom, measure)).toBe('2.8 m');
  });

  it('encloses leaders, displaced captions, connectors and handles in the selection', () => {
    const state = model();
    state.byId = {
      a: {
        ...annot,
        measure: {
          ...measure,
          caption: { enabled: true, offset: { along: 170, perpendicular: -90 } },
        },
      },
    };
    const layout = distanceLayout(geom, state.byId.a.measure as DistanceAppearance, 1)!;
    const nodes = chrome(state, 1);
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
    const short: Geom = { ...geom, a: { x: 0, y: 0 }, b: { x: 49.7457, y: 0 } };
    const layout = distanceLayout(short, fixtureMeasure, 1)!;
    expect(layout.arrowPlacement).toBe('outside');
    expect(layout.dimensionSegments).toEqual([
      { from: { x: -20, y: 15 }, to: { x: 0, y: 15 } },
      { from: { x: 49.7457, y: 15 }, to: { x: 69.7457, y: 15 } },
    ]);
    expect(layout.caption!.center.y).toBe(26.5);
    expect(distanceHit(layout, { x: 24, y: 15 }, 1, 1)).toBe(false);

    const longer: Geom = { ...short, b: { x: 56.9457, y: 0 } };
    expect(distanceLayout(longer, { ...fixtureMeasure, text: '2.01 m' }, 1)!.arrowPlacement).toBe(
      'inside',
    );
  });

  it('hit-tests the rotated caption rectangle rather than a circle around it', () => {
    const diagonal: Geom = { t: 'line', a: { x: 50, y: 50 }, b: { x: 250, y: 250 } };
    const appearance = {
      ...measure,
      caption: { enabled: true, offset: { along: 0, perpendicular: 80 } },
    };
    const state = model();
    state.byId = { a: { ...annot, geom: diagonal, measure: appearance } };
    const layout = distanceLayout(diagonal, appearance, 1)!;
    const caption = layout.caption!;
    const nearText = {
      x: caption.center.x + caption.along.x * (caption.width / 2 - 1),
      y: caption.center.y + caption.along.y * (caption.width / 2 - 1),
    };
    expect(hitTest(state, 1, nearText, DEFAULT_CHROME_GEOM, 6)).toMatchObject({
      handle: 'caption',
    });
    const awayFromText = {
      x: caption.center.x + caption.normal.x * 12,
      y: caption.center.y + caption.normal.y * 12,
    };
    expect(hitTest(state, 1, awayFromText, DEFAULT_CHROME_GEOM, 6).t).not.toBe('handle');
  });

  it('selects the nearest handle when the endpoint and leader hit areas overlap', () => {
    const state = model();
    const chromeGeometry = { ...DEFAULT_CHROME_GEOM, handleTol: 16 };
    expect(hitTest(state, 1, { x: 240, y: 88 }, chromeGeometry, 6)).toMatchObject({
      handle: 'leader-end',
    });
    expect(hitTest(state, 1, { x: 240, y: 100 }, chromeGeometry, 6)).toMatchObject({
      handle: 'v1',
    });
  });

  it('keeps the rotate knob clear of the caption when the dimension line moves above the endpoints', () => {
    const state = model();
    state.byId = { a: { ...annot, measure: { ...measure, leader: { length: 36 } } } };
    expect(hitTest(state, 1, { x: 140, y: 64 }, DEFAULT_CHROME_GEOM, 6)).toMatchObject({
      handle: 'caption',
    });
    const knob = chrome(state, 1).find((node) => node.kind === 'rotate-knob');
    expect(knob).toBeDefined();
    if (knob?.kind === 'rotate-knob') {
      expect(hitTest(state, 1, knob.at, DEFAULT_CHROME_GEOM, 6).t).toBe('rotate');
    }
  });
});
