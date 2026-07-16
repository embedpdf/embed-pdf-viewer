import { describe, expect, it } from 'vitest';
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
} from './flags';
import { anchoredGeom, anchorModeOf, anchorOf, unanchoredGeom, type ViewEnv } from './anchor';
import { hitTest, isSelectable, paintOrder } from './hit';
import { pageItems, chrome, textBoxes } from './view';
import { geomBounds, geomRotation } from './geometry';
import { initialModel, update, DEFAULT_CHROME_GEOM } from './index';
import type { Annot, Geom, Model, Msg, Vec } from './types';

const PON = 1;
const f = (over: Partial<AnnotationFlags> = {}): AnnotationFlags => ({
  ...NO_ANNOTATION_FLAGS,
  ...over,
});

const square = (
  id: string,
  flags: AnnotationFlags = DRAWN_FLAGS,
  over: Partial<Annot> = {},
): Annot => ({
  id,
  ref: {
    kind: 'objectNumber',
    pageObjectNumber: PON,
    annotObjectNumber: Number(id.replace(/\D/g, '') || 7),
  },
  pon: PON,
  subtype: 'square',
  geom: { t: 'rect', rect: { x: 100, y: 100, width: 80, height: 60 }, ellipse: false },
  style: initialModel.style,
  flags,
  source: 'vector',
  ...over,
});

const loaded = (annots: Annot[]): Model => update(initialModel, { t: 'loaded', annots })[0];
const run = (m: Model, msgs: Msg[]): Model => msgs.reduce((acc, msg) => update(acc, msg)[0], m);

describe('flag predicates (ISO 32000 Table 167)', () => {
  it('hidden beats everything on screen', () => {
    expect(viewable(f({ hidden: true }))).toBe(false);
    expect(viewable(f({ hidden: true, toggleNoView: true }), true)).toBe(false);
    expect(interactive(f({ hidden: true }))).toBe(false);
  });

  it('noView hides unless toggleNoView + engaged', () => {
    expect(viewable(f({ noView: true }))).toBe(false);
    expect(viewable(f({ noView: true, toggleNoView: true }))).toBe(false);
    expect(viewable(f({ noView: true, toggleNoView: true }), true)).toBe(true);
  });

  it('readOnly is visible but inert; locked stays interactive but frozen', () => {
    const ro = square('a1', f({ readOnly: true }));
    expect(viewable(ro.flags)).toBe(true);
    expect(annotInteractive(ro)).toBe(false);
    const lk = square('a2', f({ locked: true }));
    expect(annotInteractive(lk)).toBe(true);
    expect(annotTransformable(lk)).toBe(false);
    expect(annotContentsEditable(lk)).toBe(true); // locked ≠ lockedContents
  });

  it('lockedContents blocks contents, not geometry', () => {
    const a = square('a3', f({ lockedContents: true }));
    expect(annotTransformable(a)).toBe(true);
    expect(annotContentsEditable(a)).toBe(false);
  });

  it('widget kinds ignore readOnly (the form layer owns field ReadOnly)', () => {
    const w = square('a4', f({ readOnly: true }), { subtype: 'widget-text' });
    expect(annotInteractive(w)).toBe(true);
    expect(annotTransformable(w)).toBe(true);
  });

  it('drawn annotations start with print set (Acrobat parity)', () => {
    const m = run(initialModel, [
      {
        t: 'createPointer',
        phase: 'down',
        subtype: 'square',
        in: { pon: PON, point: { x: 10, y: 10 }, shift: false },
      },
      {
        t: 'createPointer',
        phase: 'move',
        subtype: 'square',
        in: { pon: PON, point: { x: 60, y: 50 }, shift: false },
      },
      {
        t: 'createPointer',
        phase: 'up',
        subtype: 'square',
        in: { pon: PON, point: { x: 60, y: 50 }, shift: false },
      },
    ]);
    const a = m.byId[m.order[0]];
    expect(a.flags).toEqual(DRAWN_FLAGS);
    expect(a.flags.print).toBe(true);
  });

  it('a tool flags seed merges over DRAWN_FLAGS at commit (the note-tool path)', () => {
    const m = run(initialModel, [
      {
        t: 'createPointer',
        phase: 'down',
        subtype: 'square',
        flags: { noZoom: true, noRotate: true },
        in: { pon: PON, point: { x: 10, y: 10 }, shift: false },
      },
      {
        t: 'createPointer',
        phase: 'move',
        subtype: 'square',
        in: { pon: PON, point: { x: 60, y: 50 }, shift: false },
      },
      {
        t: 'createPointer',
        phase: 'up',
        subtype: 'square',
        in: { pon: PON, point: { x: 60, y: 50 }, shift: false },
      },
    ]);
    const a = m.byId[m.order[0]];
    expect(a.flags).toEqual(f({ print: true, noZoom: true, noRotate: true }));
  });
});

describe('flag-driven behavior in the model', () => {
  it('hidden/noView annotations neither paint nor hit; readOnly paints but is inert', () => {
    const m = loaded([
      square('h1', f({ hidden: true })),
      square('n2', f({ noView: true })),
      square('r3', f({ readOnly: true })),
      square('v4', DRAWN_FLAGS),
    ]);
    expect(paintOrder(m, PON)).toEqual(['r3', 'v4']);
    expect(pageItems(m, PON).map((i) => i.id)).toEqual(['r3', 'v4']);
    // a click inside the shared footprint resolves to the visible+interactive one
    const hit = hitTest(m, PON, { x: 102, y: 102 }, DEFAULT_CHROME_GEOM, 6);
    expect(hit).toEqual({ t: 'annot', id: 'v4' });
    expect(isSelectable(m, 'r3')).toBe(false);
    expect(isSelectable(m, 'v4')).toBe(true);
  });

  it('toggleNoView + noView renders only while selected', () => {
    const a = square('t1', f({ noView: true, toggleNoView: true }));
    let m = loaded([a]);
    expect(pageItems(m, PON)).toEqual([]);
    m = { ...m, selected: ['t1'] };
    expect(pageItems(m, PON).map((i) => i.id)).toEqual(['t1']);
  });

  it('locked: selectable, no handles/knob, move/props/delete blocked, unlock works', () => {
    let m = loaded([square('l1', f({ print: true, locked: true }))]);
    m = run(m, [
      {
        t: 'editPointer',
        phase: 'down',
        in: { pon: PON, point: { x: 102, y: 102 }, shift: false },
      },
      { t: 'editPointer', phase: 'up', in: { pon: PON, point: { x: 102, y: 102 }, shift: false } },
    ]);
    expect(m.selected).toEqual(['l1']); // selectable…
    expect(m.draft).toBeNull(); // …but no move gesture armed
    // chrome shows a bare outline: no resize handles, no rotate knob
    const nodes = chrome(m, PON);
    expect(nodes.some((n) => n.kind === 'handle')).toBe(false);
    expect(nodes.some((n) => n.kind === 'rotate-knob')).toBe(false);
    // restyle is blocked, silently (no effect emitted)
    const [afterProps, propsFx] = update(m, { t: 'setProps', patch: { color: '#00ff00' } });
    expect(afterProps.byId['l1'].style.color).toBe(m.byId['l1'].style.color);
    expect(propsFx).toEqual([]);
    // delete is blocked — the locked member survives, still selected
    const [afterDelete, deleteFx] = update(m, { t: 'delete' });
    expect(afterDelete.byId['l1']).toBeDefined();
    expect(deleteFx).toEqual([]);
    // …but setFlags is NOT gated by locked: unlocking must work
    const [unlocked, unlockFx] = update(m, { t: 'setFlags', patch: { locked: false } });
    expect(unlocked.byId['l1'].flags.locked).toBe(false);
    expect(unlockFx).toEqual([{ fx: 'flags', id: 'l1' }]);
  });

  it('setFlags merges onto the selection, skips no-ops, keeps the render source', () => {
    let m = loaded([square('s1', DRAWN_FLAGS, { source: 'baked' }), square('s2', DRAWN_FLAGS)]);
    m = { ...m, selected: ['s1', 's2'] };
    const [next, fx] = update(m, { t: 'setFlags', patch: { print: true, hidden: true } });
    // print was already set on both — only `hidden` changes, but both change by it
    expect(fx).toEqual([
      { fx: 'flags', id: 's1' },
      { fx: 'flags', id: 's2' },
    ]);
    expect(next.byId['s1'].flags.hidden).toBe(true);
    expect(next.byId['s1'].source).toBe('baked'); // flags never re-bake
    // a pure no-op patch emits nothing and keeps the model reference
    const [same, none] = update(next, { t: 'setFlags', patch: { hidden: true } });
    expect(none).toEqual([]);
    expect(same).toBe(next);
  });

  it('setFlags on an uncommitted draft merges without emitting an effect', () => {
    const tmp = square('tmp:1', DRAWN_FLAGS, { ref: null });
    let m = loaded([tmp]);
    m = { ...m, selected: ['tmp:1'] };
    const [next, fx] = update(m, { t: 'setFlags', patch: { locked: true } });
    expect(next.byId['tmp:1'].flags.locked).toBe(true);
    expect(fx).toEqual([]); // its create draft will carry the flags instead
  });

  it('lockedContents blocks beginTextEdit', () => {
    const ft = square('ft1', f({ print: true, lockedContents: true }), {
      subtype: 'free-text',
      geom: { t: 'text', rect: { x: 10, y: 10, width: 100, height: 40 } },
    });
    const m = loaded([ft]);
    const [after] = update(m, { t: 'beginTextEdit', id: 'ft1' });
    expect(after.editing).toBeNull();
  });
});

describe('screen-anchored bodies (noZoom / noRotate)', () => {
  const rect = { x: 100, y: 100, width: 40, height: 20 };
  const geom: Geom = { t: 'rect', rect, ellipse: false };

  it('anchorModeOf reads flags OR kind caps', () => {
    expect(anchorModeOf(square('a', DRAWN_FLAGS))).toBeNull();
    expect(anchorModeOf(square('a', f({ noZoom: true })))).toEqual({ zoom: true, upright: false });
    expect(anchorModeOf(square('a', f({ noRotate: true })))).toEqual({
      zoom: false,
      upright: true,
    });
  });

  it('noZoom: the body scales 1/s about the rect top-left (the spec anchor)', () => {
    const view: ViewEnv = { zoom: 2, rotation: 0 };
    const g = anchoredGeom(geom, { zoom: true, upright: false }, view);
    expect(g.t).toBe('rect');
    if (g.t !== 'rect') return;
    // top-left fixed; size halved (screen size stays 40×20 px at 200%)
    expect(g.rect).toEqual({ x: 100, y: 100, width: 20, height: 10 });
    expect(g.rot ?? 0).toBe(0);
  });

  it('noRotate: the body counter-rotates about the anchor so it reads upright', () => {
    const view: ViewEnv = { zoom: 1, rotation: 90 };
    const g = anchoredGeom(geom, { zoom: false, upright: true }, view);
    if (g.t !== 'rect') throw new Error('expected rect');
    expect(g.rot).toBe(270); // -90° normalized
    // the box centre orbited the anchor by -90°: centre (120,110) → (110, 80)
    expect(g.rect.x + g.rect.width / 2).toBeCloseTo(110);
    expect(g.rect.y + g.rect.height / 2).toBeCloseTo(80);
    // width/height unchanged (only orientation compensates)
    expect(g.rect.width).toBe(40);
    expect(g.rect.height).toBe(20);
  });

  it('both flags compose: scaled about the anchor, then counter-rotated', () => {
    const view: ViewEnv = { zoom: 2, rotation: 180 };
    const g = anchoredGeom(geom, { zoom: true, upright: true }, view);
    if (g.t !== 'rect') throw new Error('expected rect');
    expect(g.rect.width).toBe(20);
    expect(g.rect.height).toBe(10);
    expect(g.rot).toBe(180);
    // rotating the scaled box's centre (110,105) about the anchor by 180° → (90,95)
    expect(g.rect.x + g.rect.width / 2).toBeCloseTo(90);
    expect(g.rect.y + g.rect.height / 2).toBeCloseTo(95);
  });

  it('Adobe clamp: below 100% the body scales WITH the page (zoom exemption off)', () => {
    // Zoomed OUT: a screen-constant body would dwarf the page, so noZoom is
    // inert below zoom 1 — the geometry passes through untouched…
    const out = anchoredGeom(geom, { zoom: true, upright: false }, { zoom: 0.5, rotation: 0 });
    expect(out).toBe(geom);
    // …while the ROTATION exemption still applies (it has no baseline).
    const both = anchoredGeom(geom, { zoom: true, upright: true }, { zoom: 0.5, rotation: 90 });
    if (both.t !== 'rect') throw new Error('expected rect');
    expect(both.rect.width).toBe(40); // size untouched (clamped)
    expect(both.rot).toBe(270); // counter-rotation applied
    // …and the inverse honours the SAME clamp (round-trip stays exact).
    const back = unanchoredGeom(both, { zoom: true, upright: true }, { zoom: 0.5, rotation: 90 });
    expect(geomBounds(back).x).toBeCloseTo(geomBounds(geom).x, 6);
    expect(geomBounds(back).width).toBeCloseTo(geomBounds(geom).width, 6);
  });

  it('no view env / text-anchored geoms pass through untouched', () => {
    expect(anchoredGeom(geom, { zoom: true, upright: true }, undefined)).toBe(geom);
    // markup quads are bound to page text — no screen anchoring for them.
    const quads: Geom = {
      t: 'quads',
      quads: [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 5 },
          { x: 10, y: 5 },
        ],
      ],
    };
    expect(anchoredGeom(quads, { zoom: true, upright: true }, { zoom: 2, rotation: 0 })).toBe(
      quads,
    );
  });

  it('VERTEX kinds project too: an ink body scales about its bounds top-left', () => {
    const ink: Geom = {
      t: 'ink',
      strokes: [
        [
          { x: 100, y: 100 },
          { x: 140, y: 120 },
        ],
      ],
    };
    const g = anchoredGeom(ink, { zoom: true, upright: false }, { zoom: 2, rotation: 0 });
    if (g.t !== 'ink') throw new Error('expected ink');
    // bounds top-left (100,100) fixed; every point pulled halfway toward it
    expect(g.strokes[0][0]).toEqual({ x: 100, y: 100 });
    expect(g.strokes[0][1]).toEqual({ x: 120, y: 110 });
  });

  it('unanchoredGeom is the exact inverse: the commit re-projects to the preview', () => {
    const view: ViewEnv = { zoom: 2, rotation: 90 };
    const mode = { zoom: true, upright: true };
    // Round-trip a plain box, a rotated box, and a polygon.
    const shapes: Geom[] = [
      geom,
      { t: 'rect', rect: { x: 100, y: 100, width: 40, height: 20 }, ellipse: false, rot: 30 },
      {
        t: 'poly',
        points: [
          { x: 100, y: 100 },
          { x: 160, y: 110 },
          { x: 130, y: 160 },
        ],
        closed: true,
      },
    ];
    for (const s of shapes) {
      // stored → view → stored
      const there = anchoredGeom(s, mode, view);
      const back = unanchoredGeom(there, mode, view);
      expect(geomBounds(back).x).toBeCloseTo(geomBounds(s).x, 6);
      expect(geomBounds(back).y).toBeCloseTo(geomBounds(s).y, 6);
      expect(geomBounds(back).width).toBeCloseTo(geomBounds(s).width, 6);
      // view → stored → view (a gesture result commits, then re-projects):
      // the released preview IS what the next render shows — zero jump.
      const stored = unanchoredGeom(s, mode, view);
      const shown = anchoredGeom(stored, mode, view);
      expect(geomBounds(shown).x).toBeCloseTo(geomBounds(s).x, 6);
      expect(geomBounds(shown).y).toBeCloseTo(geomBounds(s).y, 6);
      expect(geomBounds(shown).width).toBeCloseTo(geomBounds(s).width, 6);
      expect(geomBounds(shown).height).toBeCloseTo(geomBounds(s).height, 6);
      expect(geomRotation(shown)).toBeCloseTo(geomRotation(s), 6);
    }
  });

  it('pageItems projects the anchored footprint + scaled stroke; hit matches paint', () => {
    const a = square('nz', f({ print: true, noZoom: true }));
    const m = loaded([a]);
    const view: ViewEnv = { zoom: 2, rotation: 0 };
    const [item] = pageItems(m, PON, view);
    if (item.geom.t !== 'rect') throw new Error('expected rect');
    expect(item.geom.rect).toEqual({ x: 100, y: 100, width: 40, height: 30 });
    expect(item.style.strokeWidth).toBe(initialModel.style.strokeWidth / 2);
    // a point inside the EFFECTIVE footprint but outside nothing else hits it…
    const inside = hitTest(
      m,
      PON,
      { x: 101, y: 101 },
      DEFAULT_CHROME_GEOM,
      6,
      undefined,
      undefined,
      view,
    );
    expect(inside).toEqual({ t: 'annot', id: 'nz' });
    // …and a point that only the STORED rect would contain misses (bottom-right
    // quadrant of the unscaled box, outside the halved body + margin).
    const stale = hitTest(
      m,
      PON,
      { x: 170, y: 155 },
      DEFAULT_CHROME_GEOM,
      6,
      undefined,
      undefined,
      view,
    );
    expect(stale).toEqual({ t: 'empty' });
  });

  it('group rotate turns an anchored member WYSIWYG (its authored tilt changes)', () => {
    // At the identity view (s=1, r=0) an anchored member behaves EXACTLY like
    // a plain one — `noRotate` exempts it from the PAGE's rotation, not from
    // being rotated. Both members take the same real rotation.
    const anchored = square('an', f({ print: true, noRotate: true, noZoom: true }));
    const plain = square('pl', DRAWN_FLAGS, {
      geom: { t: 'rect', rect: { x: 300, y: 100, width: 80, height: 60 }, ellipse: false },
    });
    let m = loaded([anchored, plain]);
    m = { ...m, selected: ['an', 'pl'] };
    // arm a rotate draft directly (the knob hit is exercised elsewhere)
    m = {
      ...m,
      draft: {
        g: 'rotate',
        ids: ['an', 'pl'],
        pivot: { x: 240, y: 130 },
        start: { x: 240, y: 40 },
        cur: { x: 240, y: 40 },
      },
    };
    // drag the pointer a quarter-turn about the pivot: start above → cur right
    m = run(m, [
      {
        t: 'editPointer',
        phase: 'move',
        in: { pon: PON, point: { x: 330, y: 130 }, shift: false },
      },
      { t: 'editPointer', phase: 'up', in: { pon: PON, point: { x: 330, y: 130 }, shift: false } },
    ]);
    const an = m.byId['an'];
    const pl = m.byId['pl'];
    if (an.geom.t !== 'rect' || pl.geom.t !== 'rect') throw new Error('expected rects');
    expect(an.geom.rot).toBe(90); // the body TURNS — same as everyone
    expect(pl.geom.rot).toBe(90);
    // its centre orbited the pivot rigidly: (140,130) about (240,130) by 90°
    // CW in y-down space → (240,30)
    expect(an.geom.rect.x + an.geom.rect.width / 2).toBeCloseTo(240);
    expect(an.geom.rect.y + an.geom.rect.height / 2).toBeCloseTo(30);
    expect(an.source).toBe('vector'); // a real rotation re-bakes, like any member
  });

  it('an anchored annotation keeps its resize handles + rotate knob, and rotate90 turns it', () => {
    const a = square('an', f({ print: true, noZoom: true, noRotate: true }));
    let m = loaded([a]);
    m = { ...m, selected: ['an'] };
    const nodes = chrome(m, PON, undefined, undefined, { zoom: 2, rotation: 0 });
    expect(nodes.some((n) => n.kind === 'handle')).toBe(true);
    expect(nodes.some((n) => n.kind === 'rotate-knob')).toBe(true);
    // the handles sit on the PROJECTED footprint (half-size at 200%)
    const handleXs = nodes.filter((n) => n.kind === 'handle').map((n) => (n as { at: Vec }).at.x);
    expect(Math.max(...handleXs)).toBeLessThanOrEqual(100 + 80 / 2 + 2);
    // rotate90 turns the authored tilt (displayed directly at any page rotation)
    const [after, fx] = update(m, { t: 'rotate90' });
    const g = after.byId['an'].geom;
    expect(g.t === 'rect' && g.rot).toBe(90);
    expect(fx).toHaveLength(1);
  });

  it('resizing an anchored body via its projected handles commits the zoom-1 size (no release jump)', () => {
    const a = square('nz2', f({ print: true, noZoom: true }));
    let m = loaded([a]);
    m = { ...m, selected: ['nz2'] };
    const view = { zoom: 2, rotation: 0 as const };
    const input = (x: number, y: number) => ({
      pon: PON,
      point: { x, y },
      shift: false,
      zoom: view.zoom,
      displayRotation: view.rotation,
    });
    // Projected footprint at 200%: {100,100,40,30}; grab its SE corner (140,130)…
    m = run(m, [{ t: 'editPointer', phase: 'down', in: input(140, 130) }]);
    expect(m.draft?.g).toBe('handle');
    // …drag it out to (180,160): the body the user SEES becomes 80×60…
    m = run(m, [
      { t: 'editPointer', phase: 'move', in: input(180, 160) },
      { t: 'editPointer', phase: 'up', in: input(180, 160) },
    ]);
    const g = m.byId['nz2'].geom;
    if (g.t !== 'rect') throw new Error('expected rect');
    // …so the STORED /Rect (screen size at zoom 1) becomes 160×120, and its
    // own re-projection is exactly the released preview: {100,100,80,60}.
    expect(g.rect).toEqual({ x: 100, y: 100, width: 160, height: 120 });
    const shown = anchoredGeom(g, anchorModeOf(m.byId['nz2']), view);
    expect(shown.t === 'rect' && shown.rect).toEqual({ x: 100, y: 100, width: 80, height: 60 });
  });

  it('screen-anchored annotations neither snap nor serve as snap references', () => {
    // An anchored MOVER never snaps: drag it right next to a plain square's
    // edge — no guides, the raw delta commits untouched.
    const anchored = square('an', f({ print: true, noZoom: true }));
    const plain = square('pl', DRAWN_FLAGS, {
      geom: { t: 'rect', rect: { x: 300, y: 100, width: 80, height: 60 }, ellipse: false },
    });
    let m = loaded([anchored, plain]);
    m = { ...m, selected: ['an'] };
    m = run(m, [
      {
        t: 'editPointer',
        phase: 'down',
        in: { pon: PON, point: { x: 140, y: 130 }, shift: false },
      },
      // raw delta lands the anchored box's right edge 2pt from plain's left
      // edge — well inside the 5pt guide threshold, so a plain mover WOULD snap
      {
        t: 'editPointer',
        phase: 'move',
        in: { pon: PON, point: { x: 258, y: 130 }, shift: false },
      },
    ]);
    if (m.draft?.g !== 'move') throw new Error('expected move draft');
    expect(m.draft.guides).toEqual([]); // no guides for an anchored mover
    expect(m.draft.delta.x).toBe(118); // raw, un-nudged

    // An anchored REFERENCE never attracts: a plain mover dragged next to it
    // gets no guides either (the anchored footprint is zoom-dependent).
    let m2 = loaded([anchored, plain]);
    m2 = { ...m2, selected: ['pl'] };
    m2 = run(m2, [
      {
        t: 'editPointer',
        phase: 'down',
        in: { pon: PON, point: { x: 340, y: 130 }, shift: false },
      },
      // plain's left edge lands 2pt from the anchored square's right edge
      {
        t: 'editPointer',
        phase: 'move',
        in: { pon: PON, point: { x: 222, y: 130 }, shift: false },
      },
    ]);
    if (m2.draft?.g !== 'move') throw new Error('expected move draft');
    expect(m2.draft.guides).toEqual([]);
  });

  it('the rotate knob hangs off the anchored outline at every zoom (no drift)', () => {
    const a = square('nz3', f({ print: true, noZoom: true }));
    let m = loaded([a]);
    m = { ...m, selected: ['nz3'] };
    const view = { zoom: 4, rotation: 0 as const };
    const nodes = chrome(m, PON, undefined, undefined, view);
    const outline = nodes.find((n) => n.kind === 'outline');
    const knob = nodes.find((n) => n.kind === 'rotate-knob');
    if (outline?.kind !== 'outline' || knob?.kind !== 'rotate-knob')
      throw new Error('expected outline + knob');
    // the stalk anchor is the outline's top-edge midpoint — knob and outline
    // are built from the SAME projected geometry + projected stroke width
    expect(knob.from.x).toBeCloseTo(outline.rect.x + outline.rect.width / 2, 6);
    expect(knob.from.y).toBeCloseTo(outline.rect.y, 6);
  });

  it('textBoxes culls /F-hidden free text', () => {
    const ft = square('ft', f({ print: true, hidden: true }), {
      subtype: 'free-text',
      geom: { t: 'text', rect: { x: 10, y: 10, width: 100, height: 40 } },
      source: 'vector',
    });
    const m = loaded([ft]);
    expect(textBoxes(m, PON)).toEqual([]);
  });
});

describe('flagsEqual', () => {
  it('compares all ten keys', () => {
    expect(flagsEqual(DRAWN_FLAGS, { ...DRAWN_FLAGS })).toBe(true);
    expect(flagsEqual(DRAWN_FLAGS, { ...DRAWN_FLAGS, toggleNoView: true })).toBe(false);
  });
});
