import { quadFromRect } from '@embedpdf/core-geometry';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { modelWith, recordOf, step, type RecordInput, STYLE, restyle } from './support';
import { anchoredGeom, anchorModeOf, anchorOf, unanchoredGeom, type ViewEnv } from '../src/anchor';
import {
  DRAWN_FLAGS,
  NO_ANNOTATION_FLAGS,
  annotContentsEditable,
  annotInteractive,
  annotTransformable,
  flagsEqual,
  interactive,
  viewable,
  type AnnotationFlags,
} from '../src/flags';
import { geomBounds, geomRotation } from '../src/geometry';
import { hitTest, isSelectable, paintOrder } from '../src/hit';
import { initialModel, DEFAULT_CHROME_GEOMETRY } from '../src/index';
import type { ModelAnnotation, Shape, Model, Message, Point } from '../src/types';
import { pageItems, chrome, textBoxes } from '../src/view';
import { shapeOf, styleOf } from '../src/record';

const PON = 1;
const PAGE = toPageRef(PON);
const flagsWith = (over: Partial<AnnotationFlags> = {}): AnnotationFlags => ({
  ...NO_ANNOTATION_FLAGS,
  ...over,
});

const square = (
  id: string,
  flags: AnnotationFlags = DRAWN_FLAGS,
  over: Partial<RecordInput> = {},
): ModelAnnotation =>
  recordOf({
    id,
    ref: {
      kind: 'objectNumber',
      page: PAGE,
      objectNumber: Number(id.replace(/\D/g, '') || 7),
    },
    page: PAGE,
    subtype: 'square',
    geometry: {
      kind: 'box',
      box: { x: 100, y: 100, width: 80, height: 60 },
      rotation: 0,
      ellipse: false,
    },
    style: STYLE,
    flags,
    source: 'vector',
    ...over,
  });

const loaded = (annots: ModelAnnotation[]): Model => modelWith(annots);
const run = (model: Model, msgs: Message[]): Model =>
  msgs.reduce((acc, message) => step(acc, message)[0], model);

describe('flag predicates (ISO 32000 Table 167)', () => {
  it('hidden beats everything on screen', () => {
    expect(viewable(flagsWith({ hidden: true }))).toBe(false);
    expect(viewable(flagsWith({ hidden: true, toggleNoView: true }), true)).toBe(false);
    expect(interactive(flagsWith({ hidden: true }))).toBe(false);
  });

  it('noView hides unless toggleNoView + engaged', () => {
    expect(viewable(flagsWith({ noView: true }))).toBe(false);
    expect(viewable(flagsWith({ noView: true, toggleNoView: true }))).toBe(false);
    expect(viewable(flagsWith({ noView: true, toggleNoView: true }), true)).toBe(true);
  });

  it('readOnly is visible but inert; locked stays interactive but frozen', () => {
    const ro = square('a1', flagsWith({ readOnly: true }));
    expect(viewable(ro.annotation)).toBe(true);
    expect(annotInteractive(ro)).toBe(false);
    const lk = square('a2', flagsWith({ locked: true }));
    expect(annotInteractive(lk)).toBe(true);
    expect(annotTransformable(lk)).toBe(false);
    expect(annotContentsEditable(lk)).toBe(true); // locked ≠ lockedContents
  });

  it('lockedContents blocks contents, not geometry', () => {
    const record = square('a3', flagsWith({ lockedContents: true }));
    expect(annotTransformable(record)).toBe(true);
    expect(annotContentsEditable(record)).toBe(false);
  });

  it('widget kinds ignore readOnly (the form layer owns field ReadOnly)', () => {
    const record = square('a4', flagsWith({ readOnly: true }), { subtype: 'widget-text' });
    expect(annotInteractive(record)).toBe(true);
    expect(annotTransformable(record)).toBe(true);
  });

  it('drawn annotations start with print set (Acrobat parity)', () => {
    const model = run(initialModel, [
      {
        type: 'createPointer',
        phase: 'down',
        subtype: 'square',
        in: { page: PAGE, point: { x: 10, y: 10 }, shift: false },
      },
      {
        type: 'createPointer',
        phase: 'move',
        subtype: 'square',
        in: { page: PAGE, point: { x: 60, y: 50 }, shift: false },
      },
      {
        type: 'createPointer',
        phase: 'up',
        subtype: 'square',
        in: { page: PAGE, point: { x: 60, y: 50 }, shift: false },
      },
    ]);
    const record = model.byId[model.order[0]];
    expect(record.annotation).toMatchObject(DRAWN_FLAGS);
    expect(record.annotation.print).toBe(true);
  });

  it('a tool flags seed merges over DRAWN_FLAGS at commit (the note-tool path)', () => {
    const model = run(initialModel, [
      {
        type: 'createPointer',
        phase: 'down',
        subtype: 'square',
        flags: { noZoom: true, noRotate: true },
        in: { page: PAGE, point: { x: 10, y: 10 }, shift: false },
      },
      {
        type: 'createPointer',
        phase: 'move',
        subtype: 'square',
        in: { page: PAGE, point: { x: 60, y: 50 }, shift: false },
      },
      {
        type: 'createPointer',
        phase: 'up',
        subtype: 'square',
        in: { page: PAGE, point: { x: 60, y: 50 }, shift: false },
      },
    ]);
    const record = model.byId[model.order[0]];
    expect(record.annotation).toMatchObject(
      flagsWith({ print: true, noZoom: true, noRotate: true }),
    );
  });
});

describe('flag-driven behavior in the model', () => {
  it('hidden/noView annotations neither paint nor hit; readOnly paints but is inert', () => {
    const model = loaded([
      square('h1', flagsWith({ hidden: true })),
      square('n2', flagsWith({ noView: true })),
      square('r3', flagsWith({ readOnly: true })),
      square('v4', DRAWN_FLAGS),
    ]);
    expect(paintOrder(model, PAGE)).toEqual(['r3', 'v4']);
    expect(pageItems(model, PAGE).map((item) => item.id)).toEqual(['r3', 'v4']);
    // a click inside the shared footprint resolves to the visible+interactive one
    const hit = hitTest(model, PAGE, { x: 102, y: 102 }, DEFAULT_CHROME_GEOMETRY, 6);
    expect(hit).toEqual({ kind: 'annot', id: 'v4' });
    expect(isSelectable(model, 'r3')).toBe(false);
    expect(isSelectable(model, 'v4')).toBe(true);
  });

  it('toggleNoView + noView renders only while selected', () => {
    const record = square('t1', flagsWith({ noView: true, toggleNoView: true }));
    let model = loaded([record]);
    expect(pageItems(model, PAGE)).toEqual([]);
    model = { ...model, selected: ['t1'] };
    expect(pageItems(model, PAGE).map((item) => item.id)).toEqual(['t1']);
  });

  it('locked: selectable, no handles/knob, move/props/delete blocked, unlock works', () => {
    let model = loaded([square('l1', flagsWith({ print: true, locked: true }))]);
    model = run(model, [
      {
        type: 'editPointer',
        phase: 'down',
        in: { page: PAGE, point: { x: 102, y: 102 }, shift: false },
      },
      {
        type: 'editPointer',
        phase: 'up',
        in: { page: PAGE, point: { x: 102, y: 102 }, shift: false },
      },
    ]);
    expect(model.selected).toEqual(['l1']); // selectable…
    expect(model.draft).toBeNull(); // …but no move gesture armed
    // chrome shows a bare outline: no resize handles, no rotate knob
    const nodes = chrome(model, PAGE);
    expect(nodes.some((node) => node.kind === 'handle')).toBe(false);
    expect(nodes.some((node) => node.kind === 'rotate-knob')).toBe(false);
    // restyle is blocked, silently (no effect emitted)
    const [afterProps, propsFx] = step(model, restyle(model, { color: '#00ff00' }));
    expect(styleOf(afterProps.byId['l1'].annotation).color).toBe(
      styleOf(model.byId['l1'].annotation).color,
    );
    expect(propsFx).toEqual([]);
    // delete is blocked — the locked member survives, still selected
    const [afterDelete, deleteFx] = step(model, { type: 'delete' });
    expect(afterDelete.byId['l1']).toBeDefined();
    expect(deleteFx).toEqual([]);
    // …but setFlags is not gated by locked: unlocking must work
    const [unlocked, unlockFx] = step(model, { type: 'setFlags', patch: { locked: false } });
    expect(unlocked.byId['l1'].annotation.locked).toBe(false);
    expect(unlockFx).toEqual([
      { type: 'patch', id: 'l1', patch: { subtype: 'square', locked: false } },
    ]);
  });

  it('setFlags merges onto the selection, skips no-ops, keeps the render source', () => {
    let model = loaded([square('s1', DRAWN_FLAGS, { source: 'baked' }), square('s2', DRAWN_FLAGS)]);
    model = { ...model, selected: ['s1', 's2'] };
    const [next, fx] = step(model, { type: 'setFlags', patch: { print: true, hidden: true } });
    // print was already set on both — only `hidden` changes, and only it is written
    expect(fx).toEqual([
      { type: 'patch', id: 's1', patch: { subtype: 'square', hidden: true } },
      { type: 'patch', id: 's2', patch: { subtype: 'square', hidden: true } },
    ]);
    expect(next.byId['s1'].annotation.hidden).toBe(true);
    expect(next.byId['s1'].source).toBe('baked'); // flags never re-bake
    // a pure no-op patch emits nothing and keeps the model reference
    const [same, none] = step(next, { type: 'setFlags', patch: { hidden: true } });
    expect(none).toEqual([]);
    expect(same).toBe(next);
  });

  it('setFlags on a record not yet confirmed still asks for the write (it follows the create)', () => {
    const created = square('nm:1:new-1', DRAWN_FLAGS, { ref: null });
    let model = loaded([created]);
    model = { ...model, selected: ['nm:1:new-1'] };
    const [next, fx] = step(model, { type: 'setFlags', patch: { locked: true } });
    expect(next.byId['nm:1:new-1'].annotation.locked).toBe(true);
    expect(fx).toEqual([
      { type: 'patch', id: 'nm:1:new-1', patch: { subtype: 'square', locked: true } },
    ]);
  });

  it('lockedContents blocks beginTextEdit', () => {
    const ft = square('ft1', flagsWith({ print: true, lockedContents: true }), {
      subtype: 'free-text',
      geometry: {
        kind: 'text-box',
        box: { x: 10, y: 10, width: 100, height: 40 },
        rotation: 0,
        calloutLine: null,
        lineEnding: null,
      },
    });
    const model = loaded([ft]);
    const [after] = step(model, { type: 'beginTextEdit', id: 'ft1' });
    expect(after.editing).toBeNull();
  });
});

describe('screen-anchored bodies (noZoom / noRotate)', () => {
  const rect = { x: 100, y: 100, width: 40, height: 20 };
  const geom: Shape = { kind: 'box', box: rect, rotation: 0, ellipse: false };

  it('anchorModeOf reads flags OR kind caps', () => {
    expect(anchorModeOf(square('a', DRAWN_FLAGS))).toBeNull();
    expect(anchorModeOf(square('a', flagsWith({ noZoom: true })))).toEqual({
      zoom: true,
      upright: false,
    });
    expect(anchorModeOf(square('a', flagsWith({ noRotate: true })))).toEqual({
      zoom: false,
      upright: true,
    });
  });

  it('noZoom: the body scales 1/s about the rect top-left (the spec anchor)', () => {
    const view: ViewEnv = { zoom: 2, rotation: 0 };
    const geometry = anchoredGeom(geom, { zoom: true, upright: false }, view);
    expect(geometry.kind).toBe('box');
    if (geometry.kind !== 'box') return;
    // top-left fixed; size halved (screen size stays 40×20 px at 200%)
    expect(geometry.box).toEqual({ x: 100, y: 100, width: 20, height: 10 });
    expect(geometry.rotation ?? 0).toBe(0);
  });

  it('noRotate: the body counter-rotates about the anchor so it reads upright', () => {
    const view: ViewEnv = { zoom: 1, rotation: 90 };
    const geometry = anchoredGeom(geom, { zoom: false, upright: true }, view);
    if (geometry.kind !== 'box') throw new Error('expected rect');
    expect(geometry.rotation).toBe(270); // -90° normalized
    // the box centre orbited the anchor by -90°: centre (120,110) → (110, 80)
    expect(geometry.box.x + geometry.box.width / 2).toBeCloseTo(110);
    expect(geometry.box.y + geometry.box.height / 2).toBeCloseTo(80);
    // width/height unchanged (only orientation compensates)
    expect(geometry.box.width).toBe(40);
    expect(geometry.box.height).toBe(20);
  });

  it('both flags compose: scaled about the anchor, then counter-rotated', () => {
    const view: ViewEnv = { zoom: 2, rotation: 180 };
    const geometry = anchoredGeom(geom, { zoom: true, upright: true }, view);
    if (geometry.kind !== 'box') throw new Error('expected rect');
    expect(geometry.box.width).toBe(20);
    expect(geometry.box.height).toBe(10);
    expect(geometry.rotation).toBe(180);
    // rotating the scaled box's centre (110,105) about the anchor by 180° → (90,95)
    expect(geometry.box.x + geometry.box.width / 2).toBeCloseTo(90);
    expect(geometry.box.y + geometry.box.height / 2).toBeCloseTo(95);
  });

  it('Adobe clamp: below 100% the body scales WITH the page (zoom exemption off)', () => {
    // Zoomed out: a screen-constant body would dwarf the page, so noZoom is
    // inert below zoom 1 — the geometry passes through untouched…
    const out = anchoredGeom(geom, { zoom: true, upright: false }, { zoom: 0.5, rotation: 0 });
    expect(out).toBe(geom);
    // …while the rotation exemption still applies (it has no baseline).
    const both = anchoredGeom(geom, { zoom: true, upright: true }, { zoom: 0.5, rotation: 90 });
    if (both.kind !== 'box') throw new Error('expected rect');
    expect(both.box.width).toBe(40); // size untouched (clamped)
    expect(both.rotation).toBe(270); // counter-rotation applied
    // …and the inverse honours the same clamp (round-trip stays exact).
    const back = unanchoredGeom(both, { zoom: true, upright: true }, { zoom: 0.5, rotation: 90 });
    expect(geomBounds(back).x).toBeCloseTo(geomBounds(geom).x, 6);
    expect(geomBounds(back).width).toBeCloseTo(geomBounds(geom).width, 6);
  });

  it('no view env / text-anchored geoms pass through untouched', () => {
    expect(anchoredGeom(geom, { zoom: true, upright: true }, undefined)).toBe(geom);
    // markup quads are bound to page text — no screen anchoring for them.
    const quads: Shape = {
      kind: 'quads',
      quadPoints: [quadFromRect({ x: 0, y: 0, width: 10, height: 5 })],
    };
    expect(anchoredGeom(quads, { zoom: true, upright: true }, { zoom: 2, rotation: 0 })).toBe(
      quads,
    );
  });

  it('VERTEX kinds project too: an ink body scales about its bounds top-left', () => {
    const ink: Shape = {
      kind: 'ink',
      inkList: [
        [
          { x: 100, y: 100 },
          { x: 140, y: 120 },
        ],
      ],
      rotation: 0,
    };
    const geometry = anchoredGeom(ink, { zoom: true, upright: false }, { zoom: 2, rotation: 0 });
    if (geometry.kind !== 'ink') throw new Error('expected ink');
    // bounds top-left (100,100) fixed; every point pulled halfway toward it
    expect(geometry.inkList[0][0]).toEqual({ x: 100, y: 100 });
    expect(geometry.inkList[0][1]).toEqual({ x: 120, y: 110 });
  });

  it('unanchoredGeom is the exact inverse: the commit re-projects to the preview', () => {
    const view: ViewEnv = { zoom: 2, rotation: 90 };
    const mode = { zoom: true, upright: true };
    // Round-trip a plain box, a rotated box, and a polygon.
    const shapes: Shape[] = [
      geom,
      { kind: 'box', box: { x: 100, y: 100, width: 40, height: 20 }, ellipse: false, rotation: 30 },
      {
        kind: 'poly',
        vertices: [
          { x: 100, y: 100 },
          { x: 160, y: 110 },
          { x: 130, y: 160 },
        ],
        closed: true,
        rotation: 0,
      },
    ];
    for (const geometry of shapes) {
      // stored → view → stored
      const there = anchoredGeom(geometry, mode, view);
      const back = unanchoredGeom(there, mode, view);
      expect(geomBounds(back).x).toBeCloseTo(geomBounds(geometry).x, 6);
      expect(geomBounds(back).y).toBeCloseTo(geomBounds(geometry).y, 6);
      expect(geomBounds(back).width).toBeCloseTo(geomBounds(geometry).width, 6);
      // view → stored → view (a gesture result commits, then re-projects):
      // the released preview is what the next render shows — zero jump.
      const stored = unanchoredGeom(geometry, mode, view);
      const shown = anchoredGeom(stored, mode, view);
      expect(geomBounds(shown).x).toBeCloseTo(geomBounds(geometry).x, 6);
      expect(geomBounds(shown).y).toBeCloseTo(geomBounds(geometry).y, 6);
      expect(geomBounds(shown).width).toBeCloseTo(geomBounds(geometry).width, 6);
      expect(geomBounds(shown).height).toBeCloseTo(geomBounds(geometry).height, 6);
      expect(geomRotation(shown)).toBeCloseTo(geomRotation(geometry), 6);
    }
  });

  it('pageItems projects the anchored footprint + scaled stroke; hit matches paint', () => {
    const record = square('nz', flagsWith({ print: true, noZoom: true }));
    const model = loaded([record]);
    const view: ViewEnv = { zoom: 2, rotation: 0 };
    const [item] = pageItems(model, PAGE, view);
    if (item.geometry.kind !== 'box') throw new Error('expected rect');
    expect(item.geometry.box).toEqual({ x: 100, y: 100, width: 40, height: 30 });
    expect(item.style.strokeWidth).toBe(STYLE.strokeWidth / 2);
    // a point inside the effective footprint but outside nothing else hits it…
    const inside = hitTest(
      model,
      PAGE,
      { x: 101, y: 101 },
      DEFAULT_CHROME_GEOMETRY,
      6,
      undefined,
      undefined,
      view,
    );
    expect(inside).toEqual({ kind: 'annot', id: 'nz' });
    // …and a point that only the stored rect would contain misses (bottom-right
    // quadrant of the unscaled box, outside the halved body + margin).
    const stale = hitTest(
      model,
      PAGE,
      { x: 170, y: 155 },
      DEFAULT_CHROME_GEOMETRY,
      6,
      undefined,
      undefined,
      view,
    );
    expect(stale).toEqual({ kind: 'empty' });
  });

  it('group rotate turns an anchored member WYSIWYG (its authored tilt changes)', () => {
    // At the identity view (s=1, r=0) an anchored member behaves exactly like
    // a plain one — `noRotate` exempts it from the page's rotation, not from
    // being rotated. Both members take the same real rotation.
    const anchored = square('an', flagsWith({ print: true, noRotate: true, noZoom: true }));
    const plain = square('pl', DRAWN_FLAGS, {
      geometry: {
        kind: 'box',
        box: { x: 300, y: 100, width: 80, height: 60 },
        rotation: 0,
        ellipse: false,
      },
    });
    let model = loaded([anchored, plain]);
    model = { ...model, selected: ['an', 'pl'] };
    // arm a rotate draft directly (the knob hit is exercised elsewhere)
    model = {
      ...model,
      draft: {
        kind: 'rotate',
        ids: ['an', 'pl'],
        pivot: { x: 240, y: 130 },
        start: { x: 240, y: 40 },
        current: { x: 240, y: 40 },
      },
    };
    // drag the pointer a quarter-turn about the pivot: start above → cur right
    model = run(model, [
      {
        type: 'editPointer',
        phase: 'move',
        in: { page: PAGE, point: { x: 330, y: 130 }, shift: false },
      },
      {
        type: 'editPointer',
        phase: 'up',
        in: { page: PAGE, point: { x: 330, y: 130 }, shift: false },
      },
    ]);
    const an = model.byId['an'];
    const anGeometry = shapeOf(an.annotation);
    const pl = model.byId['pl'];
    const plGeometry = shapeOf(pl.annotation);
    if (anGeometry.kind !== 'box' || plGeometry.kind !== 'box') throw new Error('expected rects');
    expect(anGeometry.rotation).toBe(90); // the body turns — same as everyone
    expect(plGeometry.rotation).toBe(90);
    // its centre orbited the pivot rigidly: (140,130) about (240,130) by 90°
    // CW in y-down space → (240,30)
    expect(anGeometry.box.x + anGeometry.box.width / 2).toBeCloseTo(240);
    expect(anGeometry.box.y + anGeometry.box.height / 2).toBeCloseTo(30);
    expect(an.source).toBe('vector'); // a real rotation re-bakes, like any member
  });

  it('an anchored annotation keeps its resize handles + rotate knob, and a quarter turn turns it', () => {
    const record = square('an', flagsWith({ print: true, noZoom: true, noRotate: true }));
    let model = loaded([record]);
    model = { ...model, selected: ['an'] };
    const nodes = chrome(model, PAGE, undefined, undefined, { zoom: 2, rotation: 0 });
    expect(nodes.some((node) => node.kind === 'handle')).toBe(true);
    expect(nodes.some((node) => node.kind === 'rotate-knob')).toBe(true);
    // the handles sit on the projected footprint (half-size at 200%)
    const handleXs = nodes
      .filter((node) => node.kind === 'handle')
      .map((node) => (node as { at: Point }).at.x);
    expect(Math.max(...handleXs)).toBeLessThanOrEqual(100 + 80 / 2 + 2);
    // a quarter turn turns the authored tilt (displayed directly at any page rotation)
    const [after, fx] = step(model, { type: 'rotateSelection', degrees: 90 });
    const geometry = shapeOf(after.byId['an'].annotation);
    expect(geometry.kind === 'box' && geometry.rotation).toBe(90);
    expect(fx).toHaveLength(1);
  });

  it('resizing an anchored body via its projected handles commits the zoom-1 size (no release jump)', () => {
    const record = square('nz2', flagsWith({ print: true, noZoom: true }));
    let model = loaded([record]);
    model = { ...model, selected: ['nz2'] };
    const view = { zoom: 2, rotation: 0 as const };
    const input = (x: number, y: number) => ({
      page: PAGE,
      point: { x, y },
      shift: false,
      zoom: view.zoom,
      displayRotation: view.rotation,
    });
    // Projected footprint at 200%: {100,100,40,30}; grab its SE corner (140,130)…
    model = run(model, [{ type: 'editPointer', phase: 'down', in: input(140, 130) }]);
    expect(model.draft?.kind).toBe('handle');
    // …drag it out to (180,160): the body the user sees becomes 80×60…
    model = run(model, [
      { type: 'editPointer', phase: 'move', in: input(180, 160) },
      { type: 'editPointer', phase: 'up', in: input(180, 160) },
    ]);
    const geometry = shapeOf(model.byId['nz2'].annotation);
    if (geometry.kind !== 'box') throw new Error('expected rect');
    // …so the stored /Rect (screen size at zoom 1) becomes 160×120, and its
    // own re-projection is exactly the released preview: {100,100,80,60}.
    expect(geometry.box).toEqual({ x: 100, y: 100, width: 160, height: 120 });
    const shown = anchoredGeom(geometry, anchorModeOf(model.byId['nz2']), view);
    expect(shown.kind === 'box' && shown.box).toEqual({ x: 100, y: 100, width: 80, height: 60 });
  });

  it('screen-anchored annotations neither snap nor serve as snap references', () => {
    // An anchored mover never snaps: drag it right next to a plain square's
    // edge — no guides, the raw delta commits untouched.
    const anchored = square('an', flagsWith({ print: true, noZoom: true }));
    const plain = square('pl', DRAWN_FLAGS, {
      geometry: {
        kind: 'box',
        box: { x: 300, y: 100, width: 80, height: 60 },
        rotation: 0,
        ellipse: false,
      },
    });
    let model = loaded([anchored, plain]);
    model = { ...model, selected: ['an'] };
    model = run(model, [
      {
        type: 'editPointer',
        phase: 'down',
        in: { page: PAGE, point: { x: 140, y: 130 }, shift: false },
      },
      // raw delta lands the anchored box's right edge 2pt from plain's left
      // edge — well inside the 5pt guide threshold, so a plain mover would snap
      {
        type: 'editPointer',
        phase: 'move',
        in: { page: PAGE, point: { x: 258, y: 130 }, shift: false },
      },
    ]);
    if (model.draft?.kind !== 'move') throw new Error('expected move draft');
    expect(model.draft.guides).toEqual([]); // no guides for an anchored mover
    expect(model.draft.delta.x).toBe(118); // raw, un-nudged

    // An anchored reference never attracts: a plain mover dragged next to it
    // gets no guides either (the anchored footprint is zoom-dependent).
    let m2 = loaded([anchored, plain]);
    m2 = { ...m2, selected: ['pl'] };
    m2 = run(m2, [
      {
        type: 'editPointer',
        phase: 'down',
        in: { page: PAGE, point: { x: 340, y: 130 }, shift: false },
      },
      // plain's left edge lands 2pt from the anchored square's right edge
      {
        type: 'editPointer',
        phase: 'move',
        in: { page: PAGE, point: { x: 222, y: 130 }, shift: false },
      },
    ]);
    if (m2.draft?.kind !== 'move') throw new Error('expected move draft');
    expect(m2.draft.guides).toEqual([]);
  });

  it('the rotate knob hangs off the anchored outline at every zoom (no drift)', () => {
    const record = square('nz3', flagsWith({ print: true, noZoom: true }));
    let model = loaded([record]);
    model = { ...model, selected: ['nz3'] };
    const view = { zoom: 4, rotation: 0 as const };
    const nodes = chrome(model, PAGE, undefined, undefined, view);
    const outline = nodes.find((node) => node.kind === 'outline');
    const knob = nodes.find((node) => node.kind === 'rotate-knob');
    if (outline?.kind !== 'outline' || knob?.kind !== 'rotate-knob')
      throw new Error('expected outline + knob');
    // the stalk anchor is the middle of the top edge of the frame the knob
    // hangs off — the outline, or the frame a small box's handles stand out
    // on — built from the same projected geometry + projected stroke width
    const frame = nodes.find((node) => node.kind === 'handle-frame');
    const top = frame?.kind === 'handle-frame' ? frame.corners[0].y : outline.rect.y;
    expect(knob.from.x).toBeCloseTo(outline.rect.x + outline.rect.width / 2, 6);
    expect(knob.from.y).toBeCloseTo(top, 6);
  });

  it('textBoxes culls /F-hidden free text', () => {
    const ft = square('ft', flagsWith({ print: true, hidden: true }), {
      subtype: 'free-text',
      geometry: {
        kind: 'text-box',
        box: { x: 10, y: 10, width: 100, height: 40 },
        rotation: 0,
        calloutLine: null,
        lineEnding: null,
      },
      source: 'vector',
    });
    const model = loaded([ft]);
    expect(textBoxes(model, PAGE)).toEqual([]);
  });
});

describe('flagsEqual', () => {
  it('compares all ten keys', () => {
    expect(flagsEqual(DRAWN_FLAGS, { ...DRAWN_FLAGS })).toBe(true);
    expect(flagsEqual(DRAWN_FLAGS, { ...DRAWN_FLAGS, toggleNoView: true })).toBe(false);
  });
});
