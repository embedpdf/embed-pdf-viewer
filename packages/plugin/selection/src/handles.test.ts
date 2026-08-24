/**
 * Handle policy against a fake view — the rotation coverage the React-bound
 * version could never have: geometry at every quarter turn plus 45°, RTL edge
 * choice, and the drag session's re-root/gap/commit rules.
 */
import { describe, expect, it, vi } from 'vitest';
import { textQuadFromRect } from '@embedpdf/core-geometry';
import type { Point, TextQuad } from '@embedpdf/core-geometry';
import {
  HANDLE_HEAD,
  createSelectionHandleDrag,
  selectionHandleGeom,
} from './handles';
import type { SelectionHandleEndpoint, SelectionHandleView } from './handles';

const rotQuad = (q: TextQuad, deg: number, px: number, py: number): TextQuad => {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  const m = (p: Point) => ({
    x: px + (p.x - px) * c - (p.y - py) * s,
    y: py + (p.x - px) * s + (p.y - py) * c,
  });
  return {
    upperStart: m(q.upperStart),
    upperEnd: m(q.upperEnd),
    lowerStart: m(q.lowerStart),
    lowerEnd: m(q.lowerEnd),
  };
};

/** Identity projection with a zoom factor — page space IS overlay space × zoom. */
const view = (zoom = 1): SelectionHandleView => ({
  toOverlay: (_pon, pt) => ({ x: pt.x * zoom, y: pt.y * zoom }),
  pageAt: () => null,
  pointOnPage: () => null,
});

const CELL = textQuadFromRect({ x: 100, y: 200, width: 60, height: 16 });
const ep = (glyphQuad: TextQuad, advance: 1 | -1 = 1): SelectionHandleEndpoint => ({
  pon: 7,
  glyphQuad,
  advance,
});

describe('selectionHandleGeom', () => {
  it('upright: bar IS the rect side, marked upright, head stacked beyond it', () => {
    const start = selectionHandleGeom(view(), ep(CELL), 'start')!;
    expect(start.bar.from).toEqual({ x: 100, y: 200 }); // ascent corner first
    expect(start.bar.to).toEqual({ x: 100, y: 216 });
    expect(start.length).toBeCloseTo(16, 9);
    expect(start.rotation).toBeCloseTo(0, 9);
    expect(start.upright).toBe(true);
    expect(start.head).toEqual({ x: 100, y: 200 - HANDLE_HEAD / 2 }); // above the ascent
    const end = selectionHandleGeom(view(), ep(CELL), 'end')!;
    expect(end.bar.from).toEqual({ x: 160, y: 200 });
    expect(end.head).toEqual({ x: 160, y: 216 + HANDLE_HEAD / 2 }); // past the baseline
  });

  it('bar length is the INK height at every rotation — never the AABB height', () => {
    for (const deg of [30, 45, 90, 180, 270]) {
      const g = selectionHandleGeom(view(), ep(rotQuad(CELL, deg, 100, 200)), 'start')!;
      expect(g.length).toBeCloseTo(16, 6);
      expect(g.upright).toBe(false);
      // the bar's screen angle tracks the text's tilt exactly
      expect(((g.rotation % 360) + 360) % 360).toBeCloseTo(deg % 360, 6);
    }
  });

  it('zoom scales the projected geometry with no extra factor', () => {
    const g = selectionHandleGeom(view(2.5), ep(rotQuad(CELL, 45, 100, 200)), 'start')!;
    expect(g.length).toBeCloseTo(40, 6); // 16 × 2.5
  });

  it('RTL: the LEADING edge mirrors — start takes the end-side edge', () => {
    const ltr = selectionHandleGeom(view(), ep(CELL, 1), 'start')!;
    const rtl = selectionHandleGeom(view(), ep(CELL, -1), 'start')!;
    expect(ltr.bar.from.x).toBeCloseTo(100, 9);
    expect(rtl.bar.from.x).toBeCloseTo(160, 9); // the cell's end side
    // …and the same mirroring under rotation
    const rtl45 = selectionHandleGeom(view(), ep(rotQuad(CELL, 45, 100, 200), -1), 'start')!;
    expect(rtl45.length).toBeCloseTo(16, 6);
  });

  it('null when the page is not laid out or the cell is degenerate', () => {
    const dead: SelectionHandleView = { ...view(), toOverlay: () => null };
    expect(selectionHandleGeom(dead, ep(CELL), 'start')).toBeNull();
    const flat = textQuadFromRect({ x: 0, y: 0, width: 10, height: 0 });
    expect(selectionHandleGeom(view(), ep(flat), 'start')).toBeNull();
  });
});

describe('createSelectionHandleDrag', () => {
  const target = () => ({
    beginAt: vi.fn(() => true),
    extendTo: vi.fn(),
    end: vi.fn(),
  });

  it('re-roots ONCE at the opposite cell centre, then extends toward the pointer', () => {
    const t = target();
    const v: SelectionHandleView = {
      ...view(),
      pageAt: (o) => ({ pon: 9, point: { x: o.x, y: o.y } }),
    };
    const session = createSelectionHandleDrag(t, v, ep(CELL), 7);
    session.move({ x: 300, y: 400 });
    session.move({ x: 310, y: 410 });
    expect(t.beginAt).toHaveBeenCalledTimes(1);
    expect(t.beginAt).toHaveBeenCalledWith(7, { x: 130, y: 208 }); // the cell centre
    expect(t.extendTo).toHaveBeenNthCalledWith(1, 9, { x: 300, y: 400 });
    expect(t.extendTo).toHaveBeenNthCalledWith(2, 9, { x: 310, y: 410 });
    session.end();
    expect(t.end).toHaveBeenCalledTimes(1);
  });

  it('the re-root anchor stays inside a ROTATED opposite glyph (cell centre, not AABB corner)', () => {
    const t = target();
    const v: SelectionHandleView = { ...view(), pageAt: (o) => ({ pon: 9, point: o }) };
    const session = createSelectionHandleDrag(t, v, ep(rotQuad(CELL, 45, 100, 200)), 7);
    session.move({ x: 0, y: 0 });
    const [, anchor] = t.beginAt.mock.calls[0]!;
    // the centre of the rotated cell = the upright centre rotated about the pivot
    const r = Math.PI / 4;
    const cx = 100 + (130 - 100) * Math.cos(r) - (208 - 200) * Math.sin(r);
    const cy = 200 + (130 - 100) * Math.sin(r) + (208 - 200) * Math.cos(r);
    expect(anchor.x).toBeCloseTo(cx, 9);
    expect(anchor.y).toBeCloseTo(cy, 9);
  });

  it('over a gap, projects onto the LAST page hit so the selection keeps tracking', () => {
    const t = target();
    const v: SelectionHandleView = {
      toOverlay: (_p, pt) => pt,
      pageAt: vi
        .fn<(o: Point) => { pon: number; point: Point } | null>()
        .mockReturnValueOnce({ pon: 9, point: { x: 1, y: 2 } })
        .mockReturnValue(null),
      pointOnPage: (pon, o) => ({ x: o.x + pon, y: o.y }),
    };
    const session = createSelectionHandleDrag(t, v, ep(CELL), 7);
    session.move({ x: 10, y: 10 }); // hits page 9
    session.move({ x: 20, y: 20 }); // gap → projects onto page 9's plane
    expect(t.extendTo).toHaveBeenLastCalledWith(9, { x: 29, y: 20 });
  });

  it('before any page hit, the gap fallback uses the DRAGGED endpoint page', () => {
    const t = target();
    const v: SelectionHandleView = {
      toOverlay: (_p, pt) => pt,
      pageAt: () => null,
      pointOnPage: (pon, o) => ({ x: o.x + pon, y: o.y }),
    };
    const session = createSelectionHandleDrag(t, v, ep(CELL), 7);
    session.move({ x: 5, y: 5 });
    expect(t.extendTo).toHaveBeenCalledWith(7, { x: 12, y: 5 });
  });

  it('a refused re-root arms nothing; end() without arming settles nothing', () => {
    const t = { beginAt: vi.fn(() => false), extendTo: vi.fn(), end: vi.fn() };
    const v: SelectionHandleView = { ...view(), pageAt: (o) => ({ pon: 9, point: o }) };
    const session = createSelectionHandleDrag(t, v, ep(CELL), 7);
    session.move({ x: 10, y: 10 });
    expect(t.extendTo).not.toHaveBeenCalled();
    session.end();
    expect(t.end).not.toHaveBeenCalled(); // an untouched press commits nothing
  });
});
