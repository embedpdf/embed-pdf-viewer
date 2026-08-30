import { describe, expect, it } from 'vitest';
import { textQuadFromRect } from '@embedpdf/core-geometry';
import {
  annotsInBox,
  defaultsFor,
  initialModel,
  initialStyle,
  rotateDraftDelta,
  update,
} from './update';
import { clickCreateGeom, resolveClickPlacement } from './placement';
import { computeMoveSnap } from './snap';
import {
  chrome,
  creationDraftAnchor,
  pageItems,
  selectionAnchor,
  selectionBoundsOnPage,
  selectionKnob,
  textBoxes,
} from './view';
import { cursorAt, groupUnionBounds, hitTest, paintOrder } from './hit';
import { isAttachedLink, isConversationOnly, isSubstrateOnly } from './plane';
import { linkChildrenOf, linkOf } from './links';
import { capsFor } from './kinds';
import { annotDeletable, annotTransformable, DRAWN_FLAGS } from './flags';
import {
  chordThrough,
  geomBounds,
  geomHit,
  geomScene,
  quadIntersectsRect,
  geomVisualBounds,
  geomHandles,
  geomTranslate,
  geomDragHandle,
  calloutConnection,
  calloutLinePoints,
  selectionBounds,
  shapeRectFor,
  caretGeomFromAnchor,
  caretRectFromAnchor,
  contentToPdfRect,
  pdfToContentRect,
  contentToPdfPoint,
  pdfToContentPoint,
  centroidOf,
  geomRotation,
  geomRotateAbout,
  geomResetRotation,
  obbFromGeom,
  placeRotateKnob,
  DEFAULT_CHROME_GEOM,
  rotateKnob,
  rotatedAabb,
  normalizeDeg,
  rotatedHandleCursor,
  selectionQuad,
  selectionCenter,
  transposedAboutCenter,
  uprightAnchoredRect,
  uprightRotation,
  fitStampBox,
  apSizeChanged,
} from './geometry';
import { cloudyBorderExtent } from './cloudy';
import { scene } from './scene';
import { expandGroups, groupKeyOf, groupMembers } from './group';
import type { Annot, Geom, Model, Msg, RenderItem, Style, Subtype, Vec } from './types';

const PON = 1 as Annot['pon'];
const editPtr = (phase: 'down' | 'move' | 'up', x: number, y: number, shift = false): Msg => ({
  t: 'editPointer',
  phase,
  in: { pon: PON, point: { x, y }, shift },
});
const marqueePtr = (phase: 'down' | 'move' | 'up', x: number, y: number, shift = false): Msg => ({
  t: 'marqueePointer',
  phase,
  in: { pon: PON, point: { x, y }, shift },
});
const createPtr = (
  subtype: Extract<Subtype, 'square' | 'circle' | 'line' | 'polygon' | 'polyline'> | 'free-text',
  phase: 'down' | 'move' | 'up',
  x: number,
  y: number,
  finish = false,
): Msg => ({
  t: 'createPointer',
  phase,
  subtype,
  in: { pon: PON, point: { x, y }, shift: false, finish },
});
const run = (m: Model, msgs: Msg[]): Model => msgs.reduce((acc, msg) => update(acc, msg)[0], m);
const rectGeom = (g: Geom) => (g.t === 'rect' ? g.rect : null);
// rotatedAabb goes through sin/cos, so a quarter-turn carries ~1e-14 fuzz —
// compare the round-trip footprints field-wise, not with toEqual.
const expectRectClose = (
  got: { x: number; y: number; width: number; height: number },
  want: { x: number; y: number; width: number; height: number },
) => {
  expect(got.x).toBeCloseTo(want.x, 6);
  expect(got.y).toBeCloseTo(want.y, 6);
  expect(got.width).toBeCloseTo(want.width, 6);
  expect(got.height).toBeCloseTo(want.height, 6);
};

describe('resolveClickPlacement — the shared placement layer', () => {
  const PAGE = { x: 0, y: 0, width: 300, height: 400 };

  it('boxes anchor CENTER by default, TOP-LEFT when the policy says so', () => {
    const centred = resolveClickPlacement({ x: 100, y: 100 }, { width: 80, height: 60 });
    expect(centred).toMatchObject({ kind: 'box', rect: { x: 60, y: 70, width: 80, height: 60 } });
    const anchored = resolveClickPlacement(
      { x: 100, y: 100 },
      { width: 80, height: 60, anchor: 'top-left' },
    );
    expect(anchored).toMatchObject({ kind: 'box', rect: { x: 100, y: 100 } });
  });

  it('boxes slide INSIDE the page at edges and corners', () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 0, y: 400 },
      { x: 300, y: 400 },
    ]) {
      const p = resolveClickPlacement(point, { width: 80, height: 60 }, { pageBox: PAGE });
      if (p.kind !== 'box') throw new Error('expected box');
      expect(p.rect.x).toBeGreaterThanOrEqual(0);
      expect(p.rect.y).toBeGreaterThanOrEqual(0);
      expect(p.rect.x + p.rect.width).toBeLessThanOrEqual(300);
      expect(p.rect.y + p.rect.height).toBeLessThanOrEqual(400);
      expect(p.rect).toMatchObject({ width: 80, height: 60 }); // slid, never squashed
    }
  });

  it('segments keep their length and slide onto the page as a unit', () => {
    const p = resolveClickPlacement({ x: 290, y: 10 }, { length: 80 }, { pageBox: PAGE });
    if (p.kind !== 'segment') throw new Error('expected segment');
    expect(Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y)).toBeCloseTo(80);
    expect(Math.max(p.a.x, p.b.x)).toBeLessThanOrEqual(300);
  });

  it('upright: a centred box transposes under a quarter-turn; top-left anchors in the display frame', () => {
    const centred = resolveClickPlacement(
      { x: 100, y: 100 },
      { width: 80, height: 60 },
      { upright: true, displayRotation: 90 },
    );
    if (centred.kind !== 'box') throw new Error('expected box');
    // Transposed about the centre: the DISPLAYED box keeps 80×60.
    expect(centred.rect).toMatchObject({ width: 60, height: 80 });
    expect(centred.rot).not.toBe(0);
    const anchored = resolveClickPlacement(
      { x: 100, y: 100 },
      { width: 80, height: 60, anchor: 'top-left' },
      { upright: true, displayRotation: 90 },
    );
    if (anchored.kind !== 'box') throw new Error('expected box');
    expect(anchored.rect).toEqual(uprightAnchoredRect({ x: 100, y: 100 }, 80, 60, 90));
  });

  it('GHOST ≡ COMMIT: the footprint call and the up-phase produce the same geometry', () => {
    const pageBox = PAGE;
    const cases: Array<{
      subtype: 'square' | 'free-text' | 'line';
      policy: import('./types').ClickCreate;
    }> = [
      { subtype: 'square', policy: { width: 80, height: 60 } },
      { subtype: 'free-text', policy: { width: 180, height: 40, anchor: 'top-left' } },
      { subtype: 'line', policy: { length: 80 } },
    ];
    for (const { subtype, policy } of cases) {
      const point = { x: 295, y: 5 }; // a corner, so the clamp is exercised too
      const m = run(initialModel, [
        {
          t: 'createPointer',
          phase: 'down',
          subtype,
          clickCreate: policy,
          in: { pon: PON, point, shift: false, pageBox },
        },
        {
          t: 'createPointer',
          phase: 'up',
          subtype,
          clickCreate: policy,
          in: { pon: PON, point, shift: false, pageBox },
        },
      ]);
      const committed = m.byId[m.order[0]]!.geom;
      // Exactly the call the hover ghost makes (capability ghostHoverAt):
      const ghost = clickCreateGeom(
        subtype,
        resolveClickPlacement(point, policy, { pageBox }),
        defaultsFor(initialModel, subtype),
      );
      expect(ghost).toEqual(committed);
    }
  });
});

describe('click-create (a bare click places the tool default)', () => {
  const clickMsg = (
    subtype: 'square' | 'line' | 'free-text',
    phase: 'down' | 'up',
    x: number,
    y: number,
    clickCreate: import('./types').ClickCreate | false,
    pageBox?: { x: number; y: number; width: number; height: number },
  ): Msg => ({
    t: 'createPointer',
    phase,
    subtype,
    clickCreate,
    in: { pon: PON, point: { x, y }, shift: false, pageBox },
  });

  it('square: click drops the default size CENTRED on the point', () => {
    const m = run(initialModel, [
      clickMsg('square', 'down', 100, 100, { width: 80, height: 60 }),
      clickMsg('square', 'up', 100, 100, { width: 80, height: 60 }),
    ]);
    expect(rectGeom(m.byId[m.order[0]].geom)).toMatchObject({
      x: 60,
      y: 70,
      width: 80,
      height: 60,
    });
  });

  it('square: the click box is page-bound (slides inside the page)', () => {
    const page = { x: 0, y: 0, width: 300, height: 400 };
    const m = run(initialModel, [
      clickMsg('square', 'down', 295, 5, { width: 80, height: 60 }, page),
      clickMsg('square', 'up', 295, 5, { width: 80, height: 60 }, page),
    ]);
    expect(rectGeom(m.byId[m.order[0]].geom)).toMatchObject({ x: 220, y: 0 });
  });

  it('square: a real drag still wins over the click policy', () => {
    const m = run(initialModel, [
      clickMsg('square', 'down', 10, 10, { width: 80, height: 60 }),
      {
        t: 'createPointer',
        phase: 'move',
        subtype: 'square',
        in: { pon: PON, point: { x: 90, y: 50 }, shift: false },
      },
      {
        t: 'createPointer',
        phase: 'up',
        subtype: 'square',
        in: { pon: PON, point: { x: 90, y: 50 }, shift: false },
      },
    ]);
    expect(rectGeom(m.byId[m.order[0]].geom)).toMatchObject({ width: 80, height: 40 });
  });

  it('line: click lays a default-length segment from the point', () => {
    const m = run(initialModel, [
      clickMsg('line', 'down', 20, 30, { length: 80 }),
      clickMsg('line', 'up', 20, 30, { length: 80 }),
    ]);
    expect(m.byId[m.order[0]].geom).toMatchObject({
      t: 'line',
      a: { x: 20, y: 30 },
      b: { x: 100, y: 30 },
    });
  });

  it('no policy: a bare click stays a no-op for shapes', () => {
    const m = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'up', 100, 100),
    ]);
    expect(m.order).toHaveLength(0);
  });

  it('free-text: clickCreate false suppresses the kind fallback', () => {
    const m = run(initialModel, [
      clickMsg('free-text', 'down', 10, 10, false),
      clickMsg('free-text', 'up', 10, 10, false),
    ]);
    expect(m.order).toHaveLength(0);
  });
});

describe('annotation-core', () => {
  it('creates square / circle / line with the right geom + a create effect', () => {
    const sq = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 160),
      createPtr('square', 'up', 200, 160),
    ]);
    const a = sq.byId[sq.order[0]];
    expect(a.geom).toMatchObject({ t: 'rect', ellipse: false });
    expect(rectGeom(a.geom)).toMatchObject({ x: 100, y: 100, width: 100, height: 60 });
    expect(a.source).toBe('vector');

    const ci = run(initialModel, [
      createPtr('circle', 'down', 0, 0),
      createPtr('circle', 'move', 50, 50),
      createPtr('circle', 'up', 50, 50),
    ]);
    expect(ci.byId[ci.order[0]].geom).toMatchObject({ t: 'rect', ellipse: true });

    const ln = run(initialModel, [
      createPtr('line', 'down', 10, 10),
      createPtr('line', 'move', 90, 40),
      createPtr('line', 'up', 90, 40),
    ]);
    expect(ln.byId[ln.order[0]].geom).toMatchObject({
      t: 'line',
      a: { x: 10, y: 10 },
      b: { x: 90, y: 40 },
    });

    const [, fx] = update(
      run(initialModel, [createPtr('square', 'down', 0, 0), createPtr('square', 'move', 40, 40)]),
      createPtr('square', 'up', 40, 40),
    );
    expect(fx[0]).toMatchObject({ fx: 'create' });
  });

  it('creates polygon and polyline from clicked vertices, finishing on an explicit final click', () => {
    const polygon = run(initialModel, [
      createPtr('polygon', 'down', 10, 10),
      createPtr('polygon', 'up', 10, 10),
      createPtr('polygon', 'down', 80, 10),
      createPtr('polygon', 'up', 80, 10),
      createPtr('polygon', 'down', 40, 70),
      createPtr('polygon', 'up', 40, 70),
      createPtr('polygon', 'down', 40, 70, true),
    ]);
    const pg = polygon.byId[polygon.order[0]];
    expect(pg.geom).toEqual({
      t: 'poly',
      points: [
        { x: 10, y: 10 },
        { x: 80, y: 10 },
        { x: 40, y: 70 },
      ],
      closed: true,
      ends: undefined,
    });
    expect(pg.source).toBe('vector');
    expect(polygon.selected).toEqual([pg.id]);

    const polyline = run(initialModel, [
      createPtr('polyline', 'down', 20, 20),
      createPtr('polyline', 'up', 20, 20),
      createPtr('polyline', 'down', 90, 45),
      createPtr('polyline', 'up', 90, 45),
      createPtr('polyline', 'down', 90, 45, true),
    ]);
    const pl = polyline.byId[polyline.order[0]];
    expect(pl.geom).toEqual({
      t: 'poly',
      points: [
        { x: 20, y: 20 },
        { x: 90, y: 45 },
      ],
      closed: false,
      ends: { start: 'none', end: 'none' },
    });
  });

  it('previews an in-progress polygon with the hover point but commits only clicked vertices', () => {
    const drawing = run(initialModel, [
      createPtr('polygon', 'down', 10, 10),
      createPtr('polygon', 'down', 80, 10),
      createPtr('polygon', 'move', 40, 70),
    ]);
    const ghost = pageItems(drawing, PON).find((i) => i.source === 'ghost');
    expect(ghost?.geom).toEqual({
      t: 'poly',
      points: [
        { x: 10, y: 10 },
        { x: 80, y: 10 },
        { x: 40, y: 70 },
      ],
      closed: true,
      ends: undefined,
    });

    const committed = run(drawing, [
      createPtr('polygon', 'down', 80, 80),
      createPtr('polygon', 'down', 80, 80, true),
    ]);
    const geom = committed.byId[committed.order[0]].geom;
    expect(geom.t === 'poly' && geom.points).toEqual([
      { x: 10, y: 10 },
      { x: 80, y: 10 },
      { x: 80, y: 80 },
    ]);
  });

  it('exposes a committed-bounds rect anchor for finishing or cancelling an active poly creation draft', () => {
    let m = run(initialModel, [
      createPtr('polygon', 'down', 10, 10),
      createPtr('polygon', 'down', 80, 10),
    ]);
    expect(creationDraftAnchor(m)).toMatchObject({
      kind: 'poly',
      subtype: 'polygon',
      pon: PON,
      bounds: { x: 10, y: 10, width: 70, height: 0 },
      pointCount: 2,
      minPoints: 3,
      canFinish: false,
    });

    m = run(m, [createPtr('polygon', 'down', 40, 70)]);
    expect(creationDraftAnchor(m)).toMatchObject({
      bounds: { x: 10, y: 10, width: 70, height: 60 },
      pointCount: 3,
      canFinish: true,
    });

    m = update(m, { t: 'finishCreationDraft' })[0];
    expect(m.draft).toBeNull();
    expect(m.order).toHaveLength(1);
    expect(m.byId[m.order[0]].geom).toMatchObject({ t: 'poly', closed: true });
    expect(creationDraftAnchor(m)).toBeNull();
  });

  it('caretGeomFromAnchor: upright anchors stay byte-identical, rotated carry rot', () => {
    const upright = {
      glyphQuad: textQuadFromRect({ x: 90, y: 40, width: 10, height: 20 }),
      advance: 1 as const,
    };
    expect(caretGeomFromAnchor(upright)).toEqual({
      t: 'caret',
      rect: caretRectFromAnchor(upright),
    });

    // 90°-CCW column in content space: baseline runs UP-screen (lowerStart
    // (100,80) → lowerEnd (100,56)), ascent points LEFT toward x=88.
    const rotated = {
      glyphQuad: {
        upperStart: { x: 88, y: 80 },
        upperEnd: { x: 88, y: 56 },
        lowerStart: { x: 100, y: 80 },
        lowerEnd: { x: 100, y: 56 },
      },
      advance: 1 as const,
    };
    const geom = caretGeomFromAnchor(rotated);
    expect(geom.rot).toBeCloseTo(270, 5); // up-screen, CW-positive convention
    // ink = 12 → size 6; centre = trailing corner (100,56) + 3·ascent(−1,0).
    expect(geom.rect.x).toBeCloseTo(94, 5);
    expect(geom.rect.y).toBeCloseTo(53, 5);
    expect(geom.rect.width).toBe(6);
    expect(geom.rect.height).toBe(6);

    // RTL anchors place at the START corner; the tilt still follows the TEXT.
    const rtl = { glyphQuad: rotated.glyphQuad, advance: -1 as const };
    const rtlGeom = caretGeomFromAnchor(rtl);
    expect(rtlGeom.rot).toBeCloseTo(270, 5);
    expect(rtlGeom.rect.y).toBeCloseTo(77, 5); // centred off lowerStart (100,80)
  });

  it('a tilted caret draws oriented chrome (obb) with no rotate knob or handles', () => {
    // The 90°-CCW column anchor from above: caretGeomFromAnchor yields rot 270.
    const anchor = {
      glyphQuad: {
        upperStart: { x: 88, y: 80 },
        upperEnd: { x: 88, y: 56 },
        lowerStart: { x: 100, y: 80 },
        lowerEnd: { x: 100, y: 56 },
      },
      advance: 1 as const,
    };
    const [m] = update(initialModel, { t: 'createCaret', pon: PON, anchor });
    const a = m.byId[m.order[0]];
    expect(a.geom).toMatchObject({ t: 'caret', rot: expect.closeTo(270, 5) });

    // Create auto-selects; oriented chrome follows the GEOMETRY, not the caps…
    const c = chrome(m, PON);
    expect(c.find((n) => n.kind === 'obb')).toMatchObject({
      kind: 'obb',
      angle: expect.closeTo(270, 5),
    });
    expect(c.some((n) => n.kind === 'outline')).toBe(false);
    // …while every rotate/resize AFFORDANCE stays caps-gated off: no knob (the
    // hit-test knob branch shares the same gate), no handles.
    expect(selectionKnob(m, PON)).toBeNull();
    expect(c.some((n) => n.kind === 'handle')).toBe(false);
  });

  it('an upright caret keeps the plain axis-aligned outline', () => {
    const anchor = {
      glyphQuad: textQuadFromRect({ x: 90, y: 40, width: 10, height: 20 }),
      advance: 1 as const,
    };
    const [m] = update(initialModel, { t: 'createCaret', pon: PON, anchor });
    const c = chrome(m, PON);
    expect(c.some((n) => n.kind === 'obb')).toBe(false);
    expect(c.find((n) => n.kind === 'outline')).toBeDefined();
  });

  it('obbFromGeom/geomResetRotation treat the caret as a box-family geom', () => {
    const g: Geom = { t: 'caret', rect: { x: 94, y: 53, width: 6, height: 6 }, rot: 270 };
    const obb = obbFromGeom(g, 0)!;
    expect(obb.angle).toBe(270);
    // A SQUARE box under a quarter turn about its own centre lands on the same
    // four corner positions (relabeled) — an order-insensitive, convention-free
    // check that the caret takes the box branch (rect spun about its centre).
    const sorted = (pts: { x: number; y: number }[]) =>
      [...pts]
        .map((p) => ({ x: Math.round(p.x * 1e6) / 1e6, y: Math.round(p.y * 1e6) / 1e6 }))
        .sort((p, q) => p.x - q.x || p.y - q.y);
    expect(sorted(obb.corners)).toEqual(
      sorted([
        { x: 94, y: 53 },
        { x: 100, y: 53 },
        { x: 100, y: 59 },
        { x: 94, y: 59 },
      ]),
    );
    expect(geomResetRotation(g)).toEqual({ ...g, rot: 0 });
  });

  it('creates a caret at the trailing edge of the boundary glyph', () => {
    const anchor = {
      glyphQuad: textQuadFromRect({ x: 90, y: 40, width: 10, height: 20 }),
      advance: 1 as const,
    };
    expect(caretRectFromAnchor(anchor)).toEqual({ x: 95, y: 50, width: 10, height: 10 });

    const [m, fx] = update(initialModel, { t: 'createCaret', pon: PON, anchor });
    const a = m.byId[m.order[0]];
    expect(a).toMatchObject({
      subtype: 'caret',
      geom: { t: 'caret', rect: { x: 95, y: 50, width: 10, height: 10 } },
      source: 'vector',
    });
    expect(m.selected).toEqual([a.id]);
    expect(fx[0]).toMatchObject({ fx: 'create', id: a.id });
    expect(scene(pageItems(m, PON)[0])[0]).toMatchObject({
      kind: 'path',
      paint: { fill: initialModel.style.color, stroke: initialModel.style.color },
    });
  });

  it('creates Replace Text as a Caret primary + grouped StrikeOut subordinate', () => {
    let seeded = update(initialModel, {
      t: 'setDefaults',
      subtype: 'replace-text',
      patch: { color: '#f97316', opacity: 0.8 },
    })[0];
    const rects = [
      { x: 20, y: 40, width: 80, height: 20 },
      { x: 20, y: 65, width: 50, height: 20 },
    ];
    const [m, fx] = update(seeded, {
      t: 'createReplaceText',
      pon: PON,
      quads: rects.map(textQuadFromRect),
      anchor: { glyphQuad: textQuadFromRect(rects[1]), advance: 1 },
      preset: 'replace-text',
    });

    expect(m.order).toHaveLength(2);
    const caret = m.byId[m.order[0]];
    const strikeout = m.byId[m.order[1]];
    expect(caret).toMatchObject({
      subtype: 'caret',
      intent: 'replace',
      geom: { t: 'caret' },
      style: { color: '#f97316', opacity: 0.8 },
    });
    expect(strikeout).toMatchObject({
      subtype: 'strikeout',
      intent: 'strikeout-text-edit',
      geom: { t: 'quads' },
      irt: caret.id,
      group: caret.id,
      style: { color: '#f97316', opacity: 0.8 },
    });
    expect(m.selected).toEqual([caret.id, strikeout.id]);
    expect(fx).toEqual([{ fx: 'createGroup', primary: caret.id, members: [strikeout.id] }]);
  });

  it('keeps Replace Text relationships coherent when the Caret temp id reconciles', () => {
    const rect = { x: 20, y: 40, width: 80, height: 20 };
    let m = update(initialModel, {
      t: 'createReplaceText',
      pon: PON,
      quads: [textQuadFromRect(rect)],
      anchor: { glyphQuad: textQuadFromRect(rect), advance: 1 },
    })[0];
    const [caretTemp, strikeoutTemp] = m.order;
    const durableId = `obj:${PON}:42`;
    m = update(m, {
      t: 'created',
      tempId: caretTemp,
      id: durableId,
      ref: { kind: 'objectNumber', pageObjectNumber: PON, annotObjectNumber: 42 },
    })[0];
    expect(m.byId[strikeoutTemp]).toMatchObject({
      irt: durableId,
      group: durableId,
    });
    expect(m.selected).toEqual([durableId, strikeoutTemp]);
  });

  it('an UNFILLED rect is hit only on its stroke; a filled one anywhere inside', () => {
    const r: Geom = {
      t: 'rect',
      rect: { x: 100, y: 100, width: 100, height: 100 },
      ellipse: false,
    };
    expect(geomHit(r, { x: 150, y: 150 }, 4, /* filled */ false, 2)).toBe(false); // centre, unfilled → miss
    expect(geomHit(r, { x: 100, y: 150 }, 4, false, 2)).toBe(true); // on the left edge → hit
    expect(geomHit(r, { x: 150, y: 150 }, 4, /* filled */ true, 2)).toBe(true); // filled → centre hits
  });

  it('an UNFILLED circle is hit only near its outline', () => {
    const c: Geom = { t: 'rect', rect: { x: 0, y: 0, width: 100, height: 100 }, ellipse: true };
    expect(geomHit(c, { x: 50, y: 50 }, 4, false, 2)).toBe(false); // centre → miss
    expect(geomHit(c, { x: 100, y: 50 }, 4, false, 2)).toBe(true); // right vertex of the ellipse → hit
  });

  it('selection is sticky: a SELECTED annotation moves from anywhere in its bounds', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 200),
      createPtr('square', 'up', 200, 200),
    ]);
    const id = m.order[0]; // selected after create; unfilled
    // centre is inside bounds → since it's selected, a drag from the centre moves it
    m = run(m, [editPtr('down', 150, 150), editPtr('move', 180, 170), editPtr('up', 180, 170)]);
    expect(rectGeom(m.byId[id].geom)).toMatchObject({ x: 130, y: 120 });
  });

  it('a selected arrow is grabbable anywhere inside its outline box, not just on the thin stroke', () => {
    const arrow: Annot = {
      id: 'A1',
      ref: null,
      pon: PON,
      subtype: 'line',
      geom: {
        t: 'line',
        a: { x: 100, y: 100 },
        b: { x: 300, y: 200 },
        ends: { start: 'none', end: 'closed-arrow' },
      },
      style: {
        color: '#000000',
        interiorColor: null,
        strokeWidth: 6,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    const corner = { x: 290, y: 110 }; // inside the bbox, far from the diagonal stroke
    let m = update(initialModel, { t: 'loaded', annots: [arrow] })[0];
    // UNSELECTED → only the painted region (stroke + arrowhead) hits; the corner misses
    expect(hitTest(m, PON, corner, DEFAULT_CHROME_GEOM, 6).t).toBe('empty');
    // select it (click on the stroke at its midpoint)…
    m = run(m, [editPtr('down', 200, 150), editPtr('up', 200, 150)]);
    expect(m.selected).toEqual(['A1']);
    // …now the whole selection outline is grabbable — the grab area == the outline
    expect(hitTest(m, PON, corner, DEFAULT_CHROME_GEOM, 6)).toEqual({ t: 'annot', id: 'A1' });
    expect(selectionBounds(arrow.geom, 6)).toEqual(geomVisualBounds(arrow.geom, 6)); // line: outline == visual bounds
  });

  it('deselect clears the selection (click on empty)', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 160),
      createPtr('square', 'up', 200, 160),
    ]);
    expect(m.selected).toHaveLength(1);
    m = update(m, { t: 'deselect' })[0];
    expect(m.selected).toHaveLength(0);
  });

  it('marquee selects selectable annotations intersecting the dragged box', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 10, 10),
      createPtr('square', 'move', 60, 60),
      createPtr('square', 'up', 60, 60),
      createPtr('circle', 'down', 120, 120),
      createPtr('circle', 'move', 160, 160),
      createPtr('circle', 'up', 160, 160),
      createPtr('square', 'down', 300, 300),
      createPtr('square', 'move', 340, 340),
      createPtr('square', 'up', 340, 340),
    ]);

    m = run(m, [
      marqueePtr('down', 0, 0),
      marqueePtr('move', 180, 180),
      marqueePtr('up', 180, 180),
    ]);

    expect(m.selected).toEqual([m.order[0], m.order[1]]);
    expect(m.draft).toBeNull();
  });

  it('shift-marquee toggles hits against the current selection', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 10, 10),
      createPtr('square', 'move', 60, 60),
      createPtr('square', 'up', 60, 60),
      createPtr('circle', 'down', 120, 120),
      createPtr('circle', 'move', 160, 160),
      createPtr('circle', 'up', 160, 160),
    ]);
    const [a, b] = m.order;
    expect(m.selected).toEqual([b]); // last created annotation stays selected

    m = run(m, [
      marqueePtr('down', 0, 0, true),
      marqueePtr('move', 80, 80, true),
      marqueePtr('up', 80, 80, true),
    ]);

    expect(m.selected).toEqual([b, a]);
  });

  it('marquee ignores INERT annotations (readOnly) but still takes locked ones', () => {
    const square = (id: string, flags: Annot['flags']): Annot => ({
      id,
      ref: null,
      pon: PON,
      subtype: 'square',
      geom: { t: 'rect', rect: { x: 10, y: 10, width: 50, height: 50 }, ellipse: false },
      style: initialModel.style,
      flags,
      source: 'vector',
    });
    // readOnly = no interaction at all (ISO 32000): the marquee skips it.
    let m = update(initialModel, {
      t: 'loaded',
      annots: [square('ro', { ...DRAWN_FLAGS, readOnly: true })],
    })[0];
    m = run(m, [marqueePtr('down', 0, 0), marqueePtr('move', 80, 80), marqueePtr('up', 80, 80)]);
    expect(m.selected).toEqual([]);

    // locked = frozen, NOT inert: it selects (so you can inspect/unlock it) —
    // it just won't move/resize/delete.
    m = update(initialModel, {
      t: 'loaded',
      annots: [square('lk', { ...DRAWN_FLAGS, locked: true })],
    })[0];
    m = run(m, [marqueePtr('down', 0, 0), marqueePtr('move', 80, 80), marqueePtr('up', 80, 80)]);
    expect(m.selected).toEqual(['lk']);
  });

  it('active marquee draft emits a marquee chrome node', () => {
    const m = run(initialModel, [marqueePtr('down', 10, 20), marqueePtr('move', 40, 60)]);
    expect(chrome(m, PON)).toContainEqual({
      kind: 'marquee',
      rect: { x: 10, y: 20, width: 30, height: 40 },
    });
  });

  it('resize from the SE handle keeps the NW corner', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 200),
      createPtr('square', 'up', 200, 200),
    ]);
    const id = m.order[0]; // SE handle at (200,200)
    m = run(m, [editPtr('down', 200, 200), editPtr('move', 260, 240), editPtr('up', 260, 240)]);
    expect(rectGeom(m.byId[id].geom)).toMatchObject({ x: 100, y: 100, width: 160, height: 140 });
  });

  it('cursorAt: resize cursor on a handle, move over a selected body', () => {
    const m = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 200),
      createPtr('square', 'up', 200, 200),
    ]);
    expect(cursorAt(m, PON, { x: 200, y: 200 }, DEFAULT_CHROME_GEOM, 6)).toBe('nwse-resize'); // SE handle
    expect(cursorAt(m, PON, { x: 150, y: 150 }, DEFAULT_CHROME_GEOM, 6)).toBe('move'); // selected body
    expect(cursorAt(m, PON, { x: 600, y: 600 }, DEFAULT_CHROME_GEOM, 6)).toBeNull(); // empty
  });

  it('view: a single selection emits 8 handles (carrying cursors)', () => {
    const m = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 180),
      createPtr('square', 'up', 200, 180),
    ]);
    expect(pageItems(m, PON)).toHaveLength(1);
    const c = chrome(m, PON);
    expect(c.filter((n) => n.kind === 'handle')).toHaveLength(8);
    expect(c.find((n) => n.kind === 'handle' && (n as { cursor: string }).cursor)).toBeTruthy();
  });

  it('pageItems hands the renderer the endings-aware box (geomVisualBounds), not the tight bounds', () => {
    const line: Annot = {
      id: 'L1',
      ref: null,
      pon: PON,
      subtype: 'line',
      geom: {
        t: 'line',
        a: { x: 10, y: 10 },
        b: { x: 90, y: 10 },
        ends: { start: 'none', end: 'closed-arrow' },
      },
      style: {
        color: '#000000',
        interiorColor: '#ff0000',
        strokeWidth: 3,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    const m = update(initialModel, { t: 'loaded', annots: [line] })[0];
    const it = pageItems(m, PON)[0];
    // the render box IS the same calculation that feeds the engine /Rect…
    expect(it.box).toEqual(geomVisualBounds(it.geom, it.style.strokeWidth));
    // …and it encloses the arrowhead + stroke, so it is strictly larger than the
    // tight geometry bounds (the cause of the old clipped/misplaced endings).
    const tight = geomBounds(it.geom);
    expect(it.box.width).toBeGreaterThan(tight.width);
    expect(it.box.height).toBeGreaterThan(tight.height);
  });

  it('the selection outline wraps the line endings; shape outlines stay tight (handles on the box)', () => {
    const line: Annot = {
      id: 'L1',
      ref: null,
      pon: PON,
      subtype: 'line',
      geom: {
        t: 'line',
        a: { x: 60, y: 75 },
        b: { x: 545, y: 235 },
        ends: { start: 'none', end: 'open-arrow' },
      },
      style: {
        color: '#000000',
        interiorColor: null,
        strokeWidth: 8,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    const m = update(initialModel, { t: 'loaded', annots: [line] })[0];
    const sel = update(m, editPtr('down', 60, 75))[0]; // select the line
    const outlineRect = (mm: Model) => {
      const n = chrome(mm, PON).find((x) => x.kind === 'outline');
      return n && n.kind === 'outline' ? n.rect : null;
    };
    const lineOutline = outlineRect(sel)!;
    const tight = geomBounds(sel.byId['L1'].geom);
    expect(lineOutline).toEqual(geomVisualBounds(sel.byId['L1'].geom, 8));
    expect(lineOutline.width).toBeGreaterThan(tight.width);
    expect(lineOutline.height).toBeGreaterThan(tight.height);

    // a square: outline stays tight, so its 8 handles land on the outline corners
    const sq = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 200),
      createPtr('square', 'up', 200, 200),
    ]);
    expect(outlineRect(sq)).toMatchObject({ x: 100, y: 100, width: 100, height: 100 });
  });

  it('the arrowhead is clickable, not just the stroke', () => {
    const g: Geom = {
      t: 'line',
      a: { x: 60, y: 75 },
      b: { x: 545, y: 235 },
      ends: { start: 'none', end: 'open-arrow' },
    };
    const sw = 8;
    const onArrow = { x: 510, y: 242 }; // on the lower wing, ~19px off the a→b stroke band
    expect(geomHit(g, onArrow, 6, /* filled */ false, sw)).toBe(true);
    // the hit comes from the ENDING, not the line: with no endings that point misses
    const noEnds: Geom = { t: 'line', a: g.a, b: g.b };
    expect(geomHit(noEnds, onArrow, 6, false, sw)).toBe(false);
    // and a point off both the line and the arrowhead still misses
    expect(geomHit(g, { x: 300, y: 360 }, 6, false, sw)).toBe(false);
  });

  it('geomScene fills by closed-ness: closed arrow → closed poly, open arrow → open poly', () => {
    const line = (end: 'closed-arrow' | 'open-arrow'): Geom => ({
      t: 'line',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      ends: { start: 'none', end },
    });
    const closed = geomScene(line('closed-arrow'), 2);
    expect(closed.some((n) => n.kind === 'poly' && n.closed)).toBe(true); // filled head
    const open = geomScene(line('open-arrow'), 2);
    expect(open.some((n) => n.kind === 'poly' && !n.closed)).toBe(true); // stroke-only head
    expect(open.some((n) => n.kind === 'poly' && n.closed)).toBe(false);
  });

  it('PDF↔content round-trips through a non-zero crop', () => {
    const crop = { left: 10, bottom: 20, right: 600, top: 800 };
    const pdf = { left: 100, bottom: 300, right: 250, top: 420 };
    expect(contentToPdfRect(pdfToContentRect(pdf, crop), crop)).toMatchObject(pdf);
    const pt = { x: 123, y: 456 };
    expect(contentToPdfPoint(pdfToContentPoint(pt, crop), crop)).toMatchObject(pt);
  });

  it('a shape rect is its OUTER box: visual bounds equal the box, the drawn path insets by half the stroke', () => {
    const g: Geom = { t: 'rect', rect: { x: 100, y: 100, width: 80, height: 60 }, ellipse: false };
    // the box never grows with the stroke — the stroke lives inside it
    expect(geomVisualBounds(g, 20)).toEqual(g.rect);
    const [node] = geomScene(g, 20);
    expect(node).toMatchObject({ kind: 'rect', rect: { x: 110, y: 110, width: 60, height: 40 } });
  });

  it('hit-testing follows the inset stroke: a thick stroke is clickable on its inner edge, the phantom band outside the box shrinks', () => {
    const g: Geom = {
      t: 'rect',
      rect: { x: 100, y: 100, width: 100, height: 100 },
      ellipse: false,
    };
    const sw = 24;
    const margin = 4;
    // the stroke is drawn inside the box, centred ~12px in; its inner edge must hit
    expect(geomHit(g, { x: 122, y: 150 }, margin, false, sw)).toBe(true);
    // a point well outside the box (past the margin) must miss — no phantom band
    // where the stroke used to straddle the edge
    expect(geomHit(g, { x: 90, y: 150 }, margin, false, sw)).toBe(false);
    // and the box edge itself is still on the (outer half of the) stroke → hits
    expect(geomHit(g, { x: 100, y: 150 }, margin, false, sw)).toBe(true);
  });

  it('a cloudy border insets its scallops within g.rect (the outer box); too-small falls back to a plain outline', () => {
    const box = { x: 100, y: 100, width: 120, height: 90 };
    const g: Geom = { t: 'rect', rect: box, ellipse: false };
    const [node] = geomScene(g, 2, { kind: 'cloudy', intensity: 2 });
    expect(node.kind).toBe('path');
    const d = node.kind === 'path' ? node.d : '';
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const eps = 0.5;
    // g.rect is the OUTER box; the scallops stay within it (outline is tight, like solid)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(box.x - eps);
    expect(Math.max(...xs)).toBeLessThanOrEqual(box.x + box.width + eps);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(box.y - eps);
    expect(Math.max(...ys)).toBeLessThanOrEqual(box.y + box.height + eps);
    // a box too small to hold the scallops → plain rect node, never an inverted cloud
    const tiny: Geom = { t: 'rect', rect: { x: 0, y: 0, width: 4, height: 4 }, ellipse: false };
    expect(geomScene(tiny, 2, { kind: 'cloudy', intensity: 2 })[0].kind).toBe('rect');
  });

  it('shapeRectFor stores the OUTER box for a cloudy shape (dragged + extent), the dragged box for solid', () => {
    const dragged = { x: 50, y: 50, width: 40, height: 30 };
    const solid: Style = {
      color: '#000000',
      interiorColor: null,
      strokeWidth: 2,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    };
    expect(shapeRectFor(dragged, false, solid)).toEqual(dragged);
    const e = cloudyBorderExtent(2, 2, false);
    expect(
      shapeRectFor(dragged, false, { ...solid, border: { kind: 'cloudy', intensity: 2 } }),
    ).toEqual({
      x: 50 - e,
      y: 50 - e,
      width: 40 + 2 * e,
      height: 30 + 2 * e,
    });
  });

  it('cloudyBorderExtent grows with intensity and stroke; circle scallops are larger than square', () => {
    expect(cloudyBorderExtent(2, 4, false)).toBeGreaterThan(cloudyBorderExtent(1, 4, false));
    expect(cloudyBorderExtent(1, 10, false)).toBeGreaterThan(cloudyBorderExtent(1, 4, false));
    expect(cloudyBorderExtent(1, 4, true)).toBeGreaterThan(cloudyBorderExtent(1, 4, false));
  });

  it('capabilities are orthogonal, not one binary: shapes resize, lines vertex-edit, markup neither', () => {
    expect(capsFor('square')).toMatchObject({
      selectable: true,
      movable: true,
      resizable: true,
      vertexEditable: false,
    });
    expect(capsFor('line')).toMatchObject({
      selectable: true,
      movable: true,
      resizable: false,
      vertexEditable: true,
    });
    expect(capsFor('polygon')).toMatchObject({ selectable: true, vertexEditable: true });
    // markup is selectable but ANCHORED — recolor/delete, never move/resize.
    expect(capsFor('highlight')).toMatchObject({
      selectable: true,
      anchored: true,
      movable: false,
      resizable: false,
      vertexEditable: false,
    });
    expect(capsFor('totally-unknown').selectable).toBe(false); // unknown → read-only
  });

  it('a markup preview renders as a live ghost via pageItems, and clears', () => {
    const m = update(initialModel, {
      t: 'setMarkupPreview',
      subtype: 'highlight',
      quadsByPage: { [PON]: [textQuadFromRect({ x: 10, y: 10, width: 80, height: 12 })] },
    })[0];
    const ghost = pageItems(m, PON).find((i) => i.source === 'ghost');
    expect(ghost?.subtype).toBe('highlight');
    expect(ghost?.geom.t).toBe('quads');
    const cleared = update(m, { t: 'clearMarkupPreview' })[0];
    expect(pageItems(cleared, PON).some((i) => i.source === 'ghost')).toBe(false);
  });

  it('scene() paints markup per subtype in the core (no framework logic): highlight fills+multiply, squiggly strokes a path', () => {
    const quads: Geom = {
      t: 'quads',
      quads: [
        textQuadFromRect({ x: 0, y: 0, width: 100, height: 12 }),
      ],
    };
    const mk = (subtype: string): RenderItem => ({
      id: 'x',
      ref: null,
      subtype,
      geom: quads,
      box: { x: 0, y: 0, width: 100, height: 12 },
      style: {
        color: '#ffd400',
        interiorColor: '#ffd400',
        strokeWidth: 0,
        opacity: 1,
        blendMode: subtype === 'highlight' ? 'multiply' : 'normal',
        border: { kind: 'solid' },
      },
      source: 'vector',
      selected: false,
    });
    const hi = scene(mk('highlight'));
    expect(hi[0]).toMatchObject({ kind: 'poly', closed: true, paint: { fill: '#ffd400', blend: 'multiply' } });
    const sq = scene(mk('squiggly'));
    expect(sq[0].kind).toBe('path');
    expect(sq[0].paint.stroke).toBe('#ffd400');
    expect(sq[0].paint.fill).toBeUndefined(); // stroke-only, no fill
    const screened = scene({
      ...mk('squiggly'),
      style: { ...mk('squiggly').style, blendMode: 'screen' },
    });
    expect(screened[0].paint.blend).toBe('screen');
  });

  it('scene() paints a shape uniformly: a closed node carries fill + stroke + width', () => {
    const item: RenderItem = {
      id: 's',
      ref: null,
      subtype: 'square',
      geom: { t: 'rect', rect: { x: 0, y: 0, width: 50, height: 40 }, ellipse: false },
      box: { x: 0, y: 0, width: 50, height: 40 },
      style: {
        color: '#000000',
        interiorColor: '#eeeeee',
        strokeWidth: 3,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      source: 'vector',
      selected: false,
    };
    expect(scene(item)[0]).toMatchObject({
      kind: 'rect',
      paint: { fill: '#eeeeee', stroke: '#000000', width: 3 },
    });
    expect(scene(item)[0].paint.cap).toBeUndefined(); // shapes stay sharp (only ink rounds)
    expect(scene(item)[0].paint.join).toBeUndefined(); // solid border → default miter joins
  });

  it('scene() strokes a cloudy border with ROUND joins (PDFium `1 j` parity) — polygon and box alike', () => {
    // The curl tails reverse direction by design; a miter join spikes at every
    // seam. PDFium bakes cloudy APs with `1 j`, so the live paint must match.
    const cloudyStyle = {
      color: '#e5484d',
      interiorColor: null,
      strokeWidth: 4,
      opacity: 1,
      blendMode: 'normal' as const,
      border: { kind: 'cloudy' as const, intensity: 2 },
    };
    const polygon: RenderItem = {
      id: 'p',
      ref: null,
      subtype: 'polygon',
      geom: {
        t: 'poly',
        points: [
          { x: 20, y: 20 },
          { x: 180, y: 40 },
          { x: 100, y: 160 },
        ],
        closed: true,
      },
      box: { x: 0, y: 0, width: 200, height: 180 },
      style: cloudyStyle,
      source: 'vector',
      selected: false,
    };
    const polyNodes = scene(polygon);
    expect(polyNodes).toHaveLength(1); // ONE scalloped ring replaces the plain poly
    expect(polyNodes[0].kind).toBe('path');
    expect(polyNodes[0].paint.join).toBe('round');

    const square: RenderItem = {
      id: 's',
      ref: null,
      subtype: 'square',
      geom: { t: 'rect', rect: { x: 0, y: 0, width: 120, height: 100 }, ellipse: false },
      box: { x: 0, y: 0, width: 120, height: 100 },
      style: cloudyStyle,
      source: 'vector',
      selected: false,
    };
    const sqNodes = scene(square);
    expect(sqNodes[0].kind).toBe('path');
    expect(sqNodes[0].paint.join).toBe('round');
  });

  it('freehand creates an ink annotation from a pointer drag; scene paints it stroke-only', () => {
    const ink = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
      t: 'createPointer',
      phase,
      subtype: 'ink',
      in: { pon: PON, point: { x, y }, shift: false },
    });
    const m = run(initialModel, [
      ink('down', 10, 10),
      ink('move', 25, 20),
      ink('move', 40, 30),
      ink('up', 40, 30),
    ]);
    const a = m.byId[m.order[0]];
    expect(a.geom).toMatchObject({ t: 'ink' });
    expect(a.geom.t === 'ink' && a.geom.strokes[0].length).toBe(3);
    expect(a.source).toBe('vector');
    // a short tap (no travel) is discarded, not committed
    const tap = run(initialModel, [ink('down', 5, 5), ink('up', 5, 5)]);
    expect(tap.order).toHaveLength(0);
    // scene: each stroke is a stroke-only open polyline, with ROUND caps (pen ends)
    const node = scene(pageItems(m, PON)[0])[0];
    expect(node.kind).toBe('poly');
    expect(node.paint.fill).toBeUndefined();
    expect(node.paint.stroke).toBe(a.style.color);
    expect(node.paint.cap).toBe('round');
  });

  it('groups deferred ink strokes, straightens each stroke, and commits one intent-bearing annotation', () => {
    const options = { deviationThreshold: 0.15, axisSnapDegrees: 15 };
    let m = update(initialModel, {
      t: 'setDefaults',
      subtype: 'ink-highlight',
      patch: { color: '#ffcd45', strokeWidth: 14, blendMode: 'multiply' },
    })[0];
    const ink = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
      t: 'createPointer',
      phase,
      subtype: 'ink',
      preset: 'ink-highlight',
      intent: 'ink-highlight',
      deferInkCommit: true,
      straightenInk: options,
      in: { pon: PON, point: { x, y }, shift: false },
    });
    m = run(m, [
      ink('down', 10, 10),
      ink('move', 30, 11),
      ink('move', 50, 10),
      ink('up', 50, 10),
      ink('down', 10, 30),
      ink('move', 30, 31),
      ink('move', 50, 30),
      ink('up', 50, 30),
    ]);
    expect(m.order).toHaveLength(0);
    expect(m.draft?.g === 'create-ink' && m.draft.strokes).toHaveLength(2);

    m = update(m, { t: 'finishInkDraft' })[0];
    expect(m.order).toHaveLength(1);
    const annotation = m.byId[m.order[0]];
    expect(annotation.intent).toBe('ink-highlight');
    expect(annotation.style.blendMode).toBe('multiply');
    expect(annotation.geom.t).toBe('ink');
    if (annotation.geom.t === 'ink') {
      expect(annotation.geom.strokes).toHaveLength(2);
      expect(annotation.geom.strokes[0]).toHaveLength(2);
      expect(annotation.geom.strokes[0][0].y).toBeCloseTo(annotation.geom.strokes[0][1].y);
    }
  });

  it('a selected ink wraps its stroke: the outline expands by the stroke, not tight to the centerline', () => {
    const ink: Annot = {
      id: 'I1',
      ref: null,
      pon: PON,
      subtype: 'ink',
      geom: {
        t: 'ink',
        strokes: [
          [
            { x: 20, y: 20 },
            { x: 80, y: 60 },
          ],
        ],
      },
      style: {
        color: '#1d4ed8',
        interiorColor: null,
        strokeWidth: 10,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    let m = update(initialModel, { t: 'loaded', annots: [ink] })[0];
    m = update(m, editPtr('down', 50, 40))[0]; // click on the stroke → selects it
    const outline = chrome(m, PON).find((n) => n.kind === 'outline');
    // tight centerline bounds are 60×40; the stroke (width 10) expands them by 5/side → 70×50
    expect(outline?.kind === 'outline' && outline.rect.width).toBe(70);
    expect(outline?.kind === 'outline' && outline.rect.height).toBe(50);
  });

  it('the draft ghost previews the tool defaults, not the bare base style', () => {
    let m = update(initialModel, {
      t: 'setDefaults',
      subtype: 'square',
      patch: { color: '#123456' },
    })[0];
    // mid-draw (down + move, no up yet) → the ghost is live
    m = run(m, [createPtr('square', 'down', 10, 10), createPtr('square', 'move', 60, 60)]);
    const ghost = pageItems(m, PON).find((i) => i.source === 'ghost');
    expect(ghost?.style.color).toBe('#123456'); // tool default, not initialStyle red
  });

  it('restyling a selection updates the annotation but never the base default', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 10, 10),
      createPtr('square', 'move', 60, 60),
      createPtr('square', 'up', 60, 60),
    ]);
    const baseBefore = m.style.color;
    m = update(m, { t: 'setProps', patch: { color: '#00ff00' } })[0];
    expect(m.byId[m.order[0]].style.color).toBe('#00ff00'); // the selected square changed
    expect(m.style.color).toBe(baseBefore); // …the base/default is untouched
  });

  it('setProps routes each key by kind: a mixed selection takes what applies', () => {
    // a square + a line, both selected
    let m = run(initialModel, [
      createPtr('square', 'down', 10, 10),
      createPtr('square', 'move', 60, 60),
      createPtr('square', 'up', 60, 60),
      createPtr('line', 'down', 100, 10),
      createPtr('line', 'move', 160, 60),
      createPtr('line', 'up', 160, 60),
    ]);
    const [sq, ln] = m.order;
    m = { ...m, selected: [sq, ln] };
    const [next, fx] = update(m, {
      t: 'setProps',
      patch: { strokeWidth: 7, lineEndings: { end: 'closed-arrow' } },
    });
    // strokeWidth applies to both; endings only to the line (the square ignores it)
    expect(next.byId[sq].style.strokeWidth).toBe(7);
    expect(next.byId[ln].style.strokeWidth).toBe(7);
    const lnGeom = next.byId[ln].geom;
    expect(lnGeom.t === 'line' && lnGeom.ends?.end).toBe('closed-arrow');
    expect(fx).toEqual([
      { fx: 'patch', id: sq, scope: { kind: 'props', keys: ['strokeWidth', 'lineEndings'] } },
      { fx: 'patch', id: ln, scope: { kind: 'props', keys: ['strokeWidth', 'lineEndings'] } },
    ]);
  });

  it('setProps skips locked annotations and keys the kind does not declare', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 10, 10),
      createPtr('square', 'move', 60, 60),
      createPtr('square', 'up', 60, 60),
    ]);
    const id = m.order[0];
    m = {
      ...m,
      byId: { ...m.byId, [id]: { ...m.byId[id], flags: { ...DRAWN_FLAGS, locked: true } } },
    };
    const [locked, lockedFx] = update(m, { t: 'setProps', patch: { color: '#00ff00' } });
    expect(locked.byId[id].style.color).not.toBe('#00ff00');
    expect(lockedFx).toEqual([]);
    // a font key on a square: not declared → no change, no effect
    m = { ...m, byId: { ...m.byId, [id]: { ...m.byId[id], flags: DRAWN_FLAGS } } };
    const [next, fx] = update(m, { t: 'setProps', patch: { fontSize: 24 } });
    expect(next).toBe(m);
    expect(fx).toEqual([]);
  });

  it('a drawn free-text box carries the tool font defaults from birth', () => {
    let m = update(initialModel, {
      t: 'setDefaults',
      subtype: 'free-text',
      patch: { fontSize: 22, fontColor: '#112233' },
    })[0];
    m = run(m, [
      createPtr('free-text', 'down', 10, 10),
      createPtr('free-text', 'up', 10, 10), // a click → default-size box
    ]);
    const a = m.byId[m.order[0]];
    expect(a.text?.fontSize).toBe(22);
    expect(a.text?.fontColor).toBe('#112233');
    // …and setProps edits it (free-text declares font keys)
    const [next] = update(m, { t: 'setProps', patch: { textAlign: 'center' } });
    expect(next.byId[m.order[0]].text?.textAlign).toBe('center');
  });

  it('markup is selectable but anchored: it selects, shows a bare outline (no handles), and will not move', () => {
    const hl: Annot = {
      id: 'H1',
      ref: null,
      pon: PON,
      subtype: 'highlight',
      geom: {
        t: 'quads',
        quads: [
          textQuadFromRect({ x: 10, y: 10, width: 80, height: 20 }),
        ],
      },
      style: {
        color: '#ffcc00',
        interiorColor: '#ffcc00',
        strokeWidth: 0,
        opacity: 1,
        blendMode: 'multiply',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'baked',
    };
    const m0 = update(initialModel, { t: 'loaded', annots: [hl] })[0];
    // clicking the markup selects it…
    expect(hitTest(m0, PON, { x: 50, y: 20 }, DEFAULT_CHROME_GEOM, 6)).toEqual({
      t: 'annot',
      id: 'H1',
    });
    const m1 = update(m0, editPtr('down', 50, 20))[0];
    expect(m1.selected).toEqual(['H1']);
    // …but no move gesture is armed (anchored), and chrome is a bare outline.
    expect(m1.draft).toBeNull();
    const c = chrome(m1, PON);
    expect(c.filter((n) => n.kind === 'handle')).toHaveLength(0);
    expect(c.some((n) => n.kind === 'outline')).toBe(true);
  });

  // ── group annotations ──────────────────────────────────────────────────────
  const sq = (id: string, x: number, group?: string): Annot => ({
    id,
    ref: null,
    pon: PON,
    subtype: 'square',
    geom: { t: 'rect', rect: { x, y: x, width: 40, height: 40 }, ellipse: false },
    style: {
      color: '#000000',
      interiorColor: '#eeeeee', // filled → hittable anywhere inside
      strokeWidth: 2,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    flags: DRAWN_FLAGS,
    source: 'vector',
    ...(group ? { group } : {}),
  });
  // A group: primary P, plus two subordinates pointing at it via `group: 'P'`.
  const grouped = (): Model =>
    update(initialModel, {
      t: 'loaded',
      annots: [sq('P', 100), sq('C1', 200, 'P'), sq('C2', 300, 'P')],
    })[0];

  it('groupMembers/groupKeyOf resolve a primary and its subordinates from either end', () => {
    const m = grouped();
    // from a subordinate: its `group` field is the key (the primary id)
    expect(groupKeyOf(m, 'C1')).toBe('P');
    // from the primary: it is the target of subordinates → key is its own id
    expect(groupKeyOf(m, 'P')).toBe('P');
    // membership is the same set whichever member you ask about (primary first)
    expect(groupMembers(m, 'C2')).toEqual(['P', 'C1', 'C2']);
    expect(groupMembers(m, 'P')).toEqual(['P', 'C1', 'C2']);
  });

  it('an ungrouped annotation is its own (singleton) group', () => {
    const m = update(initialModel, { t: 'loaded', annots: [sq('S', 10)] })[0];
    expect(groupKeyOf(m, 'S')).toBeNull();
    expect(groupMembers(m, 'S')).toEqual(['S']);
    expect(expandGroups(m, ['S'])).toEqual(['S']);
  });

  it('clicking one member selects the WHOLE group', () => {
    let m = grouped();
    m = update(m, editPtr('down', 215, 215))[0]; // inside C1
    expect(m.selected).toEqual(['P', 'C1', 'C2']);
    // a move gesture is armed across all members (every square is movable)
    expect(m.draft).toMatchObject({ g: 'move', ids: ['P', 'C1', 'C2'] });
  });

  it('dragging one member moves every member of the group together', () => {
    let m = grouped();
    m = run(m, [editPtr('down', 115, 115), editPtr('move', 135, 145), editPtr('up', 135, 145)]);
    // all three translate by the same delta (+20, +30)
    expect(rectGeom(m.byId['P'].geom)).toMatchObject({ x: 120, y: 130 });
    expect(rectGeom(m.byId['C1'].geom)).toMatchObject({ x: 220, y: 230 });
    expect(rectGeom(m.byId['C2'].geom)).toMatchObject({ x: 320, y: 330 });
  });

  it('deleting with a member selected removes the whole group', () => {
    let m = grouped();
    m = update(m, editPtr('down', 215, 215))[0]; // selects the group
    const [next, fx] = update(m, { t: 'delete' });
    expect(next.order).toEqual([]);
    expect(next.selected).toEqual([]);
    // no engine effects here (these fixtures have no refs), but the store is cleared
    expect(fx).toEqual([]);
  });

  it('shift-clicking a member toggles the entire group out of the selection', () => {
    let m = grouped();
    m = update(m, editPtr('down', 215, 215))[0]; // group selected
    expect(m.selected).toEqual(['P', 'C1', 'C2']);
    m = update(m, editPtr('down', 315, 315, /* shift */ true))[0]; // shift-click C2
    expect(m.selected).toEqual([]); // the whole group dropped, not just C2
  });

  it('a marquee that touches one member takes the whole group', () => {
    let m = grouped();
    // box covers only C2 (around x=300..340); P and C1 sit outside it
    m = run(m, [
      marqueePtr('down', 295, 295),
      marqueePtr('move', 345, 345),
      marqueePtr('up', 345, 345),
    ]);
    expect(m.selected).toEqual(['P', 'C1', 'C2']);
  });

  it('the gap inside a selected group is grabbable: a drag there moves every member', () => {
    // P=(100,100), C1=(200,200), C2=(300,300), each 40×40 → (170,170) sits inside
    // the union box but in the empty gap between members (no member covers it).
    let m = grouped();
    m = run(m, [editPtr('down', 215, 215), editPtr('up', 215, 215)]); // select the whole group
    expect(m.selected).toEqual(['P', 'C1', 'C2']);
    // the gap is no longer "empty" — it hits a selected member so the group can drag
    expect(hitTest(m, PON, { x: 170, y: 170 }, DEFAULT_CHROME_GEOM, 6).t).toBe('annot');
    m = run(m, [editPtr('down', 170, 170), editPtr('move', 190, 200), editPtr('up', 190, 200)]);
    // every member translated by the same delta (+20, +30)
    expect(rectGeom(m.byId['P'].geom)).toMatchObject({ x: 120, y: 130 });
    expect(rectGeom(m.byId['C1'].geom)).toMatchObject({ x: 220, y: 230 });
    expect(rectGeom(m.byId['C2'].geom)).toMatchObject({ x: 320, y: 330 });
  });

  it('the gap inside a multi-selection shows the move cursor; outside the union still clears', () => {
    let m = grouped();
    m = run(m, [editPtr('down', 215, 215), editPtr('up', 215, 215)]); // group selected
    expect(cursorAt(m, PON, { x: 170, y: 170 }, DEFAULT_CHROME_GEOM, 6)).toBe('move'); // gap → move
    // a click well outside the union box is still empty (so it deselects)
    expect(hitTest(m, PON, { x: 500, y: 500 }, DEFAULT_CHROME_GEOM, 6).t).toBe('empty');
    expect(cursorAt(m, PON, { x: 500, y: 500 }, DEFAULT_CHROME_GEOM, 6)).toBeNull();
  });

  it('the union grab needs 2+ movable members: a lone selection leaves its gap empty', () => {
    // a single selected square: a point outside its own bounds is still empty
    // (no union fallback), so single-selection behaviour is unchanged.
    let m = update(initialModel, { t: 'loaded', annots: [sq('S', 100)] })[0];
    m = run(m, [editPtr('down', 115, 115), editPtr('up', 115, 115)]);
    expect(m.selected).toEqual(['S']);
    expect(hitTest(m, PON, { x: 300, y: 300 }, DEFAULT_CHROME_GEOM, 6).t).toBe('empty');
  });

  it('markups always sit beneath other annotations, regardless of creation order', () => {
    const square: Annot = {
      id: 'S1',
      ref: null,
      pon: PON,
      subtype: 'square',
      geom: { t: 'rect', rect: { x: 0, y: 0, width: 100, height: 100 }, ellipse: false },
      style: {
        color: '#000000',
        interiorColor: '#eeeeee', // filled → hittable anywhere inside
        strokeWidth: 2,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    const highlight: Annot = {
      id: 'H1',
      ref: null,
      pon: PON,
      subtype: 'highlight',
      geom: {
        t: 'quads',
        quads: [
          textQuadFromRect({ x: 0, y: 0, width: 100, height: 100 }),
        ],
      },
      style: {
        color: '#ffcc00',
        interiorColor: '#ffcc00',
        strokeWidth: 0,
        opacity: 1,
        blendMode: 'multiply',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'vector',
    };
    // square added FIRST, highlight SECOND — naive creation order would paint the
    // highlight on top.
    const m = update(initialModel, { t: 'loaded', annots: [square, highlight] })[0];
    // pageItems paints back→front: the markup comes first (beneath), the square last (on top).
    expect(pageItems(m, PON).map((i) => i.id)).toEqual(['H1', 'S1']);
    // and the overlap hit-tests to the square (the top-most painted), not the highlight.
    expect(hitTest(m, PON, { x: 50, y: 50 }, DEFAULT_CHROME_GEOM, 6)).toEqual({
      t: 'annot',
      id: 'S1',
    });
  });
});

describe('annotation-core callout', () => {
  const calloutPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
    t: 'createPointer',
    phase,
    subtype: 'free-text-callout',
    in: { pon: PON, point: { x, y }, shift: false },
  });
  // A committed callout geom for the pure-geometry tests: box to the right of an
  // off-box tip, with an elbow between them.
  const calloutGeom = (): Extract<Geom, { t: 'text' }> => ({
    t: 'text',
    rect: { x: 200, y: 100, width: 120, height: 40 },
    callout: { tip: { x: 40, y: 60 }, knee: { x: 120, y: 120 }, ending: 'open-arrow' },
  });

  it('calloutConnection picks the box edge the reference point faces', () => {
    const box = { x: 100, y: 100, width: 100, height: 60 }; // centre (150, 130)
    // ref to the RIGHT (dx dominates, positive) → right-edge midpoint
    expect(calloutConnection(box, { x: 400, y: 130 })).toEqual({ x: 200, y: 130 });
    // ref to the LEFT → left-edge midpoint
    expect(calloutConnection(box, { x: -50, y: 130 })).toEqual({ x: 100, y: 130 });
    // ref ABOVE (dy dominates, negative) → top-edge midpoint
    expect(calloutConnection(box, { x: 150, y: -20 })).toEqual({ x: 150, y: 100 });
    // ref BELOW → bottom-edge midpoint
    expect(calloutConnection(box, { x: 150, y: 300 })).toEqual({ x: 150, y: 160 });
  });

  it('calloutLinePoints is [tip, knee, derived-conn]; conn rides the box, never stored', () => {
    const g = calloutGeom();
    const pts = calloutLinePoints(g);
    expect(pts).toHaveLength(3);
    expect(pts[0]).toEqual({ x: 40, y: 60 }); // tip
    expect(pts[1]).toEqual({ x: 120, y: 120 }); // knee
    // knee is left of + below the box centre → left-edge midpoint of the box
    expect(pts[2]).toEqual({ x: 200, y: 120 });
  });

  it('geomVisualBounds wraps the box, the leader, AND the arrow at the tip', () => {
    const g = calloutGeom();
    const b = geomVisualBounds(g, 2);
    // the tip (x=40) sits far left of the box (x=200): the overall bounds reach it
    expect(b.x).toBeLessThanOrEqual(40);
    expect(b.y).toBeLessThanOrEqual(60);
    // and still cover the right edge of the box (x=320)
    expect(b.x + b.width).toBeGreaterThanOrEqual(320);
    // a plain text box (no callout) is just its rect
    expect(geomVisualBounds({ t: 'text', rect: { x: 0, y: 0, width: 10, height: 10 } }, 2)).toEqual(
      {
        x: 0,
        y: 0,
        width: 10,
        height: 10,
      },
    );
  });

  it('geomHandles returns the 8 box handles PLUS the leader tip + knee', () => {
    const ids = geomHandles(calloutGeom()).map((h) => h.id);
    expect(ids).toContain('nw');
    expect(ids).toContain('se');
    expect(ids).toContain('callout-tip');
    expect(ids).toContain('callout-knee');
    expect(ids).toHaveLength(10);
    // a knee-less (2-point) callout exposes only the tip
    const noKnee = geomHandles({
      t: 'text',
      rect: { x: 0, y: 0, width: 50, height: 20 },
      callout: { tip: { x: -20, y: 10 }, ending: 'open-arrow' },
    }).map((h) => h.id);
    expect(noKnee).toContain('callout-tip');
    expect(noKnee).not.toContain('callout-knee');
  });

  it('geomTranslate shifts the box, the tip, AND the knee together', () => {
    const g = geomTranslate(calloutGeom(), { x: 10, y: -5 });
    if (g.t !== 'text' || !g.callout) throw new Error('expected callout');
    expect(g.rect).toMatchObject({ x: 210, y: 95 });
    expect(g.callout.tip).toEqual({ x: 50, y: 55 });
    expect(g.callout.knee).toEqual({ x: 130, y: 115 });
  });

  it('geomDragHandle edits the tip / knee / box independently (conn re-derives)', () => {
    const tip = geomDragHandle(calloutGeom(), 'callout-tip', { x: 5, y: 5 });
    expect(tip.t === 'text' && tip.callout?.tip).toEqual({ x: 5, y: 5 });
    const knee = geomDragHandle(calloutGeom(), 'callout-knee', { x: 90, y: 90 });
    expect(knee.t === 'text' && knee.callout?.knee).toEqual({ x: 90, y: 90 });
    // a rect handle resizes the box; the leader's connection point is never stored,
    // so it simply re-derives off the new box on the next read.
    const box = geomDragHandle(calloutGeom(), 'se', { x: 400, y: 300 });
    expect(box.t === 'text' && box.rect).toMatchObject({ x: 200, y: 100, width: 200, height: 200 });
  });

  it('geomScene emits the leader polyline, the arrow node, and a stroke-only box border', () => {
    const nodes = geomScene(calloutGeom(), 1);
    const leader = nodes.find((n) => n.kind === 'poly' && !n.closed);
    expect(leader).toBeDefined();
    // the open leader carries [tip, knee, conn]
    expect(leader && leader.kind === 'poly' && leader.points).toHaveLength(3);
    // a box border rect is present when the stroke is visible
    expect(nodes.some((n) => n.kind === 'rect')).toBe(true);
    // and there is an arrow ending node beyond the bare leader + box
    expect(nodes.length).toBeGreaterThan(2);
    // a plain text box paints nothing
    expect(geomScene({ t: 'text', rect: { x: 0, y: 0, width: 10, height: 10 } }, 1)).toEqual([]);
  });

  it('the 3-click flow (tip → knee → box) commits a callout and opens it for editing', () => {
    let m = run(initialModel, [
      calloutPtr('down', 40, 60), // click 1: tip
      calloutPtr('up', 40, 60),
      calloutPtr('move', 120, 120), // hover toward the knee (leader preview)
      calloutPtr('down', 120, 120), // click 2: knee
      calloutPtr('up', 120, 120),
      calloutPtr('move', 200, 100), // hover toward the box
      calloutPtr('down', 200, 100), // box drag start
      calloutPtr('move', 320, 140),
      calloutPtr('up', 320, 140), // commit
    ]);
    const a = m.byId[m.order[0]];
    expect(a.subtype).toBe('free-text');
    expect(a.geom.t).toBe('text');
    if (a.geom.t !== 'text' || !a.geom.callout) throw new Error('expected callout geom');
    expect(a.geom.callout.tip).toEqual({ x: 40, y: 60 });
    expect(a.geom.callout.knee).toEqual({ x: 120, y: 120 });
    expect(a.geom.callout.ending).toBe('open-arrow');
    expect(a.geom.rect).toMatchObject({ x: 200, y: 100, width: 120, height: 40 });
    expect(m.selected).toEqual([a.id]);
    expect(m.editing).toBe(a.id);
    expect(a.source).toBe('vector');
  });

  it('a click (no drag) for the box step lays a default-sized text box', () => {
    const m = run(initialModel, [
      calloutPtr('down', 40, 60),
      calloutPtr('up', 40, 60),
      calloutPtr('down', 120, 120),
      calloutPtr('up', 120, 120),
      calloutPtr('down', 200, 100), // box click, no travel
      calloutPtr('up', 200, 100),
    ]);
    const a = m.byId[m.order[0]];
    expect(a.geom.t === 'text' && a.geom.rect).toMatchObject({
      x: 200,
      y: 100,
      width: 150,
      height: 40,
    });
  });

  it('the in-progress callout previews via a draft render item, before any commit', () => {
    const m = run(initialModel, [
      calloutPtr('down', 40, 60), // tip placed
      calloutPtr('move', 120, 120), // knee-step preview follows the cursor
    ]);
    expect(m.order).toHaveLength(0); // nothing committed yet
    const ghost = pageItems(m, PON).find((i) => i.source === 'ghost');
    expect(ghost).toBeDefined();
  });

  // The box-step ghost geom (the in-progress text box) — drives the no-bounce check.
  const ghostBox = (m: Model) => {
    const g = pageItems(m, PON).find((i) => i.source === 'ghost')?.geom;
    return g && g.t === 'text' ? g.rect : null;
  };

  it('pressing for the box keeps the DEFAULT box until a real drag (no bounce)', () => {
    // tip → knee → press the box at (200,100); a sub-threshold jiggle must NOT
    // collapse the preview to a sliver — it stays the 150x40 default at the press.
    const m = run(initialModel, [
      calloutPtr('down', 40, 60),
      calloutPtr('up', 40, 60),
      calloutPtr('down', 120, 120),
      calloutPtr('up', 120, 120),
      calloutPtr('down', 200, 100), // box press
      calloutPtr('move', 201, 101), // 1-unit jiggle (< MIN_DRAG)
    ]);
    expect(ghostBox(m)).toMatchObject({ x: 200, y: 100, width: 150, height: 40 });
  });

  it('once the drag passes MIN_DRAG the box preview follows the pointer', () => {
    const m = run(initialModel, [
      calloutPtr('down', 40, 60),
      calloutPtr('up', 40, 60),
      calloutPtr('down', 120, 120),
      calloutPtr('up', 120, 120),
      calloutPtr('down', 200, 100), // box press
      calloutPtr('move', 320, 150), // a real drag (>> MIN_DRAG)
    ]);
    // preview is now the dragged rect — and it matches what an up would commit
    expect(ghostBox(m)).toMatchObject({ x: 200, y: 100, width: 120, height: 50 });
    const committed = update(m, calloutPtr('up', 320, 150))[0];
    const a = committed.byId[committed.order[0]];
    expect(a.geom.t === 'text' && a.geom.rect).toMatchObject({
      x: 200,
      y: 100,
      width: 120,
      height: 50,
    });
  });
});

describe('annotation-core callout — upright on a rotated page', () => {
  // The same 3-click flow, but the samples carry the tool's upright policy +
  // a 90° display rotation (as the draw handler sends on DOWN). upright means
  // rot = uprightRotation(90) = 270 on the text BOX only.
  const rotPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
    t: 'createPointer',
    phase,
    subtype: 'free-text-callout',
    in: { pon: PON, point: { x, y }, shift: false, displayRotation: 90, upright: true },
  });
  // A committed upright callout: box {200,100,120,40} tilted 270° about its
  // centre (260,120) — its page-space FOOTPRINT is the transposed {240,60,40,120}.
  const rotCalloutGeom = (): Extract<Geom, { t: 'text' }> => ({
    t: 'text',
    rect: { x: 200, y: 100, width: 120, height: 40 },
    rot: 270,
    callout: { tip: { x: 40, y: 60 }, knee: { x: 120, y: 120 }, ending: 'open-arrow' },
  });

  it('calloutConnection lands on the ROTATED edge midpoint (decided in the local frame)', () => {
    const box = { x: 100, y: 100, width: 100, height: 60 }; // centre (150, 130)
    // At rot 90 the footprint is the transposed box: x∈[120,180], y∈[80,180].
    // A ref far right must connect to the footprint's right edge midpoint.
    expect(calloutConnection(box, { x: 400, y: 130 }, 90)).toMatchObject({ x: 180, y: 130 });
    // A ref far above → the footprint's top edge midpoint.
    const above = calloutConnection(box, { x: 150, y: -200 }, 90);
    expect(above.x).toBeCloseTo(150);
    expect(above.y).toBeCloseTo(80);
    // rot 0 keeps the classic rule bit-identically.
    expect(calloutConnection(box, { x: 400, y: 130 }, 0)).toEqual({ x: 200, y: 130 });
  });

  it('calloutLinePoints derives conn off the rotated footprint', () => {
    const pts = calloutLinePoints(rotCalloutGeom());
    expect(pts).toHaveLength(3);
    // knee (120,120) sits left of the footprint (x∈[240,280]) → left edge midpoint
    expect(pts[2].x).toBeCloseTo(240);
    expect(pts[2].y).toBeCloseTo(120);
  });

  it('the box drag commits the TRANSPOSED logical box + rot (footprint = what was drawn)', () => {
    const m = run(initialModel, [
      rotPtr('down', 40, 60), // tip
      rotPtr('up', 40, 60),
      rotPtr('down', 120, 120), // knee
      rotPtr('up', 120, 120),
      rotPtr('down', 200, 100), // box drag start
      rotPtr('move', 320, 140),
      rotPtr('up', 320, 140), // commit
    ]);
    const a = m.byId[m.order[0]];
    if (a.geom.t !== 'text' || !a.geom.callout) throw new Error('expected callout geom');
    // dragged {200,100,120,40}, centre (260,120) → transposed logical box
    expect(a.geom.rect).toMatchObject({ x: 240, y: 60, width: 40, height: 120 });
    expect(a.geom.rot).toBe(270);
    // spinning the logical box by rot lands exactly back on the dragged region
    expectRectClose(rotatedAabb(a.geom.rect, a.geom.rot!), {
      x: 200,
      y: 100,
      width: 120,
      height: 40,
    });
    // the leader anchors never turned
    expect(a.geom.callout.tip).toEqual({ x: 40, y: 60 });
    expect(a.geom.callout.knee).toEqual({ x: 120, y: 120 });
  });

  it('a box CLICK lays the default box upright-anchored at the press point', () => {
    const m = run(initialModel, [
      rotPtr('down', 40, 60),
      rotPtr('up', 40, 60),
      rotPtr('down', 120, 120),
      rotPtr('up', 120, 120),
      rotPtr('down', 200, 100), // box click, no travel
      rotPtr('up', 200, 100),
    ]);
    const a = m.byId[m.order[0]];
    if (a.geom.t !== 'text') throw new Error('expected text geom');
    // the SAME box uprightAnchoredRect places (its displayed top-left at the click)
    expect(a.geom.rect).toMatchObject(uprightAnchoredRect({ x: 200, y: 100 }, 150, 40, 90));
    expect(a.geom.rot).toBe(270);
  });

  it('the box-step ghost previews the SAME rot the commit applies', () => {
    const m = run(initialModel, [
      rotPtr('down', 40, 60),
      rotPtr('up', 40, 60),
      rotPtr('down', 120, 120),
      rotPtr('up', 120, 120),
      rotPtr('move', 200, 100), // hover in the box step
    ]);
    const ghost = pageItems(m, PON).find((i) => i.source === 'ghost');
    expect(ghost).toBeDefined();
    expect(ghost!.geom.t === 'text' && ghost!.geom.rot).toBe(270);
  });

  it('an unrotated display (or a non-upright caller) keeps the classic commit — no rot', () => {
    const plainPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
      t: 'createPointer',
      phase,
      subtype: 'free-text-callout',
      in: { pon: PON, point: { x, y }, shift: false, displayRotation: 0, upright: true },
    });
    const m = run(initialModel, [
      plainPtr('down', 40, 60),
      plainPtr('up', 40, 60),
      plainPtr('down', 120, 120),
      plainPtr('up', 120, 120),
      plainPtr('down', 200, 100),
      plainPtr('up', 200, 100),
    ]);
    const a = m.byId[m.order[0]];
    if (a.geom.t !== 'text') throw new Error('expected text geom');
    expect(a.geom.rect).toMatchObject({ x: 200, y: 100, width: 150, height: 40 });
    expect(a.geom.rot).toBeUndefined();
  });

  it('geomHit tests the box by its FOOTPRINT and the leader in page space', () => {
    const g = rotCalloutGeom();
    // inside the footprint (x∈[240,280], y∈[60,180]) but outside the logical rect
    expect(geomHit(g, { x: 260, y: 70 }, 0, true, 1)).toBe(true);
    // inside the logical rect but outside the footprint AND off the leader
    expect(geomHit(g, { x: 210, y: 135 }, 0, true, 1)).toBe(false);
    // the leader still hits in page space (knee→conn runs along y=120)
    expect(geomHit(g, { x: 180, y: 120 }, 2, true, 1)).toBe(true);
  });

  it('geomVisualBounds and selectionBounds wrap the rotated footprint', () => {
    const g = rotCalloutGeom();
    const vb = geomVisualBounds(g, 0);
    // reaches the footprint's top (y=60) and right (x=280) — not just the logical box
    expect(vb.y).toBeLessThanOrEqual(60);
    expect(vb.x + vb.width).toBeGreaterThanOrEqual(280);
    expectRectClose(selectionBounds(g, 1), { x: 240, y: 60, width: 40, height: 120 });
  });

  it('geomScene draws the tilted box as a CLOSED corner ring; the leader stays open', () => {
    const nodes = geomScene(rotCalloutGeom(), 1);
    const ring = nodes.find((n) => n.kind === 'poly' && n.closed);
    expect(ring).toBeDefined();
    if (!ring || ring.kind !== 'poly') throw new Error('expected ring');
    const xs = ring.points.map((p) => p.x);
    const ys = ring.points.map((p) => p.y);
    // The drawn ring insets by half the stroke (0.5 here) so the stroke's
    // OUTER edge lands on the footprint (x∈[240,280], y∈[60,180]) — the
    // AP-generator mirror; the ink never straddles the selection outline.
    expect(Math.min(...xs)).toBeCloseTo(240.5);
    expect(Math.max(...xs)).toBeCloseTo(279.5);
    expect(Math.min(...ys)).toBeCloseTo(60.5);
    expect(Math.max(...ys)).toBeCloseTo(179.5);
    // no axis-aligned rect node sneaks in for the border
    expect(nodes.some((n) => n.kind === 'rect')).toBe(false);
    expect(nodes.some((n) => n.kind === 'poly' && !n.closed)).toBe(true);
  });

  it('geomHandles rides the rotated box; the tip/knee handles stay page-space', () => {
    const handles = geomHandles(rotCalloutGeom());
    const nw = handles.find((h) => h.id === 'nw')!;
    // the logical nw corner (200,100) spun 270° about (260,120) → (240,180)
    expect(nw.at.x).toBeCloseTo(240);
    expect(nw.at.y).toBeCloseTo(180);
    expect(handles.find((h) => h.id === 'callout-tip')!.at).toEqual({ x: 40, y: 60 });
    expect(handles.find((h) => h.id === 'callout-knee')!.at).toEqual({ x: 120, y: 120 });
  });
});

describe('annotation-core — rotation', () => {
  const seededSquare = (
    id: string,
    rect: { x: number; y: number; width: number; height: number },
  ): Annot => ({
    id,
    ref: {
      kind: 'objectNumber',
      pageObjectNumber: 1,
      annotObjectNumber: Number(id.slice(1)),
    } as Annot['ref'],
    pon: PON,
    subtype: 'square',
    geom: { t: 'rect', rect, ellipse: false },
    style: initialModel.style,
    flags: DRAWN_FLAGS,
    source: 'baked',
  });

  it('box rotates about its own centre: rot adds, centre + size fixed', () => {
    const g: Geom = { t: 'rect', rect: { x: 100, y: 100, width: 100, height: 50 }, ellipse: false };
    const r = geomRotateAbout(g, centroidOf(g), 90);
    expect(geomRotation(r)).toBe(90);
    if (r.t !== 'rect') throw new Error('expected rect');
    expect(centroidOf(r)).toMatchObject({ x: 150, y: 125 }); // centre preserved
    expect(r.rect.width).toBe(100); // stored box stays UNROTATED
    expect(r.rect.height).toBe(50);
  });

  it('vertex rotation is additive about the centroid and reset is exact', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
    ];
    const g: Geom = { t: 'poly', points: pts.map((p) => ({ ...p })), closed: false };
    const c0 = centroidOf(g);
    const r1 = geomRotateAbout(g, centroidOf(g), 30);
    const r2 = geomRotateAbout(r1, centroidOf(r1), 30);
    expect(geomRotation(r2)).toBe(60); // θ is additive
    const c2 = centroidOf(r2);
    expect(c2.x).toBeCloseTo(c0.x); // centroid is the fixed pivot
    expect(c2.y).toBeCloseTo(c0.y);
    const reset = geomResetRotation(r2);
    expect(geomRotation(reset)).toBe(0);
    if (reset.t !== 'poly') throw new Error('expected poly');
    reset.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(pts[i].x); // points return to as-authored
      expect(p.y).toBeCloseTo(pts[i].y);
    });
  });

  it('obbFromGeom reconstructs an oriented box from θ for both families', () => {
    const box: Geom = {
      t: 'rect',
      rect: { x: 0, y: 0, width: 100, height: 100 },
      ellipse: false,
      rot: 90,
    };
    const obbBox = obbFromGeom(box, 0);
    expect(obbBox?.angle).toBe(90);
    expect(obbBox?.corners).toHaveLength(4);

    // a vertex shape: spin the same points by 45° and the OBB tilts to match.
    const base: Geom = {
      t: 'poly',
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      closed: true,
    };
    const turned = geomRotateAbout(base, centroidOf(base), 45);
    const obbV = obbFromGeom(turned, 0);
    expect(obbV?.angle).toBe(45);
    expect(obbV?.corners).toHaveLength(4);
  });

  it('rotatedAabb: a square is unchanged at 90°, grows by √2 at 45°', () => {
    const sq = { x: 0, y: 0, width: 100, height: 100 };
    expect(rotatedAabb(sq, 90).width).toBeCloseTo(100);
    expect(rotatedAabb(sq, 45).width).toBeCloseTo(Math.SQRT2 * 100, 3);
  });

  it('normalizeDeg wraps into [0,360)', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(450)).toBe(90);
    expect(normalizeDeg(360)).toBe(0);
  });

  it('rotate90 turns a single selected shape about its centre (one patch)', () => {
    const base = update(initialModel, {
      t: 'loaded',
      annots: [seededSquare('s1', { x: 100, y: 100, width: 100, height: 50 })],
    })[0];
    const [m, fx] = update({ ...base, selected: ['s1'] }, { t: 'rotate90' });
    expect(fx).toEqual([{ fx: 'patch', id: 's1', scope: { kind: 'geometry' } }]);
    const g = m.byId['s1'].geom;
    expect(geomRotation(g)).toBe(90);
    expect(centroidOf(g)).toMatchObject({ x: 150, y: 125 });
  });

  it('rotate90 on a group turns every member about the union centre (one patch each)', () => {
    const base = update(initialModel, {
      t: 'loaded',
      annots: [
        seededSquare('s1', { x: 0, y: 0, width: 100, height: 100 }),
        seededSquare('s2', { x: 200, y: 0, width: 100, height: 100 }),
      ],
    })[0];
    const [m, fx] = update({ ...base, selected: ['s1', 's2'] }, { t: 'rotate90' });
    expect(fx).toHaveLength(2);
    expect(geomRotation(m.byId['s1'].geom)).toBe(90);
    expect(geomRotation(m.byId['s2'].geom)).toBe(90);
    // the two boxes orbit the union centre, so their centres swap places vertically
    expect(centroidOf(m.byId['s1'].geom).x).not.toBe(50);
  });

  it('resetRotation clears rotation on the selection (one patch per rotated member)', () => {
    const base = update(initialModel, {
      t: 'loaded',
      annots: [seededSquare('s1', { x: 100, y: 100, width: 100, height: 50 })],
    })[0];
    const rotated = update({ ...base, selected: ['s1'] }, { t: 'rotate90' })[0];
    const [m, fx] = update(rotated, { t: 'resetRotation' });
    expect(fx).toEqual([{ fx: 'patch', id: 's1', scope: { kind: 'geometry' } }]);
    expect(geomRotation(m.byId['s1'].geom)).toBe(0);
  });
});

describe('annotation-core — rotation-aware selection (grab + menu + group)', () => {
  const square = (id: string, geom: Geom): Annot => ({
    id,
    ref: {
      kind: 'objectNumber',
      pageObjectNumber: 1,
      annotObjectNumber: Number(id.slice(1)),
    } as Annot['ref'],
    pon: PON,
    subtype: 'square',
    geom,
    style: initialModel.style,
    flags: DRAWN_FLAGS,
    source: 'baked',
  });
  const rect = (x: number, y: number, width: number, height: number): Geom => ({
    t: 'rect',
    rect: { x, y, width, height },
    ellipse: false,
  });

  it('a SELECTED rotated box is grabbable across its TILTED body, not its footprint', () => {
    // 100×50 box at (100,100); turned 90° about its centre (150,125) it becomes a
    // 50×100 box spanning x[125,175], y[75,175]. The unrotated footprint was
    // x[100,200], y[100,150].
    const base = update(initialModel, {
      t: 'loaded',
      annots: [square('s1', rect(100, 100, 100, 50))],
    })[0];
    const rotated = update({ ...base, selected: ['s1'] }, { t: 'rotate90' })[0];

    // (150,90): inside the tilted box but ABOVE the old footprint (y<100) — now grabs.
    expect(hitTest(rotated, PON, { x: 150, y: 90 }, DEFAULT_CHROME_GEOM, 3)).toEqual({
      t: 'annot',
      id: 's1',
    });
    // (110,140): inside the old footprint but LEFT of the tilted box (x<125) — vacated.
    expect(hitTest(rotated, PON, { x: 110, y: 140 }, DEFAULT_CHROME_GEOM, 3).t).toBe('empty');
  });

  it('the menu anchor is the ROTATED AABB and tracks rot (not the fixed unrotated box)', () => {
    const base = update(initialModel, {
      t: 'loaded',
      annots: [square('s1', rect(100, 100, 100, 50))],
    })[0];
    const before = selectionBoundsOnPage({ ...base, selected: ['s1'] }, PON);
    expect(before).toMatchObject({ x: 100, y: 100, width: 100, height: 50 }); // upright = the box

    const rotated = update({ ...base, selected: ['s1'] }, { t: 'rotate90' })[0];
    const after = selectionBoundsOnPage(rotated, PON);
    // 90° → the AABB is the box's transpose, recentred on (150,125).
    expect(after?.x).toBeCloseTo(125);
    expect(after?.y).toBeCloseTo(75);
    expect(after?.width).toBeCloseTo(50);
    expect(after?.height).toBeCloseTo(100);
    // it MOVED — the bug was the anchor never changing when you rotate.
    expect(after).not.toMatchObject({ x: 100, y: 100, width: 100, height: 50 });
  });

  it('groupUnionBounds encloses a rotated member’s tilted corners', () => {
    const tilted = geomRotateAbout(rect(0, 0, 100, 100), centroidOf(rect(0, 0, 100, 100)), 45);
    const m = update(initialModel, {
      t: 'loaded',
      annots: [square('s1', tilted), square('s2', rect(200, 0, 100, 100))],
    })[0];
    const union = groupUnionBounds({ ...m, selected: ['s1', 's2'] }, PON);
    // a 100×100 box turned 45° about its centre (50,50) reaches out to ~−20.7.
    expect(union).not.toBeNull();
    expect(union!.x).toBeCloseTo(50 - (100 * Math.SQRT2) / 2, 3); // ≈ -20.71
    expect(union!.x + union!.width).toBeCloseTo(300); // s2 still bounds the right edge
  });

  it('selectionQuad of an upright box is just its axis-aligned corners', () => {
    const quad = selectionQuad(rect(10, 20, 100, 40), 0);
    expect(quad).toEqual([
      { x: 10, y: 20 },
      { x: 110, y: 20 },
      { x: 110, y: 60 },
      { x: 10, y: 60 },
    ]);
  });
});

describe('annotation-core — rotation pivots about the rect centre', () => {
  const square = (id: string, geom: Geom): Annot => ({
    id,
    ref: {
      kind: 'objectNumber',
      pageObjectNumber: 1,
      annotObjectNumber: Number(id.slice(1)),
    } as Annot['ref'],
    pon: PON,
    subtype: 'square',
    geom,
    style: initialModel.style,
    flags: DRAWN_FLAGS,
    source: 'baked',
  });

  it('selectionCenter of a box is the rect centre, before AND after a quarter-turn', () => {
    const g: Geom = { t: 'rect', rect: { x: 100, y: 100, width: 100, height: 50 }, ellipse: false };
    expect(selectionCenter(g, 0)).toMatchObject({ x: 150, y: 125 });
    const turned = geomRotateAbout(g, selectionCenter(g, 0), 90);
    const c = selectionCenter(turned, 0);
    expect(c.x).toBeCloseTo(150);
    expect(c.y).toBeCloseTo(125);
  });

  it('a vertex shape spins in place about selectionCenter, NOT its off-centre vertex mean', () => {
    // An L-shaped (asymmetric) polyline: its vertex mean sits well away from the
    // centre of the bounding rect.
    const g: Geom = {
      t: 'poly',
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 20, y: 100 },
        { x: 20, y: 20 },
        { x: 100, y: 20 },
        { x: 100, y: 0 },
      ],
      closed: false,
    };
    const mean = centroidOf(g);
    const centre = selectionCenter(g, 0);
    // the two are genuinely different for an asymmetric shape (the whole bug).
    expect(Math.hypot(mean.x - centre.x, mean.y - centre.y)).toBeGreaterThan(5);

    // rotating about the selection centre keeps that centre fixed → spins in place.
    const spun = geomRotateAbout(g, centre, 37);
    const after = selectionCenter(spun, 0);
    expect(after.x).toBeCloseTo(centre.x, 6);
    expect(after.y).toBeCloseTo(centre.y, 6);

    // rotating about the vertex mean (the OLD behaviour) drifts the visible centre.
    const swung = geomRotateAbout(g, mean, 37);
    const drifted = selectionCenter(swung, 0);
    expect(Math.hypot(drifted.x - centre.x, drifted.y - centre.y)).toBeGreaterThan(1);
  });

  it('a rotate gesture on a vertex shape pivots about the selection centre and keeps it fixed', () => {
    const g: Geom = {
      t: 'poly',
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 20, y: 100 },
        { x: 20, y: 20 },
        { x: 100, y: 20 },
        { x: 100, y: 0 },
      ],
      closed: false,
    };
    const poly: Annot = { ...square('s1', g), subtype: 'polyline' };
    const base = update(initialModel, { t: 'loaded', annots: [poly] })[0];
    const m = { ...base, selected: ['s1'] };
    const centre = selectionCenter(g, poly.style.strokeWidth);

    // find the rotate knob, then start + drag the gesture there.
    const obb = obbFromGeom(g, poly.style.strokeWidth)!;
    const corners = obb.corners;
    const fromMid = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
    const down = { x: corners[3].x - corners[0].x, y: corners[3].y - corners[0].y };
    const len = Math.hypot(down.x, down.y) || 1;
    const knob = { x: fromMid.x - (down.x / len) * 24, y: fromMid.y - (down.y / len) * 24 };

    const started = update(m, {
      t: 'editPointer',
      phase: 'down',
      in: { pon: PON, point: knob, shift: false },
    })[0];
    expect(started.draft?.g).toBe('rotate');
    if (started.draft?.g === 'rotate') {
      expect(started.draft.pivot.x).toBeCloseTo(centre.x, 6);
      expect(started.draft.pivot.y).toBeCloseTo(centre.y, 6);
    }

    // drag to some other angle and commit; the selection centre must not move.
    const moved = update(started, {
      t: 'editPointer',
      phase: 'move',
      in: { pon: PON, point: { x: knob.x + 40, y: knob.y + 40 }, shift: false },
    })[0];
    const up = update(moved, {
      t: 'editPointer',
      phase: 'up',
      in: { pon: PON, point: { x: knob.x + 40, y: knob.y + 40 }, shift: false },
    })[0];
    const after = selectionCenter(up.byId['s1'].geom, up.byId['s1'].style.strokeWidth);
    expect(after.x).toBeCloseTo(centre.x, 4);
    expect(after.y).toBeCloseTo(centre.y, 4);
    expect(geomRotation(up.byId['s1'].geom)).not.toBe(0);
  });
});

describe('annotation-core — selectionAnchor carries the knob alongside a centred box', () => {
  const square = (id: string, geom: Geom): Annot => ({
    id,
    ref: {
      kind: 'objectNumber',
      pageObjectNumber: 1,
      annotObjectNumber: Number(id.slice(1)),
    } as Annot['ref'],
    pon: PON,
    subtype: 'square',
    geom,
    style: initialModel.style,
    flags: DRAWN_FLAGS,
    source: 'baked',
  });
  const rect = (x: number, y: number, width: number, height: number): Geom => ({
    t: 'rect',
    rect: { x, y, width, height },
    ellipse: false,
  });

  it('a rotatable selection: bounds equal selectionBoundsOnPage (centred, NOT grown) and a knob is present', () => {
    const base = update(initialModel, {
      t: 'loaded',
      annots: [square('s1', rect(100, 100, 100, 50))],
    })[0];
    const m = { ...base, selected: ['s1'] };
    const anchor = selectionAnchor(m);
    expect(anchor).not.toBeNull();
    // The box is the plain selection box — the knob is NOT folded in (no growth).
    expect(anchor!.bounds).toEqual(selectionBoundsOnPage(m, PON));
    expect(anchor!.knob).toBeDefined();
  });

  it('a non-rotatable selection (highlight) exposes a box but NO knob', () => {
    const hi: Annot = {
      ...square('s2', {
        t: 'quads',
        quads: [
          textQuadFromRect({ x: 10, y: 10, width: 80, height: 12 }),
        ],
      }),
      subtype: 'highlight',
    };
    const base = update(initialModel, { t: 'loaded', annots: [hi] })[0];
    const m = { ...base, selected: ['s2'] };
    const anchor = selectionAnchor(m);
    expect(anchor).not.toBeNull();
    expect(anchor!.bounds).toEqual(selectionBoundsOnPage(m, PON));
    expect(anchor!.knob).toBeUndefined();
  });
});

describe('annotation-core — join-aware stroke bounds', () => {
  const poly = (points: Vec[], closed: boolean): Geom => ({ t: 'poly', points, closed });

  it('a sharp join sticks out only on the spike side — the box is NOT symmetric', () => {
    // A tent "^" with a sharp apex at (50,0); arms come down to y=100.
    const g = poly(
      [
        { x: 0, y: 100 },
        { x: 50, y: 0 },
        { x: 100, y: 100 },
      ],
      false,
    );
    const sw = 10;
    const h = sw / 2;
    const b = geomVisualBounds(g, sw);

    // The mitred apex spikes ABOVE y=0 by h/cos(delta/2) = h*sqrt(5) ≈ 11.18.
    const spike = h * Math.sqrt(5);
    expect(b.y).toBeCloseTo(-spike, 3);

    // The far (bottom) side gets only a thin offset (h/sqrt(5)), NOT the same pad —
    // the whole point: a pointy join grows only its own side.
    const topPad = 0 - b.y;
    const botPad = b.y + b.height - 100;
    expect(botPad).toBeCloseTo(h / Math.sqrt(5), 3);
    expect(topPad).toBeGreaterThan(botPad * 3);
  });

  it('the miter limit bevels a near-reversal join instead of exploding the box', () => {
    // A hairpin at (100,0): the outgoing segment doubles almost straight back, so an
    // ungated miter would shoot out ~190*h. The limit must clamp it to the bevel.
    const g = poly(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 2, y: 1 },
      ],
      false,
    );
    const sw = 10;
    const h = sw / 2;
    const b = geomVisualBounds(g, sw);
    // Bounded by the vertex hull grown by the bevel (~h), nowhere near the ~190*h spike.
    expect(b.width).toBeLessThan(100 + 4 * h);
    expect(b.height).toBeLessThan(20 * h);
  });

  it('a closed polygon wraps its stroke (parity with a polyline), not tight to the vertices', () => {
    const g = poly(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      true,
    );
    const sw = 8;
    const h = sw / 2;
    const sb = selectionBounds(g, sw);
    // selectionBounds now routes polygons through the stroke-aware visual bounds…
    expect(sb).toEqual(geomVisualBounds(g, sw));
    // …so the outline sits OUTSIDE the tight vertex box (a 90° corner miters to -h).
    const tight = geomBounds(g);
    expect(sb.x).toBeCloseTo(-h, 3);
    expect(sb.y).toBeCloseTo(-h, 3);
    expect(sb.width).toBeGreaterThan(tight.width);
    expect(sb.height).toBeGreaterThan(tight.height);
  });

  it('ink bounds are unchanged — a plain h grow of the freehand hull (round, never spikes)', () => {
    const g: Geom = {
      t: 'ink',
      strokes: [
        [
          { x: 10, y: 10 },
          { x: 60, y: 15 },
          { x: 40, y: 90 },
        ],
      ],
    };
    const sw = 6;
    const h = sw / 2;
    const b = geomVisualBounds(g, sw);
    const hull = geomBounds(g);
    expect(b).toEqual({
      x: hull.x - h,
      y: hull.y - h,
      width: hull.width + sw,
      height: hull.height + sw,
    });
  });

  it('a mitred arrowhead tip is fully enclosed — the box reaches ~sw past the tip vertex', () => {
    // Horizontal line pointing right, closed arrow at the tip (100,0).
    const g: Geom = {
      t: 'line',
      a: { x: 0, y: 0 },
      b: { x: 100, y: 0 },
      ends: { start: 'none', end: 'closed-arrow' },
    };
    const sw = 6;
    const b = geomVisualBounds(g, sw);
    // The arrowhead tip is a 60° corner: the mitred stroke reaches h/sin(30°) = sw
    // past the tip vertex. The right edge must clear that (old flat h/2 pad did not).
    expect(b.x + b.width).toBeGreaterThanOrEqual(100 + sw - 1e-6);
  });

  it('scene paint: only ink rounds its joins; shapes and polys stay sharp (miter)', () => {
    const mk = (subtype: Subtype, geom: Geom): RenderItem => ({
      id: 'x',
      ref: null,
      subtype,
      geom,
      box: geomVisualBounds(geom, 4),
      style: {
        color: '#000000',
        interiorColor: null,
        strokeWidth: 4,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      source: 'vector',
      selected: false,
    });
    const square = mk('square', {
      t: 'rect',
      rect: { x: 0, y: 0, width: 50, height: 40 },
      ellipse: false,
    });
    const polyline = mk(
      'polyline',
      poly(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
        ],
        false,
      ),
    );
    const polygon = mk(
      'polygon',
      poly(
        [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
          { x: 40, y: 40 },
        ],
        true,
      ),
    );
    const ink = mk('ink', {
      t: 'ink',
      strokes: [
        [
          { x: 0, y: 0 },
          { x: 20, y: 10 },
          { x: 40, y: 0 },
        ],
      ],
    });

    expect(scene(square)[0].paint.join).toBeUndefined();
    expect(scene(polyline)[0].paint.join).toBeUndefined();
    expect(scene(polygon)[0].paint.join).toBeUndefined();
    expect(scene(ink)[0].paint.join).toBe('round');
  });
});

describe('annotation-core opaqueBody (stamp) gestures', () => {
  const STAMP_RECT = { x: 100, y: 100, width: 100, height: 50 };
  const stamp = (): Annot => ({
    id: 'S1',
    ref: { kind: 'objectNumber', pageObjectNumber: PON, annotObjectNumber: 900 },
    pon: PON,
    subtype: 'stamp',
    geom: { t: 'rect', rect: { ...STAMP_RECT }, ellipse: false },
    style: {
      color: '#000000',
      interiorColor: null,
      strokeWidth: 1,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    flags: DRAWN_FLAGS,
    source: 'baked',
    apBox: { ...STAMP_RECT },
  });
  const loadStamp = (): Model => update(initialModel, { t: 'loaded', annots: [stamp()] })[0];

  it('stays baked MID-resize with the raster box following the live geometry', () => {
    // select (body click — opaqueBody hits anywhere inside), then grab the SE
    // handle at (200,150) and drag WITHOUT releasing.
    let m = run(loadStamp(), [editPtr('down', 150, 125), editPtr('up', 150, 125)]);
    m = run(m, [editPtr('down', 200, 150), editPtr('move', 260, 180)]);
    const item = pageItems(m, PON).find((i) => i.subtype === 'stamp')!;
    expect(item.source).toBe('baked'); // never flips: there is no vector render
    expect(item.apBox).toMatchObject({ x: 100, y: 100, width: 160, height: 80 });
  });

  it('stays baked AFTER the resize commits, apBox at the new rect', () => {
    let m = run(loadStamp(), [editPtr('down', 150, 125), editPtr('up', 150, 125)]);
    m = run(m, [editPtr('down', 200, 150), editPtr('move', 260, 180), editPtr('up', 260, 180)]);
    const a = m.byId['S1'];
    expect(a.source).toBe('baked');
    expect(a.apBox).toMatchObject({ x: 100, y: 100, width: 160, height: 80 });
    const item = pageItems(m, PON).find((i) => i.subtype === 'stamp')!;
    expect(item.source).toBe('baked');
  });

  it('stays baked MID-rotate with the live rotation exposed as apRot (view transform)', () => {
    // select the stamp, grab its rotate knob, and drag WITHOUT releasing
    let m = run(loadStamp(), [editPtr('down', 150, 125), editPtr('up', 150, 125)]);
    const knob = selectionKnob(m, PON)!;
    expect(knob).toBeTruthy();
    // rotate the grab point 30° about the stamp centre
    const c = { x: 150, y: 125 };
    const a0 = Math.atan2(knob.at.y - c.y, knob.at.x - c.x);
    const a1 = a0 + (30 * Math.PI) / 180;
    const r0 = Math.hypot(knob.at.x - c.x, knob.at.y - c.y);
    m = run(m, [
      editPtr('down', knob.at.x, knob.at.y),
      editPtr('move', c.x + r0 * Math.cos(a1), c.y + r0 * Math.sin(a1)),
    ]);
    const item = pageItems(m, PON).find((i) => i.subtype === 'stamp')!;
    expect(item.source).toBe('baked'); // the bitmap never disappears mid-rotate
    expect(Math.abs((item.apRot ?? 0) - 30)).toBeLessThan(1); // ...and spins live
  });

  it('a square mid-resize still flips to vector (unchanged behaviour)', () => {
    let m = run(initialModel, [
      createPtr('square', 'down', 100, 100),
      createPtr('square', 'move', 200, 200),
      createPtr('square', 'up', 200, 200),
    ]);
    m = run(m, [editPtr('down', 200, 200), editPtr('move', 260, 240)]);
    const item = pageItems(m, PON)[0];
    expect(item.source).toBe('vector');
  });
});

/**
 * Annotations are page-bound; the pointer isn't. Two rules (see update.ts):
 *  FRAME — a gesture is anchored to the page it started on; a sample resolved
 *  against another page is a different coordinate frame and must be ignored
 *  (regression: crossing onto page 2 teleported the annotation to the top of
 *  page 1 and COMMITTED it there).
 *  CLAMP — with `pageBox` on the input, geometry pins to the page per axis, so
 *  an overshooting pointer slides the shape along the edge (v2 behaviour).
 */
describe('page-bound gestures', () => {
  const PON2 = 2 as Annot['pon'];
  // US-Letter content box, origin at the crop top-left.
  const BOX = { x: 0, y: 0, width: 612, height: 792 };
  const edit = (
    phase: 'down' | 'move' | 'up',
    x: number,
    y: number,
    pon: Annot['pon'] = PON,
  ): Msg => ({ t: 'editPointer', phase, in: { pon, point: { x, y }, shift: false, pageBox: BOX } });
  const create = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
    t: 'createPointer',
    phase,
    subtype: 'square',
    in: { pon: PON, point: { x, y }, shift: false, pageBox: BOX },
  });
  const marquee = (
    phase: 'down' | 'move' | 'up',
    x: number,
    y: number,
    pon: Annot['pon'] = PON,
  ): Msg => ({
    t: 'marqueePointer',
    phase,
    in: { pon, point: { x, y }, shift: false, pageBox: BOX },
  });

  /** A committed, selected 100×60 square near the page bottom (rect y 700..760). */
  const nearBottom = (): Model =>
    run(initialModel, [
      createPtr('square', 'down', 250, 700),
      createPtr('square', 'move', 350, 760),
      createPtr('square', 'up', 350, 760),
    ]);
  const moveDraft = (m: Model) => (m.draft?.g === 'move' ? m.draft : null);

  it('THE regression: a move sample from another page is a foreign frame — ignored', () => {
    // Grab the square (body, clear of the handles), then feed the exact sample
    // the old bug produced: pon=page-2, y≈18 (page-2-local, near its top).
    // Guides off: this tests the FRAME rule, and the (10,10) move below would
    // otherwise land the centre within snap range of the page centre.
    const seeded = { ...nearBottom(), snap: { ...initialModel.snap, guides: false } };
    let m = run(seeded, [edit('down', 270, 710)]);
    expect(moveDraft(m)).toBeTruthy();
    m = run(m, [edit('move', 270, 18, PON2)]);
    expect(moveDraft(m)!.delta).toEqual({ x: 0, y: 0 }); // NOT {x:0, y:-692}
    // …and the gesture keeps working on its home page afterwards.
    m = run(m, [edit('move', 280, 720)]);
    expect(moveDraft(m)!.delta).toEqual({ x: 10, y: 10 });
  });

  it('a move clamps to the page box and SLIDES along the edge (free axis keeps tracking)', () => {
    // Drag far past the bottom edge while also moving right: y pins, x follows.
    let m = run(nearBottom(), [edit('down', 270, 710), edit('move', 320, 900)]);
    const d = moveDraft(m)!;
    expect(d.delta.x).toBe(50); // x unaffected by the y overshoot
    expect(d.delta.y).toBeGreaterThan(0);
    expect(d.delta.y).toBeLessThan(40); // pinned at the edge, not 190
    const [done, fx] = update(m, edit('up', 320, 900));
    expect(fx).toEqual([{ fx: 'patch', id: done.selected[0], scope: { kind: 'geometry' } }]);
    const r = rectGeom(done.byId[done.selected[0]].geom)!;
    expect(r.x).toBe(300); // slid right by the full 50
    // Bottom rests ON the page edge (± the stroke's visual inflation).
    expect(r.y + r.height).toBeGreaterThan(788);
    expect(r.y + r.height).toBeLessThanOrEqual(792);
  });

  it('an up after an off-page move still COMMITS the clamped position', () => {
    // The handler always dispatches `up` now (a release over the gap used to
    // strand the draft and the annotation snapped back on the next click).
    const [done, fx] = update(
      run(nearBottom(), [edit('down', 270, 710), edit('move', 270, 900)]),
      edit('up', 270, 900),
    );
    expect(done.draft).toBeNull();
    expect(fx).toEqual([{ fx: 'patch', id: done.selected[0], scope: { kind: 'geometry' } }]);
    const r = rectGeom(done.byId[done.selected[0]].geom)!;
    expect(r.y).toBeGreaterThan(700); // it moved…
    expect(r.y + r.height).toBeLessThanOrEqual(792); // …but stayed on the page
  });

  it('a resize handle pins to the page edge', () => {
    // Grab the SE corner handle and drag way off the page: the dragged corner
    // clamps to (612, 792), so the geometry never leaves the page.
    const m = run(nearBottom(), [edit('down', 350, 760), edit('move', 700, 900)]);
    expect(m.draft?.g).toBe('handle');
    const cur = m.draft?.g === 'handle' ? m.draft.cur : null;
    const r = cur && 'rect' in cur ? cur.rect : null;
    expect(r).toBeTruthy();
    expect(r!.x + r!.width).toBe(612);
    expect(r!.y + r!.height).toBe(792);
  });

  it('a creation drag clips at the page edge', () => {
    const m = run(initialModel, [
      create('down', 500, 700),
      create('move', 700, 900),
      create('up', 700, 900),
    ]);
    const r = rectGeom(m.byId[m.order[0]].geom)!;
    expect(r.x + r.width).toBe(612);
    expect(r.y + r.height).toBe(792);
  });

  it('an in-progress creation ignores samples from another page', () => {
    let m = run(initialModel, [create('down', 500, 700), create('move', 550, 750)]);
    const before = m.draft;
    m = run(m, [
      {
        t: 'createPointer',
        phase: 'move',
        subtype: 'square',
        in: { pon: PON2, point: { x: 10, y: 10 }, shift: false, pageBox: BOX },
      },
    ]);
    expect(m.draft).toEqual(before);
  });

  it('a marquee pins to the page box and ignores foreign-page samples', () => {
    let m = run(initialModel, [marquee('down', 500, 700), marquee('move', 700, 900)]);
    expect(m.draft?.g === 'marquee' && m.draft.to).toEqual({ x: 612, y: 792 });
    m = run(m, [marquee('move', 10, 10, PON2)]);
    expect(m.draft?.g === 'marquee' && m.draft.to).toEqual({ x: 612, y: 792 });
  });

  it('gestures without a pageBox behave as before (no clamp, same-frame only)', () => {
    // Adapters that don't supply pageBox lose the clamp but keep correctness.
    let m = run(nearBottom(), [editPtr('down', 270, 710), editPtr('move', 270, 900)]);
    expect(moveDraft(m)!.delta).toEqual({ x: 0, y: 190 });
  });
});

/* ── snapping: alignment guides (move) + rotation snap ──────────────────────
 * Guides: the moving selection's edges/centers snap to other annotations on the
 * page (and the page box) within `snap.guideThreshold`, nudging the delta and
 * reporting guide lines. Rotation: the selection's ABSOLUTE angle locks onto
 * `snap.rotationAngles` within `snap.rotationThreshold`. Shift bypasses both.
 */
describe('annotation-core — snapping', () => {
  const seededSquare = (
    id: string,
    rect: { x: number; y: number; width: number; height: number },
    rot?: number,
  ): Annot => ({
    id,
    ref: {
      kind: 'objectNumber',
      pageObjectNumber: 1,
      annotObjectNumber: Number(id.slice(1)),
    } as Annot['ref'],
    pon: PON,
    subtype: 'square',
    geom: { t: 'rect', rect, ellipse: false, ...(rot ? { rot } : {}) },
    style: initialModel.style,
    flags: DRAWN_FLAGS,
    source: 'baked',
  });
  const seeded = (...annots: Annot[]): Model => update(initialModel, { t: 'loaded', annots })[0];
  const moveDraft = (m: Model) => (m.draft?.g === 'move' ? m.draft : null);
  /** `start - pivot` spun by `deg` CW (y-down), re-anchored at the pivot — the
   *  pointer position that makes the rotate draft's raw delta exactly `deg`. */
  const curFor = (pivot: Vec, start: Vec, deg: number): Vec => {
    const r = (deg * Math.PI) / 180;
    const v = { x: start.x - pivot.x, y: start.y - pivot.y };
    return {
      x: pivot.x + v.x * Math.cos(r) - v.y * Math.sin(r),
      y: pivot.y + v.x * Math.sin(r) + v.y * Math.cos(r),
    };
  };

  it('computeMoveSnap: an in-threshold edge pair nudges the delta and yields a guide', () => {
    // s1 right edge at 200; s2 dragged so its left edge lands at 203 (diff -3 < 5).
    const m = seeded(
      seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }),
      seededSquare('s2', { x: 300, y: 300, width: 50, height: 50 }),
    );
    const { delta, guides } = computeMoveSnap(m, ['s2'], PON, { x: -97, y: 0 }, 5, undefined);
    expect(delta).toEqual({ x: -100, y: 0 }); // 203 → 200
    expect(guides).toHaveLength(1);
    expect(guides[0]).toMatchObject({ axis: 'x', at: 200 });
    // the guide spans both shapes (plus the through-line overshoot)
    expect(guides[0].lo).toBeLessThan(100);
    expect(guides[0].hi).toBeGreaterThan(350);
  });

  it('computeMoveSnap: outside the threshold nothing snaps', () => {
    const m = seeded(
      seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }),
      seededSquare('s2', { x: 300, y: 300, width: 50, height: 50 }),
    );
    const { delta, guides } = computeMoveSnap(m, ['s2'], PON, { x: -93, y: 0 }, 5, undefined);
    expect(delta).toEqual({ x: -93, y: 0 }); // left edge at 207: diff 7 ≥ 5
    expect(guides).toEqual([]);
  });

  it('computeMoveSnap: the closest target wins the axis', () => {
    // moving left edge lands at 204: s1 right edge 200 (diff -4) vs s3 left edge
    // 202 (diff -2) — the nearer 202 wins.
    const m = seeded(
      seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }),
      seededSquare('s3', { x: 202, y: 500, width: 60, height: 60 }),
      seededSquare('s2', { x: 300, y: 300, width: 50, height: 50 }),
    );
    const { delta, guides } = computeMoveSnap(m, ['s2'], PON, { x: -96, y: 0 }, 5, undefined);
    expect(delta).toEqual({ x: -98, y: 0 }); // 204 → 202
    expect(guides[0]).toMatchObject({ axis: 'x', at: 202 });
  });

  it('computeMoveSnap: the page box snaps edges and centre', () => {
    const m = seeded(seededSquare('s1', { x: 10, y: 10, width: 50, height: 50 }));
    const page = { x: 0, y: 0, width: 600, height: 800 };
    // top edge dragged to 2 → pins to the page top (0).
    const up = computeMoveSnap(m, ['s1'], PON, { x: 0, y: -8 }, 5, page);
    expect(up.delta).toEqual({ x: 0, y: -10 });
    expect(up.guides[0]).toMatchObject({ axis: 'y', at: 0 });
    // horizontal centre starts at 35; raw +262 puts it at 297, 3 from the page
    // centre (300) → snaps onto it.
    const mid = computeMoveSnap(m, ['s1'], PON, { x: 262, y: 0 }, 5, page);
    expect(mid.delta).toEqual({ x: 265, y: 0 });
    expect(mid.guides[0]).toMatchObject({ axis: 'x', at: 300 });
  });

  it('a move gesture snaps live (guides in the draft + chrome) and commits snapped', () => {
    const m0 = seeded(
      seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }),
      seededSquare('s2', { x: 300, y: 300, width: 50, height: 50 }),
    );
    // grab s2 on its left stroke (an unfilled square hits on its outline).
    const dragging = run(m0, [editPtr('down', 300, 325), editPtr('move', 203, 325)]);
    expect(moveDraft(dragging)!.delta).toEqual({ x: -100, y: 0 });
    expect(moveDraft(dragging)!.guides).toHaveLength(1);
    expect(chrome(dragging, PON).some((n) => n.kind === 'guide')).toBe(true);
    const m = run(dragging, [editPtr('up', 203, 325)]);
    expect(rectGeom(m.byId['s2'].geom)).toMatchObject({ x: 200, y: 300 });
    expect(chrome(m, PON).some((n) => n.kind === 'guide')).toBe(false); // cleared
  });

  it('shift bypasses guide snapping; setSnap({guides:false}) disables it', () => {
    const m0 = seeded(
      seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }),
      seededSquare('s2', { x: 300, y: 300, width: 50, height: 50 }),
    );
    const shifted = run(m0, [editPtr('down', 300, 325), editPtr('move', 203, 325, true)]);
    expect(moveDraft(shifted)!.delta).toEqual({ x: -97, y: 0 });
    expect(moveDraft(shifted)!.guides).toEqual([]);

    const off = update(m0, { t: 'setSnap', patch: { guides: false } })[0];
    expect(off.snap.guides).toBe(false);
    const dragged = run(off, [editPtr('down', 300, 325), editPtr('move', 203, 325)]);
    expect(moveDraft(dragged)!.delta).toEqual({ x: -97, y: 0 });
    expect(moveDraft(dragged)!.guides).toEqual([]);
  });

  it('rotateDraftDelta snaps the ABSOLUTE angle onto 0/90/180/270 within 4°', () => {
    const m = seeded(seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }));
    const pivot = { x: 150, y: 150 };
    const start = { x: 150, y: 50 };
    const at = (deg: number, free?: boolean) =>
      rotateDraftDelta(m, {
        g: 'rotate',
        ids: ['s1'],
        pivot,
        start,
        cur: curFor(pivot, start, deg),
        ...(free ? { free } : {}),
      });
    const snapped = at(87);
    expect(snapped.snapped).toBe(true);
    expect(snapped.angle).toBe(90);
    expect(snapped.delta).toBeCloseTo(90);
    const freeSpin = at(84);
    expect(freeSpin.snapped).toBe(false);
    expect(freeSpin.angle).toBeCloseTo(84);
    // shift (free) bypasses even in range
    expect(at(87, true).snapped).toBe(false);
  });

  it('rotation snap targets the absolute angle: base 45° + raw 43° locks to 90°', () => {
    const m = seeded(seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }, 45));
    const pivot = { x: 150, y: 150 };
    const start = { x: 150, y: 50 };
    const r = rotateDraftDelta(m, {
      g: 'rotate',
      ids: ['s1'],
      pivot,
      start,
      cur: curFor(pivot, start, 43),
    });
    expect(r.angle).toBe(90);
    expect(r.delta).toBeCloseTo(45); // raw 43 + adjust 2
  });

  it('a rotate gesture commits the snapped angle and shows the chip while live', () => {
    const m0 = seeded(seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }));
    const pivot = { x: 150, y: 150 };
    const start = { x: 150, y: 50 };
    const live: Model = {
      ...m0,
      selected: ['s1'],
      draft: { g: 'rotate', ids: ['s1'], pivot, start, cur: curFor(pivot, start, 88) },
    };
    const chip = chrome(live, PON).find((n) => n.kind === 'angle-chip');
    expect(chip).toMatchObject({ kind: 'angle-chip', angle: 90 });
    const [m, fx] = update(live, editPtr('up', 0, 0));
    expect(fx).toEqual([{ fx: 'patch', id: 's1', scope: { kind: 'geometry' } }]);
    expect(geomRotation(m.byId['s1'].geom)).toBeCloseTo(90);
    expect(chrome(m, PON).some((n) => n.kind === 'angle-chip')).toBe(false);
  });

  it('custom rotation angles + threshold are honoured; rotation:false disables', () => {
    const base = seeded(seededSquare('s1', { x: 100, y: 100, width: 100, height: 100 }));
    const pivot = { x: 150, y: 150 };
    const start = { x: 150, y: 50 };
    const draft = (deg: number) => ({
      g: 'rotate' as const,
      ids: ['s1'],
      pivot,
      start,
      cur: curFor(pivot, start, deg),
    });
    const m30 = { ...base, snap: { ...base.snap, rotationAngles: [30], rotationThreshold: 3 } };
    expect(rotateDraftDelta(m30, draft(28)).angle).toBe(30);
    expect(rotateDraftDelta(m30, draft(88)).snapped).toBe(false);
    const off = update(base, { t: 'setSnap', patch: { rotation: false } })[0];
    expect(rotateDraftDelta(off, draft(89)).snapped).toBe(false);
  });

  it('rotatedHandleCursor: rot 0 reproduces the axis-aligned map, then turns with the box', () => {
    // at 0° the sector mapping IS the old RECT_CURSOR table
    expect(rotatedHandleCursor('n', 0)).toBe('ns-resize');
    expect(rotatedHandleCursor('s', 0)).toBe('ns-resize');
    expect(rotatedHandleCursor('e', 0)).toBe('ew-resize');
    expect(rotatedHandleCursor('w', 0)).toBe('ew-resize');
    expect(rotatedHandleCursor('nw', 0)).toBe('nwse-resize');
    expect(rotatedHandleCursor('se', 0)).toBe('nwse-resize');
    expect(rotatedHandleCursor('ne', 0)).toBe('nesw-resize');
    expect(rotatedHandleCursor('sw', 0)).toBe('nesw-resize');
    // at 90° the box's east handle points SOUTH on screen → vertical resize
    expect(rotatedHandleCursor('e', 90)).toBe('ns-resize');
    expect(rotatedHandleCursor('n', 90)).toBe('ew-resize');
    // at 45° the corners land on the axes, the edges on the diagonals
    expect(rotatedHandleCursor('nw', 45)).toBe('ns-resize');
    expect(rotatedHandleCursor('n', 45)).toBe('nesw-resize');
  });

  it('geomHandles carries rotation-aware cursors (the hover-cursor fix)', () => {
    const g: Geom = { t: 'rect', rect: { x: 0, y: 0, width: 100, height: 50 }, ellipse: false };
    const flat = Object.fromEntries(geomHandles(g).map((h) => [h.id, h.cursor]));
    expect(flat['e']).toBe('ew-resize');
    const turned = Object.fromEntries(geomHandles({ ...g, rot: 90 }).map((h) => [h.id, h.cursor]));
    expect(turned['e']).toBe('ns-resize'); // physically at the bottom now
    expect(turned['n']).toBe('ew-resize'); // physically at the right now
  });
});

/**
 * The rotate knob is PAGE-BOUND chrome: annotations, gestures and selection UI
 * all live inside the page, and pointer dispatch resolves pages by containment —
 * an off-page knob would render but never receive a hit. `placeRotateKnob` owns
 * the placement policy (top edge → FLIP below → CLAMP inside) and BOTH render
 * (`chrome`) and hit-test (`hitTest`) place the knob through it, so "what you
 * see is what you can grab" holds by construction. The placement decision is
 * made AT REST; a live rotate rides it rigidly and re-decides only on release.
 */
describe('page-bound rotate knob', () => {
  // US-Letter content box, origin at the crop top-left.
  const BOX = { x: 0, y: 0, width: 612, height: 792 };
  const K = 24; // ROTATE_KNOB_OFFSET
  type Box = { x: number; y: number; width: number; height: number };
  const corners = (r: Box): [Vec, Vec, Vec, Vec] => [
    { x: r.x, y: r.y },
    { x: r.x + r.width, y: r.y },
    { x: r.x + r.width, y: r.y + r.height },
    { x: r.x, y: r.y + r.height },
  ];
  const inside = (p: Vec) => {
    expect(p.x).toBeGreaterThanOrEqual(BOX.x);
    expect(p.x).toBeLessThanOrEqual(BOX.x + BOX.width);
    expect(p.y).toBeGreaterThanOrEqual(BOX.y);
    expect(p.y).toBeLessThanOrEqual(BOX.y + BOX.height);
  };
  // Stamps: rotatable + opaqueBody (grabbable anywhere inside), so one click at
  // the centre selects regardless of the shape's rotation.
  const stampAt = (id: string, rect: Box, rot = 0, n = 900): Annot => ({
    id,
    ref: { kind: 'objectNumber', pageObjectNumber: PON, annotObjectNumber: n },
    pon: PON,
    subtype: 'stamp',
    geom: { t: 'rect', rect: { ...rect }, ellipse: false, ...(rot ? { rot } : {}) },
    style: {
      color: '#000000',
      interiorColor: null,
      strokeWidth: 1,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    flags: DRAWN_FLAGS,
    source: 'baked',
    apBox: { ...rect },
  });
  const loadSelect = (rect: Box, rot = 0): Model => {
    const m = update(initialModel, { t: 'loaded', annots: [stampAt('S1', rect, rot)] })[0];
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return run(m, [editPtr('down', cx, cy), editPtr('up', cx, cy)]);
  };
  // editPointer with the page box on the input — what the plugin always sends.
  const editB = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
    t: 'editPointer',
    phase,
    in: { pon: PON, point: { x, y }, shift: false, pageBox: BOX },
  });

  it('placeRotateKnob: top → flip → clamp, and total (always on-page)', () => {
    // fits — identical to the raw knob, hanging off the top edge
    const fits = corners({ x: 100, y: 100, width: 100, height: 50 });
    expect(placeRotateKnob(fits, K, BOX)).toEqual(rotateKnob(fits, K));
    expect(placeRotateKnob(fits, K, BOX).at).toEqual({ x: 150, y: 76 });
    // flip — the top stalk exits the page: hang off the BOTTOM edge instead
    const nearTop = corners({ x: 100, y: 10, width: 100, height: 50 });
    expect(placeRotateKnob(nearTop, K, BOX)).toEqual({
      at: { x: 150, y: 84 },
      from: { x: 150, y: 60 },
    });
    // clamp — BOTH stalks exit (a ~full-page shape): pin the top candidate
    const tall = corners({ x: 100, y: 10, width: 100, height: 772 });
    expect(placeRotateKnob(tall, K, BOX)).toEqual({
      at: { x: 150, y: 0 },
      from: { x: 150, y: 10 },
    });
    // a 90°-turned OBB near the right edge flips through the SIDE it exited
    const turned: [Vec, Vec, Vec, Vec] = [
      { x: 590, y: 282 },
      { x: 590, y: 378 },
      { x: 530, y: 378 },
      { x: 530, y: 282 },
    ];
    expect(placeRotateKnob(turned, K, BOX)).toEqual({
      at: { x: 506, y: 330 },
      from: { x: 530, y: 330 },
    });
    // no pageBox → the raw knob (unclamped, back-compatible)
    expect(placeRotateKnob(nearTop, K)).toEqual(rotateKnob(nearTop, K));
  });

  it('flips below a shape near the page top — and the flipped point IS the hit target', () => {
    const m = loadSelect({ x: 100, y: 10, width: 100, height: 50 });
    // unbounded placement would float above the page (the unreachable spot)
    expect(selectionKnob(m, PON)!.at.y).toBeLessThan(0);
    const knob = selectionKnob(m, PON, BOX)!;
    expect(knob.at.y).toBeGreaterThan(60); // hangs BELOW the shape now
    inside(knob.at);
    // chrome draws it exactly there…
    const node = chrome(m, PON, BOX).find((n) => n.kind === 'rotate-knob');
    expect(node?.kind).toBe('rotate-knob');
    if (node?.kind === 'rotate-knob') expect(node.at).toEqual(knob.at);
    // …and the hit-test grabs it exactly there (WYSIWYG)
    expect(hitTest(m, PON, knob.at, DEFAULT_CHROME_GEOM, m.hitMargin, BOX).t).toBe('rotate');
  });

  it('chrome and hitTest agree everywhere: the knob is always on-page and always grabbable', () => {
    const cases = [
      { rect: { x: 100, y: 100, width: 100, height: 50 }, rot: 0 }, // fits
      { rect: { x: 100, y: 10, width: 100, height: 50 }, rot: 0 }, // flip below
      { rect: { x: 100, y: 4, width: 100, height: 784 }, rot: 0 }, // clamp
      { rect: { x: 512, y: 300, width: 96, height: 60 }, rot: 90 }, // side exit → side flip
      { rect: { x: 100, y: 8, width: 100, height: 50 }, rot: 30 },
      { rect: { x: 2, y: 300, width: 100, height: 60 }, rot: 270 },
    ];
    for (const c of cases) {
      const m = loadSelect(c.rect, c.rot);
      const node = chrome(m, PON, BOX).find((n) => n.kind === 'rotate-knob');
      expect(node?.kind, JSON.stringify(c)).toBe('rotate-knob');
      if (node?.kind !== 'rotate-knob') continue;
      inside(node.at);
      expect(
        hitTest(m, PON, node.at, DEFAULT_CHROME_GEOM, m.hitMargin, BOX).t,
        JSON.stringify(c),
      ).toBe('rotate');
    }
  });

  it('a group near the page top flips its knob below the union box', () => {
    let m = update(initialModel, {
      t: 'loaded',
      annots: [
        stampAt('S1', { x: 100, y: 5, width: 60, height: 40 }, 0, 901),
        stampAt('S2', { x: 200, y: 5, width: 60, height: 40 }, 0, 902),
      ],
    })[0];
    m = run(m, [
      editPtr('down', 130, 25),
      editPtr('up', 130, 25),
      editPtr('down', 230, 25, true), // shift-click adds S2
      editPtr('up', 230, 25, true),
    ]);
    expect([...m.selected].sort()).toEqual(['S1', 'S2']);
    const knob = selectionKnob(m, PON, BOX)!;
    expect(knob.at.y).toBeGreaterThan(45); // below the union bottom
    inside(knob.at);
    const t = hitTest(m, PON, knob.at, DEFAULT_CHROME_GEOM, m.hitMargin, BOX);
    expect(t.t).toBe('rotate');
    if (t.t === 'rotate') expect([...t.ids].sort()).toEqual(['S1', 'S2']);
  });

  it('grabbing a flipped knob does not move it; it rides the turn rigidly and settles on release', () => {
    let m = loadSelect({ x: 100, y: 10, width: 100, height: 50 });
    const rest = selectionKnob(m, PON, BOX)!; // flipped below the shape
    m = run(m, [editB('down', rest.at.x, rest.at.y)]);
    const draft = m.draft;
    if (draft?.g !== 'rotate') throw new Error('expected a rotate draft');
    // zero jump at grab
    const grabbed = selectionKnob(m, PON, BOX)!;
    expect(grabbed.at.x).toBeCloseTo(rest.at.x, 6);
    expect(grabbed.at.y).toBeCloseTo(rest.at.y, 6);
    // quarter turn: the grab point hangs SOUTH of the pivot; drag the cursor EAST
    const pivot = draft.pivot;
    m = run(m, [editB('move', pivot.x + 100, pivot.y)]);
    const live = selectionKnob(m, PON, BOX)!;
    // the knob rode the −90° turn rigidly: south of the pivot → east of the pivot
    expect(live.at.x).toBeCloseTo(pivot.x + (rest.at.y - pivot.y), 4);
    expect(live.at.y).toBeCloseTo(pivot.y, 4);
    // release: the policy re-decides ONCE, on the settled orientation
    m = run(m, [editB('up', pivot.x + 100, pivot.y)]);
    expect(m.draft).toBeNull();
    inside(selectionKnob(m, PON, BOX)!.at);
  });

  it('ChromeGeom: knob and handle grab zones are independent; the offset is configurable', () => {
    const m = loadSelect({ x: 100, y: 100, width: 100, height: 50 });
    // knob at (150, ~75.5); a point ~10 above it hits with knobTol 12, not 6
    const knob = selectionKnob(m, PON, BOX)!;
    const near = { x: knob.at.x, y: knob.at.y - 10 };
    const wide = { ...DEFAULT_CHROME_GEOM, knobTol: 12 };
    expect(hitTest(m, PON, near, DEFAULT_CHROME_GEOM, m.hitMargin, BOX).t).not.toBe('rotate');
    expect(hitTest(m, PON, near, wide, m.hitMargin, BOX).t).toBe('rotate');
    // …while the handle zone is untouched: 10 off the SE handle misses either way
    const offHandle = { x: 210, y: 150 };
    expect(hitTest(m, PON, offHandle, wide, m.hitMargin, BOX).t).not.toBe('handle');
    // a custom offset moves the DRAWN knob and the HIT target together
    const far = { ...DEFAULT_CHROME_GEOM, knobOffset: 48 };
    const node = chrome(m, PON, BOX, 48).find((n) => n.kind === 'rotate-knob');
    expect(node?.kind).toBe('rotate-knob');
    if (node?.kind !== 'rotate-knob') return;
    expect(knob.at.y - node.at.y).toBeCloseTo(24, 4); // 48 − 24 further out
    expect(hitTest(m, PON, node.at, far, m.hitMargin, BOX).t).toBe('rotate');
  });
});

/**
 * The rotate-mode chrome switch (v2 behaviour, structural): while a rotate
 * gesture runs, the guides own the page — full-bleed chords through the pivot
 * (a fixed 0°/90° reference cross + the live indicator on the SAME snapped
 * angle rule as the chip/commit) — and the handles, knob, and menu anchor are
 * suppressed. Release restores everything.
 */
describe('rotate guides (live rotate chrome mode)', () => {
  const BOX = { x: 0, y: 0, width: 612, height: 792 };
  type Box = { x: number; y: number; width: number; height: number };
  const inside = (p: Vec) => {
    expect(p.x).toBeGreaterThanOrEqual(BOX.x - 1e-9);
    expect(p.x).toBeLessThanOrEqual(BOX.x + BOX.width + 1e-9);
    expect(p.y).toBeGreaterThanOrEqual(BOX.y - 1e-9);
    expect(p.y).toBeLessThanOrEqual(BOX.y + BOX.height + 1e-9);
  };
  const stampAt = (rect: Box): Annot => ({
    id: 'S1',
    ref: { kind: 'objectNumber', pageObjectNumber: PON, annotObjectNumber: 900 },
    pon: PON,
    subtype: 'stamp',
    geom: { t: 'rect', rect: { ...rect }, ellipse: false },
    style: {
      color: '#000000',
      interiorColor: null,
      strokeWidth: 1,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    flags: DRAWN_FLAGS,
    source: 'baked',
    apBox: { ...rect },
  });
  const loadSelect = (rect: Box): Model => {
    const m = update(initialModel, { t: 'loaded', annots: [stampAt(rect)] })[0];
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    return run(m, [editPtr('down', cx, cy), editPtr('up', cx, cy)]);
  };
  const editB = (phase: 'down' | 'move' | 'up', x: number, y: number): Msg => ({
    t: 'editPointer',
    phase,
    in: { pon: PON, point: { x, y }, shift: false, pageBox: BOX },
  });

  it('chordThrough: full-bleed chords of a box through a point', () => {
    // horizontal / vertical through an interior point
    expect(chordThrough(BOX, { x: 150, y: 35 }, 0)).toEqual({
      a: { x: 0, y: 35 },
      b: { x: 612, y: 35 },
    });
    const v = chordThrough(BOX, { x: 150, y: 35 }, 90)!;
    expect(v.a.x).toBeCloseTo(150);
    expect(v.a.y).toBeCloseTo(0);
    expect(v.b.x).toBeCloseTo(150);
    expect(v.b.y).toBeCloseTo(792);
    // 45° through the centre exits through the left/right edges
    const d = chordThrough(BOX, { x: 306, y: 396 }, 45)!;
    expect(d.a.x).toBeCloseTo(0);
    expect(d.a.y).toBeCloseTo(90);
    expect(d.b.x).toBeCloseTo(612);
    expect(d.b.y).toBeCloseTo(702);
    // a line parallel to an edge but outside the box misses entirely
    expect(chordThrough(BOX, { x: -50, y: -50 }, 0)).toBeNull();
    expect(chordThrough(BOX, { x: -1000, y: 500 }, 90)).toBeNull();
  });

  it('a live rotate switches chrome to guides mode; release restores it', () => {
    let m = loadSelect({ x: 200, y: 300, width: 100, height: 50 });
    // at rest: knob + handles, no guides, menu anchored
    const rest = chrome(m, PON, BOX);
    expect(rest.some((n) => n.kind === 'rotate-knob')).toBe(true);
    expect(rest.some((n) => n.kind === 'handle')).toBe(true);
    expect(rest.some((n) => n.kind === 'rotate-guides')).toBe(false);
    expect(selectionAnchor(m)).not.toBeNull();
    // grab the knob → guides mode
    const knob = selectionKnob(m, PON, BOX)!;
    m = run(m, [editB('down', knob.at.x, knob.at.y)]);
    const draft = m.draft;
    if (draft?.g !== 'rotate') throw new Error('expected a rotate draft');
    const live = chrome(m, PON, BOX);
    expect(live.some((n) => n.kind === 'rotate-knob')).toBe(false);
    expect(live.some((n) => n.kind === 'handle')).toBe(false);
    expect(selectionAnchor(m)).toBeNull(); // menu hides while rotating
    const g = live.find((n) => n.kind === 'rotate-guides');
    expect(g?.kind).toBe('rotate-guides');
    if (g?.kind !== 'rotate-guides') throw new Error('guides node expected');
    expect(g.center).toEqual(draft.pivot);
    expect(g.lines.filter((l) => l.role === 'axis')).toHaveLength(2);
    expect(g.lines.filter((l) => l.role === 'indicator')).toHaveLength(1);
    for (const l of g.lines) {
      inside(l.a); // page chords: every endpoint on the page
      inside(l.b);
    }
    // quarter turn (snaps to 270): the indicator rides the SAME angle rule as
    // the chip — it turns vertical through the pivot
    const pivot = draft.pivot;
    m = run(m, [editB('move', pivot.x + 100, pivot.y)]);
    const live2 = chrome(m, PON, BOX);
    const g2 = live2.find((n) => n.kind === 'rotate-guides');
    const chip = live2.find((n) => n.kind === 'angle-chip');
    if (g2?.kind !== 'rotate-guides' || chip?.kind !== 'angle-chip') throw new Error();
    expect(Math.round(g2.angle)).toBe(chip.angle);
    const ind = g2.lines.find((l) => l.role === 'indicator')!;
    expect(ind.a.x).toBeCloseTo(pivot.x, 4);
    expect(ind.b.x).toBeCloseTo(pivot.x, 4);
    // release: guides gone, knob + handles + menu anchor return
    m = run(m, [editB('up', pivot.x + 100, pivot.y)]);
    const settled = chrome(m, PON, BOX);
    expect(settled.some((n) => n.kind === 'rotate-guides')).toBe(false);
    expect(settled.some((n) => n.kind === 'rotate-knob')).toBe(true);
    expect(settled.some((n) => n.kind === 'handle')).toBe(true);
    expect(selectionAnchor(m)).not.toBeNull();
  });
});

/**
 * Group chrome rides live gestures: the multi-selection's union outline, its
 * handles, and its rotate knob follow the DRAFT-EFFECTIVE geometry, exactly
 * like single-selection chrome — the outline must never park at the committed
 * union while the members slide away, then teleport on release.
 */
describe('group chrome rides live gestures', () => {
  type Box = { x: number; y: number; width: number; height: number };
  const stampAt = (id: string, rect: Box, n: number): Annot => ({
    id,
    ref: { kind: 'objectNumber', pageObjectNumber: PON, annotObjectNumber: n },
    pon: PON,
    subtype: 'stamp',
    geom: { t: 'rect', rect: { ...rect }, ellipse: false },
    style: {
      color: '#000000',
      interiorColor: null,
      strokeWidth: 1,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    flags: DRAWN_FLAGS,
    source: 'baked',
    apBox: { ...rect },
  });
  /** Two stamps side by side, both selected (click + shift-click). */
  const loadPair = (): Model => {
    const m = update(initialModel, {
      t: 'loaded',
      annots: [
        stampAt('S1', { x: 100, y: 100, width: 60, height: 50 }, 901),
        stampAt('S2', { x: 200, y: 100, width: 60, height: 50 }, 902),
      ],
    })[0];
    return run(m, [
      editPtr('down', 130, 125),
      editPtr('up', 130, 125),
      editPtr('down', 230, 125, true),
      editPtr('up', 230, 125, true),
    ]);
  };
  const outlineOf = (nodes: ReturnType<typeof chrome>) => {
    const o = nodes.find((n) => n.kind === 'outline');
    if (o?.kind !== 'outline') throw new Error('outline expected');
    return o.rect;
  };

  it('the union outline, handles, and knob follow a live group move — and do not jump on release', () => {
    let m = loadPair();
    const rest = chrome(m, PON);
    const restOutline = outlineOf(rest);
    const restHandles = rest.filter((n) => n.kind === 'handle');
    const restKnob = rest.find((n) => n.kind === 'rotate-knob');
    expect(restHandles.length).toBeGreaterThan(0);
    expect(restKnob?.kind).toBe('rotate-knob');
    // arm a move on S1's body and drag +40/+25 WITHOUT releasing
    m = run(m, [editPtr('down', 130, 125), editPtr('move', 170, 150)]);
    expect(m.draft?.g).toBe('move');
    const live = chrome(m, PON);
    // outline = the rest union translated by exactly the live delta
    expect(outlineOf(live)).toEqual({
      ...restOutline,
      x: restOutline.x + 40,
      y: restOutline.y + 25,
    });
    // every group handle rode along…
    const liveHandles = live.filter((n) => n.kind === 'handle');
    expect(liveHandles).toHaveLength(restHandles.length);
    liveHandles.forEach((h, i) => {
      const r = restHandles[i];
      if (h.kind !== 'handle' || r.kind !== 'handle') throw new Error();
      expect(h.at.x).toBeCloseTo(r.at.x + 40, 6);
      expect(h.at.y).toBeCloseTo(r.at.y + 25, 6);
    });
    // …and so did the rotate knob
    const liveKnob = live.find((n) => n.kind === 'rotate-knob');
    if (liveKnob?.kind !== 'rotate-knob' || restKnob?.kind !== 'rotate-knob') throw new Error();
    expect(liveKnob.at.x).toBeCloseTo(restKnob.at.x + 40, 6);
    expect(liveKnob.at.y).toBeCloseTo(restKnob.at.y + 25, 6);
    // release: the committed outline IS the live outline — no teleport
    m = run(m, [editPtr('up', 170, 150)]);
    expect(m.draft).toBeNull();
    expect(outlineOf(chrome(m, PON))).toEqual(outlineOf(live));
  });

  it('the union outline follows a live group scale', () => {
    let m = loadPair();
    const restOutline = outlineOf(chrome(m, PON));
    // grab the union's SE group handle and drag +50/+30 WITHOUT releasing
    const se = { x: restOutline.x + restOutline.width, y: restOutline.y + restOutline.height };
    m = run(m, [editPtr('down', se.x, se.y), editPtr('move', se.x + 50, se.y + 30)]);
    expect(m.draft?.g).toBe('group');
    const liveOutline = outlineOf(chrome(m, PON));
    // the box grew live (stroke padding stays constant, hence the tolerance)
    expect(liveOutline.x).toBeCloseTo(restOutline.x, 1);
    expect(liveOutline.y).toBeCloseTo(restOutline.y, 1);
    expect(Math.abs(liveOutline.width - (restOutline.width + 50))).toBeLessThan(2);
    expect(Math.abs(liveOutline.height - (restOutline.height + 30))).toBeLessThan(2);
    // release: committed == live, no jump
    m = run(m, [editPtr('up', se.x + 50, se.y + 30)]);
    expect(outlineOf(chrome(m, PON))).toEqual(liveOutline);
  });
});

/**
 * The marquee selects what its rectangle touches of the ORIENTED selection
 * quad — the same quad the chrome outlines and the grab region uses (exact,
 * via SAT). Regression: it used to test the AABB of that quad, whose empty
 * corners cover most of a tilted shape's UNROTATED footprint — so a marquee
 * over where the shape visibly wasn't (including its pre-rotation position)
 * still selected it.
 */
describe('marquee vs rotated shapes', () => {
  // A thin 200×20 bar rotated 45° about its centre (200,110): it occupies the
  // diagonal band from ≈(129,39) to ≈(271,181) and nothing else. Its rotated
  // AABB spans ≈(122..278, 32..188).
  const bar: Annot = {
    id: 'R1',
    ref: { kind: 'objectNumber', pageObjectNumber: PON, annotObjectNumber: 900 },
    pon: PON,
    subtype: 'square',
    geom: { t: 'rect', rect: { x: 100, y: 100, width: 200, height: 20 }, ellipse: false, rot: 45 },
    style: {
      color: '#e5484d',
      interiorColor: null,
      strokeWidth: 2,
      opacity: 1,
      blendMode: 'normal',
      border: { kind: 'solid' },
    },
    flags: DRAWN_FLAGS,
    source: 'vector',
  };
  const m = update(initialModel, { t: 'loaded', annots: [bar] })[0];

  it('quadIntersectsRect: SAT on the four candidate axes', () => {
    // axis-aligned quad ≡ rectsIntersect semantics, touching counts
    const aligned: [Vec, Vec, Vec, Vec] = [
      { x: 10, y: 10 },
      { x: 50, y: 10 },
      { x: 50, y: 40 },
      { x: 10, y: 40 },
    ];
    expect(quadIntersectsRect(aligned, { x: 40, y: 30, width: 30, height: 30 })).toBe(true);
    expect(quadIntersectsRect(aligned, { x: 50, y: 40, width: 10, height: 10 })).toBe(true); // touch
    expect(quadIntersectsRect(aligned, { x: 51, y: 41, width: 10, height: 10 })).toBe(false);
    // containment both ways
    const diamond: [Vec, Vec, Vec, Vec] = [
      { x: 100, y: 50 },
      { x: 150, y: 100 },
      { x: 100, y: 150 },
      { x: 50, y: 100 },
    ];
    expect(quadIntersectsRect(diamond, { x: 95, y: 95, width: 10, height: 10 })).toBe(true); // rect inside quad
    expect(quadIntersectsRect(diamond, { x: 0, y: 0, width: 300, height: 300 })).toBe(true); // quad inside rect
    // the case only a QUAD axis separates: a rect in the diamond's AABB corner
    // overlaps on x and y, but not across the diamond's tilted edge
    expect(quadIntersectsRect(diamond, { x: 52, y: 52, width: 20, height: 20 })).toBe(false);
  });

  it('a marquee in the rotated AABB empty corner or over the unrotated footprint selects NOTHING', () => {
    // empty AABB corner — visually nowhere near the bar (used to select R1)
    expect(annotsInBox(m, PON, { x: 250, y: 35 }, { x: 270, y: 55 })).toEqual([]);
    // where the UNROTATED shape used to be (used to select R1 — the report)
    expect(annotsInBox(m, PON, { x: 125, y: 95 }, { x: 140, y: 110 })).toEqual([]);
    // the OTHER empty AABB corner (below the NW→SE bar) — also nothing
    expect(annotsInBox(m, PON, { x: 120, y: 160 }, { x: 150, y: 190 })).toEqual([]);
    // crossing the tilted bar → selected
    expect(annotsInBox(m, PON, { x: 190, y: 100 }, { x: 210, y: 120 })).toEqual(['R1']);
    // clipping just the bar's NW tip (corners ≈ (136,31)/(121,46)) → selected
    expect(annotsInBox(m, PON, { x: 120, y: 30 }, { x: 140, y: 50 })).toEqual(['R1']);
    // fully outside everything
    expect(annotsInBox(m, PON, { x: 400, y: 40 }, { x: 430, y: 70 })).toEqual([]);
  });

  it('unrotated shapes behave exactly as before', () => {
    const flat = update(initialModel, {
      t: 'loaded',
      annots: [
        {
          ...bar,
          geom: { t: 'rect', rect: { x: 100, y: 100, width: 200, height: 20 }, ellipse: false },
        },
      ],
    })[0];
    expect(annotsInBox(flat, PON, { x: 90, y: 90 }, { x: 110, y: 110 })).toEqual(['R1']); // corner overlap
    expect(annotsInBox(flat, PON, { x: 90, y: 130 }, { x: 110, y: 150 })).toEqual([]); // below it
  });
});

describe('upright creation (counter-rotating the display rotation)', () => {
  // The draw handler's DOWN sample under a rotated display: the tool's
  // `upright` policy + the page's total display rotation ride the input bag.
  const uprightPtr = (
    subtype: 'square' | 'circle' | 'free-text',
    phase: 'down' | 'move' | 'up',
    x: number,
    y: number,
    extra: { displayRotation?: 0 | 90 | 180 | 270; upright?: boolean } = {},
  ): Msg => ({
    t: 'createPointer',
    phase,
    subtype,
    in: { pon: PON, point: { x, y }, shift: false, ...extra },
  });
  const textGeom = (g: Geom) => (g.t === 'text' ? g : null);

  it('helpers: a quarter-turn about the centre lands exactly back on the source box', () => {
    const dragged = { x: 50, y: 60, width: 120, height: 40 };
    const t = transposedAboutCenter(dragged);
    // same centre, w↔h swapped…
    expect(t).toEqual({ x: 90, y: 20, width: 40, height: 120 });
    // …so its rotated AABB IS the dragged box again (what the author drew stays)
    expectRectClose(rotatedAabb(t, 270), dragged);
    expectRectClose(rotatedAabb(t, 90), dragged);
  });

  it('helpers: uprightAnchoredRect anchors the display-frame top-left at the click', () => {
    const anchor = { x: 100, y: 200 };
    for (const r of [90, 180, 270] as const) {
      const rect = uprightAnchoredRect(anchor, 180, 40, r);
      expect(rect.width).toBe(180);
      expect(rect.height).toBe(40);
      const aabb = rotatedAabb(rect, uprightRotation(r));
      // the AABB corner that DISPLAYS as top-left under rotation r sits at the click
      const corner =
        r === 90
          ? { x: aabb.x, y: aabb.y + aabb.height } // (min x, max y)
          : r === 180
            ? { x: aabb.x + aabb.width, y: aabb.y + aabb.height } // (max x, max y)
            : { x: aabb.x + aabb.width, y: aabb.y }; // 270: (max x, min y)
      expect(corner.x).toBeCloseTo(anchor.x);
      expect(corner.y).toBeCloseTo(anchor.y);
    }
    // rotation 0 degenerates to the plain top-left box
    expect(uprightAnchoredRect(anchor, 180, 40, 0)).toEqual({
      x: 100,
      y: 200,
      width: 180,
      height: 40,
    });
  });

  it('click free-text at displayRotation 90 → default box counter-rotated + display-anchored', () => {
    const m = run(initialModel, [
      uprightPtr('free-text', 'down', 100, 200, { displayRotation: 90, upright: true }),
      uprightPtr('free-text', 'up', 100, 200),
    ]);
    const g = textGeom(m.byId[m.order[0]].geom)!;
    expect(g.rot).toBe(270); // -90 → reads horizontally on the 90°-rotated page
    expect(g.rect).toEqual({ x: 30, y: 90, width: 180, height: 40 }); // display-frame anchor
    // its rotated footprint hangs off the click exactly like the 0° box does on screen
    expectRectClose(rotatedAabb(g.rect, g.rot!), { x: 100, y: 20, width: 40, height: 180 });
  });

  it('dragged free-text under upright keeps the dragged on-screen footprint (transposed box)', () => {
    const m = run(initialModel, [
      uprightPtr('free-text', 'down', 50, 60, { displayRotation: 90, upright: true }),
      uprightPtr('free-text', 'move', 170, 100),
      uprightPtr('free-text', 'up', 170, 100),
    ]);
    const g = textGeom(m.byId[m.order[0]].geom)!;
    expect(g.rot).toBe(270);
    expect(g.rect).toEqual({ x: 90, y: 20, width: 40, height: 120 }); // transposed about centre
    expectRectClose(rotatedAabb(g.rect, g.rot!), { x: 50, y: 60, width: 120, height: 40 }); // = dragged
  });

  it('180° needs no transpose: the dragged box is kept, only rot applies', () => {
    const m = run(initialModel, [
      uprightPtr('free-text', 'down', 50, 60, { displayRotation: 180, upright: true }),
      uprightPtr('free-text', 'move', 170, 100),
      uprightPtr('free-text', 'up', 170, 100),
    ]);
    const g = textGeom(m.byId[m.order[0]].geom)!;
    expect(g.rot).toBe(180);
    expect(g.rect).toEqual({ x: 50, y: 60, width: 120, height: 40 });
  });

  it('a box SHAPE tool opting in gets the same treatment (square under 270)', () => {
    const m = run(initialModel, [
      uprightPtr('square', 'down', 10, 10, { displayRotation: 270, upright: true }),
      uprightPtr('square', 'move', 110, 50),
      uprightPtr('square', 'up', 110, 50),
    ]);
    const g = m.byId[m.order[0]].geom;
    expect(g.t).toBe('rect');
    expect(geomRotation(g)).toBe(90); // -270 ≡ 90
    expectRectClose(rotatedAabb(rectGeom(g)!, 90), { x: 10, y: 10, width: 100, height: 40 });
  });

  it('inert without the policy, without the rotation, and when only later phases carry it', () => {
    // displayRotation alone (no upright policy) → plain commit
    const noPolicy = run(initialModel, [
      uprightPtr('free-text', 'down', 100, 200, { displayRotation: 90 }),
      uprightPtr('free-text', 'up', 100, 200),
    ]);
    expect(textGeom(noPolicy.byId[noPolicy.order[0]].geom)!.rot).toBeUndefined();
    // upright at rotation 0 → plain commit (no stored draft noise)
    const flat = run(initialModel, [
      uprightPtr('free-text', 'down', 100, 200, { displayRotation: 0, upright: true }),
      uprightPtr('free-text', 'up', 100, 200),
    ]);
    expect(textGeom(flat.byId[flat.order[0]].geom)!.rect).toEqual({
      x: 100,
      y: 200,
      width: 180,
      height: 40,
    });
    // captured at DOWN only: an up that suddenly claims rotation is ignored
    const lateUp = run(initialModel, [
      uprightPtr('free-text', 'down', 100, 200),
      uprightPtr('free-text', 'up', 100, 200, { displayRotation: 90, upright: true }),
    ]);
    expect(textGeom(lateUp.byId[lateUp.order[0]].geom)!.rot).toBeUndefined();
  });
});

describe('fitStampBox (v2 rubber-stamp sizing: intrinsic, clamped to page)', () => {
  const PAGE = { width: 612, height: 792 }; // US Letter points

  it('keeps the intrinsic size when the image fits the page', () => {
    const box = fitStampBox({ x: 300, y: 400 }, { width: 200, height: 100 }, PAGE, 0);
    expect(box.width).toBe(200);
    expect(box.height).toBe(100);
    // centred on the click
    expect(box.x).toBe(200);
    expect(box.y).toBe(350);
  });

  it('scales an oversized image DOWN to fit, preserving aspect', () => {
    // 1200×600 (2:1) into 612×792: width-bound → s = 612/1200 = 0.51
    const box = fitStampBox({ x: 306, y: 396 }, { width: 1200, height: 600 }, PAGE, 0);
    expect(box.width).toBeCloseTo(612, 3);
    expect(box.height).toBeCloseTo(306, 3);
    expect(box.width / box.height).toBeCloseTo(2, 5); // aspect preserved
  });

  it('clamps the box fully onto the page when placed near an edge', () => {
    // click in the top-left corner: the 200×100 box would spill off (negative x/y)
    const box = fitStampBox({ x: 5, y: 5 }, { width: 200, height: 100 }, PAGE, 0);
    expect(box.x).toBe(0); // shifted fully on-page
    expect(box.y).toBe(0);
    expect(box.width).toBe(200);
    expect(box.height).toBe(100);
    // and near the far corner
    const far = fitStampBox({ x: 610, y: 790 }, { width: 200, height: 100 }, PAGE, 0);
    expect(far.x + far.width).toBeCloseTo(PAGE.width, 3);
    expect(far.y + far.height).toBeCloseTo(PAGE.height, 3);
  });

  it('under an upright quarter-turn, fits by the ROTATED footprint (transposed)', () => {
    // A landscape 1000×250 (4:1) placed upright at 90° (rotCW 270): its on-page
    // footprint is 250×1000 (tall). Fitting THAT into 612×792 is height-bound:
    // s = 792/1000 = 0.792 → logical box 792×198, footprint 198×792 (fits).
    const box = fitStampBox({ x: 306, y: 396 }, { width: 1000, height: 250 }, PAGE, 270);
    expect(box.width).toBeCloseTo(792, 2);
    expect(box.height).toBeCloseTo(198, 2);
    // the footprint (transposed) must fit the page on BOTH axes
    const footprintW = box.height; // quarter-turn swaps
    const footprintH = box.width;
    expect(footprintW).toBeLessThanOrEqual(PAGE.width + 1e-6);
    expect(footprintH).toBeLessThanOrEqual(PAGE.height + 1e-6);
  });

  it('clamps the rotated footprint onto the page near an edge (no spill)', () => {
    // upright 90°, a 300×100 image near the top edge: footprint is 100×300 tall,
    // so the centre must sit ≥150 from the top edge.
    const box = fitStampBox({ x: 306, y: 5 }, { width: 300, height: 100 }, PAGE, 270);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const footprintH = box.width; // 300
    expect(cy).toBeCloseTo(footprintH / 2, 3); // pushed down so the tall footprint fits
    expect(cy - footprintH / 2).toBeGreaterThanOrEqual(-1e-6);
  });
});

describe('apVersion: baked /AP content versioning (what re-fetches a raster)', () => {
  // A committed, selected annot of the given kind. Stamps are opaque-body
  // (visual IS the engine raster, stays baked through edits); squares flip to
  // vector on any geometry edit and render live.
  const committed = (subtype: 'stamp' | 'square'): Model => {
    const a: Annot = {
      id: 'A1',
      ref: { kind: 'objectNumber', annotObjectNumber: 7, pageObjectNumber: PON },
      pon: PON,
      subtype,
      geom: { t: 'rect', rect: { x: 100, y: 100, width: 100, height: 60 }, ellipse: false },
      style: initialStyle,
      flags: DRAWN_FLAGS,
      source: 'baked',
      apBox: { x: 100, y: 100, width: 100, height: 60 },
    };
    return { ...initialModel, byId: { A1: a }, order: ['A1'], selected: ['A1'] };
  };

  it('a stamp MOVE commits a bare patch — the raster is still pixel-exact', () => {
    let m = committed('stamp');
    [m] = update(m, editPtr('down', 150, 130)); // grab the body
    [m] = update(m, editPtr('move', 190, 160));
    const [next, fx] = update(m, editPtr('up', 190, 160));
    expect(fx).toEqual([{ fx: 'patch', id: 'A1', scope: { kind: 'geometry' } }]); // no apChanged flag
    const g = next.byId['A1'].geom;
    expect(g.t === 'rect' && g.rect.x).toBe(140); // moved…
    expect(next.byId['A1'].source).toBe('baked'); // …and still baked
  });

  it('a stamp RESIZE commits apChanged true — the only edit that invalidates a raster', () => {
    let m = committed('stamp');
    [m] = update(m, editPtr('down', 200, 160)); // grab the SE handle
    [m] = update(m, editPtr('move', 240, 190));
    const [next, fx] = update(m, editPtr('up', 240, 190));
    expect(fx).toEqual([{ fx: 'patch', id: 'A1', scope: { kind: 'geometry' }, apChanged: true }]);
    expect(next.byId['A1'].source).toBe('baked'); // opaque-body: no vector render
  });

  it('a stamp rotate90 commits a bare patch — rotation is stripped at the blit', () => {
    const [next, fx] = update(committed('stamp'), { t: 'rotate90' });
    expect(fx).toEqual([{ fx: 'patch', id: 'A1', scope: { kind: 'geometry' } }]);
    expect(next.byId['A1'].source).toBe('baked');
  });

  it('a SQUARE resize/rotate commits a bare patch — it flips to vector and renders live', () => {
    let m = committed('square');
    [m] = update(m, editPtr('down', 200, 160)); // SE handle
    [m] = update(m, editPtr('move', 260, 200));
    const [afterResize, fx1] = update(m, editPtr('up', 260, 200));
    expect(fx1).toEqual([{ fx: 'patch', id: 'A1', scope: { kind: 'geometry' } }]);
    expect(afterResize.byId['A1'].source).toBe('vector');
    const [afterRotate, fx2] = update(committed('square'), { t: 'rotate90' });
    expect(fx2).toEqual([{ fx: 'patch', id: 'A1', scope: { kind: 'geometry' } }]);
    expect(afterRotate.byId['A1'].source).toBe('vector');
  });

  it('upsert bumps apVersion only when it confirms a re-bake, and preserves it otherwise', () => {
    let m = committed('stamp');
    const dto = m.byId['A1']; // stand-in for the DTO-derived annot (same shape)
    // a plain re-sync (a move's round-trip): version untouched
    [m] = update(m, { t: 'upsert', annots: [{ ...dto }] });
    expect(m.byId['A1'].apVersion ?? 0).toBe(0);
    // the resolve of a raster-invalidating patch: version advances…
    [m] = update(m, { t: 'upsert', annots: [{ ...dto }], bumpAp: true });
    expect(m.byId['A1'].apVersion).toBe(1);
    // …and SURVIVES the next plain re-sync (fromDTO knows nothing of it)
    [m] = update(m, { t: 'upsert', annots: [{ ...dto }] });
    expect(m.byId['A1'].apVersion).toBe(1);
  });

  it('select: programmatic selection sets/adds, drops unknown ids (the auto-select path)', () => {
    let m = committed('stamp'); // A1 selected
    m = update(m, { t: 'deselect' })[0];
    m = update(m, { t: 'select', ids: ['A1'] })[0];
    expect(m.selected).toEqual(['A1']);
    // Unknown ids no-op instead of corrupting the selection.
    m = update(m, { t: 'select', ids: ['nope'] })[0];
    expect(m.selected).toEqual(['A1']);
    // `add` extends rather than replaces.
    const b: Annot = { ...m.byId['A1'], id: 'B1', ref: null };
    m = { ...m, byId: { ...m.byId, B1: b }, order: [...m.order, 'B1'] };
    m = update(m, { t: 'select', ids: ['B1'], add: true })[0];
    expect([...m.selected].sort()).toEqual(['A1', 'B1']);
  });

  it('setProps keeps opaque-body kinds BAKED (a widget restyle re-fetches, never flips)', () => {
    const w: Annot = {
      id: 'W1',
      ref: { kind: 'objectNumber', annotObjectNumber: 9, pageObjectNumber: PON },
      pon: PON,
      subtype: 'widget-text',
      geom: { t: 'rect', rect: { x: 10, y: 10, width: 120, height: 24 }, ellipse: false },
      style: initialStyle,
      flags: DRAWN_FLAGS,
      source: 'baked',
      apBox: { x: 10, y: 10, width: 120, height: 24 },
    };
    const m: Model = { ...initialModel, byId: { W1: w }, order: ['W1'], selected: ['W1'] };
    const [next, fx] = update(m, { t: 'setProps', patch: { interiorColor: '#ffd500' } });
    expect(fx).toEqual([
      { fx: 'patch', id: 'W1', scope: { kind: 'props', keys: ['interiorColor'] } },
    ]);
    // Baked stays baked: the widget has no vector render, and leaving `baked`
    // would drop it from appearanceEpoch — its raster would freeze forever.
    expect(next.byId['W1'].source).toBe('baked');
    // …while a SQUARE restyle still flips to vector (renders live).
    const [sq] = update(committed('square'), { t: 'setProps', patch: { color: '#112233' } });
    expect(sq.byId['A1'].source).toBe('vector');
  });

  it('bumpAp advances known ids and no-ops unknown ones (form widget re-bakes)', () => {
    let m = committed('stamp');
    // A sibling PLANE re-baked the /AP (a form value write): the version
    // advances with no new model data at all.
    [m] = update(m, { t: 'bumpAp', ids: ['A1'] });
    expect(m.byId['A1'].apVersion).toBe(1);
    [m] = update(m, { t: 'bumpAp', ids: ['A1'] });
    expect(m.byId['A1'].apVersion).toBe(2);
    // Unknown ids (a widget on a not-yet-loaded page) change nothing.
    const [same] = update(m, { t: 'bumpAp', ids: ['nope'] });
    expect(same).toBe(m);
  });

  it('apSizeChanged: translation and rotation preserve the frame; scaling changes it', () => {
    const box: Geom = { t: 'rect', rect: { x: 10, y: 10, width: 80, height: 40 }, ellipse: false };
    expect(apSizeChanged(box, geomTranslate(box, { x: 25, y: -5 }))).toBe(false);
    expect(apSizeChanged(box, geomRotateAbout(box, { x: 50, y: 30 }, 90))).toBe(false);
    const wider: Geom = {
      t: 'rect',
      rect: { x: 10, y: 10, width: 120, height: 40 },
      ellipse: false,
    };
    expect(apSizeChanged(box, wider)).toBe(true);
  });
});

describe('link prop (attached children in the substrate, read via linkOf)', () => {
  const REF = { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber: 40 } as const;
  const CHILD_REF = { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber: 41 } as const;
  const URI = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;

  const baseStyle = {
    color: '#1d4ed8',
    interiorColor: null,
    strokeWidth: 2,
    opacity: 1,
    blendMode: 'normal',
    border: { kind: 'solid' },
  } as const;

  const committedSquare = (extra?: Partial<Annot>): Annot => ({
    id: 'S1',
    ref: REF,
    pon: PON,
    subtype: 'square',
    geom: { t: 'rect', rect: { x: 10, y: 10, width: 50, height: 40 }, ellipse: false },
    style: { ...baseStyle },
    flags: DRAWN_FLAGS,
    source: 'baked',
    ...extra,
  });

  const withSelected = (a: Annot): Model => {
    const m = update(initialModel, { t: 'loaded', annots: [a] })[0];
    return { ...m, selected: [a.id] };
  };

  it('setProps { link } on a non-link kind emits target-carrying syncLink, writes NOTHING to the model', () => {
    const m = withSelected(committedSquare());
    const [next, fx] = update(m, { t: 'setProps', patch: { link: URI } });
    // Parents store no link value — the committed children are the truth,
    // read back through `linkOf` once the reconciler's writes land.
    expect(next.byId['S1'].link).toBeUndefined();
    // A link-only change is NOT appearance: no patch, no vector flip.
    expect(next.byId['S1'].source).toBe('baked');
    expect(fx).toEqual([{ fx: 'syncLink', id: 'S1', target: URI }]);
  });

  it('setProps { link } plus a style key emits both syncLink and a patch', () => {
    const m = withSelected(committedSquare());
    const [next, fx] = update(m, { t: 'setProps', patch: { link: URI, color: '#00ff00' } });
    expect(next.byId['S1'].style.color).toBe('#00ff00');
    expect(fx).toEqual([
      { fx: 'patch', id: 'S1', scope: { kind: 'props', keys: ['link', 'color'] } },
      { fx: 'syncLink', id: 'S1', target: URI },
    ]);
  });

  it('the link KIND routes its link prop to a plain engine patch (its own /A)', () => {
    const link = committedSquare({ id: 'L1', subtype: 'link', link: null });
    const m = withSelected(link);
    const [next, fx] = update(m, { t: 'setProps', patch: { link: URI } });
    expect(next.byId['L1'].link).toEqual(URI);
    expect(fx).toEqual([{ fx: 'patch', id: 'L1', scope: { kind: 'props', keys: ['link'] } }]);
  });

  it('widgets do not take the link key: no change, no effect', () => {
    const widget = committedSquare({ id: 'W1', subtype: 'widget-text' });
    const m = withSelected(widget);
    const [next, fx] = update(m, { t: 'setProps', patch: { link: URI } });
    expect(next).toBe(m);
    expect(fx).toEqual([]);
  });

  it('authority fuses into the flags gate: no update right → the locked treatment', () => {
    // A record this session may not edit (a colleague's annotation under an
    // `annotations:update:self` grant) renders and behaves EXACTLY like a
    // locked one: selectable, bare outline, no handles, no transforms.
    const foreign = committedSquare({ authority: { update: false, delete: false } });
    expect(annotTransformable(foreign)).toBe(false);
    expect(annotDeletable(foreign)).toBe(false);
    const m = { ...update(initialModel, { t: 'loaded', annots: [foreign] })[0], selected: ['S1'] };
    expect(chrome(m, PON).filter((n) => n.kind === 'handle')).toHaveLength(0);
    // …and deletion refuses through the same split.
    const [next, fx] = update(m, { t: 'delete' });
    expect(next.byId['S1']).toBeDefined();
    expect(fx).toEqual([]);
  });

  it('the authority split is per-action: update without delete, delete without update', () => {
    const updatable = committedSquare({ authority: { update: true, delete: false } });
    expect(annotTransformable(updatable)).toBe(true);
    expect(annotDeletable(updatable)).toBe(false);
    const deletable = committedSquare({ authority: { update: false, delete: true } });
    expect(annotTransformable(deletable)).toBe(false);
    expect(annotDeletable(deletable)).toBe(true);
    // Unstamped (drafts, wildcard local engines) stays fully allowed.
    expect(annotTransformable(committedSquare())).toBe(true);
    expect(annotDeletable(committedSquare())).toBe(true);
  });

  it('an attached link is NOT a visual-group member: single selection, handles, no Ungroup', () => {
    const parent = committedSquare();
    const child: Annot = {
      id: 'C1',
      ref: CHILD_REF,
      pon: PON,
      subtype: 'link',
      geom: { t: 'rect', rect: { x: 10, y: 10, width: 50, height: 40 }, ellipse: false },
      style: { ...baseStyle },
      flags: DRAWN_FLAGS,
      source: 'baked',
      group: 'S1',
      irt: 'S1',
      data: { subtype: 'link', target: URI } as unknown as Annot['data'],
    };
    const loaded = update(initialModel, { t: 'loaded', annots: [parent, child] })[0];
    // The wire mechanism is /RT /Group, but the SEMANTICS are plumbing: the
    // square is no group primary, the selection stays the square alone…
    expect(groupKeyOf(loaded, 'S1')).toBe(null);
    expect(groupKeyOf(loaded, 'C1')).toBe(null);
    expect(expandGroups(loaded, ['S1'])).toEqual(['S1']);
    expect(groupMembers(loaded, 'S1')).toEqual(['S1']);
    // …so the selection chrome shows the full 8 resize handles, exactly as
    // if no link were attached (the bug: a 2-member "group" with no handles).
    const m = { ...loaded, selected: ['S1'] };
    expect(chrome(m, PON).filter((n) => n.kind === 'handle')).toHaveLength(8);
  });

  it('a REAL visual group keeps working; its attached link child stays excluded', () => {
    const primary = committedSquare({ id: 'P1' });
    const sub = committedSquare({
      id: 'P2',
      ref: { kind: 'objectNumber', pageObjectNumber: 1, annotObjectNumber: 42 },
      group: 'P1',
      irt: 'P1',
    });
    const child: Annot = {
      id: 'C1',
      ref: CHILD_REF,
      pon: PON,
      subtype: 'link',
      geom: { t: 'rect', rect: { x: 10, y: 10, width: 50, height: 40 }, ellipse: false },
      style: { ...baseStyle },
      flags: DRAWN_FLAGS,
      source: 'baked',
      group: 'P1',
      irt: 'P1',
      data: { subtype: 'link', target: URI } as unknown as Annot['data'],
    };
    const m = update(initialModel, { t: 'loaded', annots: [primary, sub, child] })[0];
    // The pair is a group; the link child never appears among the members —
    // so the ungroup verb (which walks expandGroups) can never strip its
    // /IRT and orphan it into an unmanaged standalone link.
    expect(groupKeyOf(m, 'P1')).toBe('P1');
    expect(groupMembers(m, 'P1')).toEqual(['P1', 'P2']);
    expect(expandGroups(m, ['P2'])).toEqual(['P1', 'P2']);
  });

  it('deleting a parent also deletes its attached link children (substrate)', () => {
    const parent = committedSquare();
    const child: Annot = {
      id: 'C1',
      ref: CHILD_REF,
      pon: PON,
      subtype: 'link',
      geom: { t: 'rect', rect: { x: 10, y: 10, width: 50, height: 40 }, ellipse: false },
      style: { ...baseStyle },
      flags: DRAWN_FLAGS,
      source: 'baked',
      group: 'S1',
      irt: 'S1',
      data: { subtype: 'link', target: URI } as unknown as Annot['data'],
    };
    const loaded = update(initialModel, { t: 'loaded', annots: [parent, child] })[0];
    // The child is substrate: readable through the lens, absent from paint.
    expect(linkOf(loaded, 'S1')).toEqual(URI);
    expect(pageItems(loaded, PON).some((i) => i.id === 'C1')).toBe(false);
    const m = { ...loaded, selected: ['S1'] };
    const [next, fx] = update(m, { t: 'delete' });
    // Parent AND child leave the model through the ONE uniform delete path.
    expect(next.byId['S1']).toBeUndefined();
    expect(next.byId['C1']).toBeUndefined();
    expect(fx).toEqual([
      { fx: 'delete', ref: REF },
      { fx: 'delete', ref: CHILD_REF },
    ]);
  });

  it('the link kind paints nothing (invisible hit rectangle)', () => {
    const link = committedSquare({ id: 'L1', subtype: 'link', link: URI, source: 'vector' });
    const m = update(initialModel, { t: 'loaded', annots: [link] })[0];
    const item = pageItems(m, PON).find((i) => i.id === 'L1');
    expect(item).toBeTruthy();
    expect(scene(item!)).toEqual([]);
  });
});

describe('conversation plane — replies and review states never reach the page', () => {
  const at = (x: number, y: number): Annot['geom'] => ({
    t: 'rect',
    rect: { x, y, width: 40, height: 30 },
    ellipse: false,
  });
  const annot = (id: string, over: Partial<Annot>): Annot => ({
    id,
    ref: null,
    pon: PON,
    subtype: 'square',
    geom: at(10, 10),
    style: initialModel.style,
    flags: DRAWN_FLAGS,
    source: 'vector',
    ...over,
  });
  const stateData = (state: string | null, stateModel: string | null): Annot['data'] =>
    ({ subtype: 'text', state, stateModel }) as unknown as Annot['data'];

  const root = annot('root', {});
  const reply = annot('reply', { subtype: 'text', geom: at(100, 10), irt: 'root' });
  const subordinate = annot('sub', {
    subtype: 'caret',
    geom: at(200, 10),
    irt: 'root',
    group: 'root',
  });
  const status = annot('status', {
    subtype: 'text',
    geom: at(300, 10),
    data: stateData('accepted', 'review'),
  });
  const model = () =>
    update(initialModel, { t: 'loaded', annots: [root, reply, subordinate, status] })[0];

  it('classifies replies and state annotations; group subordinates stay painted', () => {
    expect(isConversationOnly(root)).toBe(false);
    expect(isConversationOnly(reply)).toBe(true);
    expect(isConversationOnly(subordinate)).toBe(false);
    expect(isConversationOnly(status)).toBe(true);
    // A plain sticky note (no state entries) is a page visual.
    expect(isConversationOnly(annot('note', { subtype: 'text' }))).toBe(false);
    expect(
      isConversationOnly(annot('empty-state', { subtype: 'text', data: stateData('', '') })),
    ).toBe(false);
    // A model-defaulted state (stateModel only) is still a state annotation.
    expect(
      isConversationOnly(annot('model-only', { subtype: 'text', data: stateData(null, 'review') })),
    ).toBe(true);
  });

  it('paintOrder culls the conversation plane (paint AND hit share this cull)', () => {
    expect(paintOrder(model(), PON)).toEqual(['root', 'sub']);
    expect(pageItems(model(), PON).map((i) => i.id)).toEqual(['root', 'sub']);
  });

  it('the marquee cannot sweep up conversation-only annotations', () => {
    // A sweep across every rect: only the page visuals select.
    const m = run(model(), [
      marqueePtr('down', 0, 0),
      marqueePtr('move', 400, 60),
      marqueePtr('up', 400, 60),
    ]);
    expect([...m.selected].sort()).toEqual(['root', 'sub']);
  });
});

describe('callout ↔ AP-generator mirror', () => {
  // Box (200,100)+120×40; tip far left; knee below-left of the box centre →
  // conn = left-edge midpoint (200,120). Same fixture as the callout describe.
  const calloutGeom = (): Extract<Geom, { t: 'text' }> => ({
    t: 'text',
    rect: { x: 200, y: 100, width: 120, height: 40 },
    callout: { tip: { x: 40, y: 60 }, knee: { x: 120, y: 120 }, ending: 'open-arrow' },
  });

  it('the box border insets by half the stroke — ink INSIDE the rect, like squares', () => {
    const nodes = geomScene(calloutGeom(), 6);
    const box = nodes.find((n) => n.kind === 'rect');
    if (box?.kind !== 'rect') throw new Error('expected a rect border node');
    // rect (200,100,120,40) inset by 3: outer edge of the 6-wide stroke lands
    // ON the rect — mirroring GenerateFreeTextAP's `Deflate(half_bw)` and the
    // square/circle convention, so the border never straddles the selection.
    expect(box.rect).toEqual({ x: 203, y: 103, width: 114, height: 34 });
  });

  it("the leader's connection point extends under the border by half the stroke", () => {
    const nodes = geomScene(calloutGeom(), 6);
    const leader = nodes[0];
    if (leader?.kind !== 'poly' || leader.closed) throw new Error('expected the open leader poly');
    // conn (200,120), incoming direction +x → adjusted to (203,120): the line
    // slides under the border ink (the generator's `adjusted_conn`), so no
    // angular gap opens at the box edge.
    expect(leader.points[2]).toEqual({ x: 203, y: 120 });
    // tip + knee untouched
    expect(leader.points[0]).toEqual({ x: 40, y: 60 });
    expect(leader.points[1]).toEqual({ x: 120, y: 120 });
  });

  it('text edit renders the callout fully LIVE — never baked raster + DOM text', () => {
    const callout: Annot = {
      id: 'C1',
      ref: null,
      pon: PON,
      subtype: 'freeText',
      geom: calloutGeom(),
      style: {
        color: '#e07b39',
        interiorColor: '#ffffff',
        strokeWidth: 6,
        opacity: 1,
        blendMode: 'normal',
        border: { kind: 'solid' },
      },
      flags: DRAWN_FLAGS,
      source: 'baked',
    };
    let m = update(initialModel, { t: 'loaded', annots: [callout] })[0];
    // At rest: baked like any shape — one renderer, the engine raster.
    expect(pageItems(m, PON)[0]!.source).toBe('baked');
    expect(textBoxes(m, PON)).toHaveLength(0);

    m = update(m, { t: 'beginTextEdit', id: 'C1' })[0];
    const it = pageItems(m, PON)[0]!;
    // The raster (whose flat bitmap includes the baked TEXT) is replaced by the
    // vector scene; the DOM editor is the ONE text source. Blending the two is
    // exactly the doubled-text bug.
    expect(it.source).toBe('vector');
    expect(textBoxes(m, PON).map((b) => b.id)).toEqual(['C1']);

    m = update(m, { t: 'endTextEdit' })[0];
    expect(pageItems(m, PON)[0]!.source).toBe('baked');
    expect(textBoxes(m, PON)).toHaveLength(0);
  });
});
