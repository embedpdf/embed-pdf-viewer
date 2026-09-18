import { describe, expect, it } from 'vitest';
import { measureFromKnownLength } from '@embedpdf/engine-core/runtime';
import {
  distanceCaptionAt,
  distanceLabel,
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
    expect(pageItems(m, 1)[0].measure?.caption.offset).toEqual({ along: 20, perpendicular: 30 });
    expect(
      chrome(m, 1).some((n) => n.kind === 'handle' && n.at.x === at.x + 20 && n.at.y === at.y - 30),
    ).toBe(true);
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
});
