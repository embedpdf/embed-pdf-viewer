import { describe, expect, it } from 'vitest';
import {
  applyPoint,
  applyQuad,
  applyRect,
  compose,
  invert,
  pageGeometry,
  type Mat2D,
  type PageRotation,
  type PointIn,
  type QuadIn,
  type RectIn,
} from '../src/index';

/**
 * The matrix-native geometry layer. These tests pin the contract the whole
 * viewer leans on: one `pageGeometry` per page, then everything else is
 * compose/invert/apply* — no per-space hand-rolled y-flip.
 */

describe('pdfToContent: crop-relative y-flip (origin preserved)', () => {
  it('maps the crop top-left to content (0,0) and bottom-right to (W,H)', () => {
    const { pdfToContent } = pageGeometry(
      { crop: { left: 10, bottom: 20, right: 110, top: 220 }, rotation: 0, userUnit: 1 },
      1,
    );
    expect(applyPoint(pdfToContent, { x: 10, y: 220 } as PointIn<'pdf'>)).toEqual({ x: 0, y: 0 });
    expect(applyPoint(pdfToContent, { x: 110, y: 20 } as PointIn<'pdf'>)).toEqual({
      x: 100,
      y: 200,
    });
    // a point in the middle: y flips about the crop top
    expect(applyPoint(pdfToContent, { x: 60, y: 120 } as PointIn<'pdf'>)).toEqual({
      x: 50,
      y: 100,
    });
  });

  it('handles a NEGATIVE crop origin correctly (point + rect)', () => {
    const { pdfToContent } = pageGeometry(
      { crop: { left: -50, bottom: -30, right: 50, top: 170 }, rotation: 0, userUnit: 1 },
      1,
    );
    expect(applyPoint(pdfToContent, { x: -50, y: 170 } as PointIn<'pdf'>)).toEqual({ x: 0, y: 0 });
    expect(applyPoint(pdfToContent, { x: 50, y: -30 } as PointIn<'pdf'>)).toEqual({
      x: 100,
      y: 200,
    });
    // PDF rect as min-corner (bottom-left) + extent
    const r: RectIn<'pdf'> = { x: -50, y: -30, width: 100, height: 200 };
    expect(applyRect(pdfToContent, r)).toEqual({ x: 0, y: 0, width: 100, height: 200 });
  });
});

describe('contentToView / pdfToView: one matrix per quarter-turn', () => {
  // 100×200 portrait page, no crop offset, scale 1 → footprint math is exact.
  const crop = { left: 0, bottom: 0, right: 100, top: 200 };
  const topLeft = { x: 0, y: 200 } as PointIn<'pdf'>; // pdf top-left corner
  const bottomRight = { x: 100, y: 0 } as PointIn<'pdf'>;

  it('0°: identity placement, footprint 100×200', () => {
    const { pdfToView } = pageGeometry({ crop, rotation: 0, userUnit: 1 }, 1);
    expect(applyPoint(pdfToView, topLeft)).toEqual({ x: 0, y: 0 });
    expect(applyPoint(pdfToView, bottomRight)).toEqual({ x: 100, y: 200 });
  });

  it('90°: footprint swaps to 200×100, top-left lands at the top-right', () => {
    const { pdfToView } = pageGeometry({ crop, rotation: 90, userUnit: 1 }, 1);
    expect(applyPoint(pdfToView, topLeft)).toEqual({ x: 200, y: 0 });
    expect(applyPoint(pdfToView, bottomRight)).toEqual({ x: 0, y: 100 });
  });

  it('180°: dimensions kept, top-left lands at the bottom-right', () => {
    const { pdfToView } = pageGeometry({ crop, rotation: 180, userUnit: 1 }, 1);
    expect(applyPoint(pdfToView, topLeft)).toEqual({ x: 100, y: 200 });
    expect(applyPoint(pdfToView, bottomRight)).toEqual({ x: 0, y: 0 });
  });

  it('270°: footprint swaps to 200×100, top-left lands at the bottom-left', () => {
    const { pdfToView } = pageGeometry({ crop, rotation: 270, userUnit: 1 }, 1);
    expect(applyPoint(pdfToView, topLeft)).toEqual({ x: 0, y: 100 });
    expect(applyPoint(pdfToView, bottomRight)).toEqual({ x: 200, y: 0 });
  });

  it('pdfToView equals contentToView ∘ pdfToContent', () => {
    const g = pageGeometry({ crop, rotation: 90, userUnit: 1 }, 1.7);
    const composed = compose(g.contentToView, g.pdfToContent);
    composed.forEach((v, i) => expect(v).toBeCloseTo(g.pdfToView[i], 9));
  });
});

describe('viewToPdf = invert(pdfToView): hit-testing round-trips', () => {
  const rotations: PageRotation[] = [0, 90, 180, 270];

  it('round-trips a point for every rotation, with userUnit ≠ 1 and a crop offset', () => {
    for (const rotation of rotations) {
      const g = pageGeometry(
        { crop: { left: 12, bottom: -8, right: 312, top: 392 }, rotation, userUnit: 1.5 },
        1.25,
      );
      const p = { x: 100, y: 120 } as PointIn<'pdf'>;
      const back = applyPoint(g.viewToPdf, applyPoint(g.pdfToView, p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('invert is a true two-sided inverse (compose → identity)', () => {
    const { pdfToView, viewToPdf } = pageGeometry(
      { crop: { left: 0, bottom: 0, right: 612, top: 792 }, rotation: 90, userUnit: 1 },
      2,
    );
    const idPoint = applyPoint(compose(viewToPdf, pdfToView), { x: 137, y: 251 } as PointIn<'pdf'>);
    expect(idPoint.x).toBeCloseTo(137, 9);
    expect(idPoint.y).toBeCloseTo(251, 9);
  });
});

describe('compose: associative, and screen falls out with zero new functions', () => {
  it('compose is associative', () => {
    const m = [2, 0, 0, 2, 5, 7] as Mat2D<'view', 'screen'>;
    const n = [0, 1, -1, 0, 3, 4] as Mat2D<'content', 'view'>;
    const o = [1, 0, 0, -1, 10, 20] as Mat2D<'pdf', 'content'>;
    const left = compose(compose(m, n), o);
    const right = compose(m, compose(n, o));
    left.forEach((v, i) => expect(v).toBeCloseTo(right[i], 9));
  });

  it('pdfToScreen / screenToPdf round-trip (scroll + dpr, only compose + invert)', () => {
    const { pdfToView } = pageGeometry(
      { crop: { left: 0, bottom: 0, right: 200, top: 300 }, rotation: 90, userUnit: 1 },
      1.5,
    );
    const dpr = 2;
    const scrollX = -40;
    const scrollY = 130;
    const scroll = [1, 0, 0, 1, scrollX, scrollY] as Mat2D<'view', 'view'>;
    const devicePx = [dpr, 0, 0, dpr, 0, 0] as Mat2D<'view', 'screen'>;
    const viewToScreen = compose(devicePx, scroll);
    const pdfToScreen = compose(viewToScreen, pdfToView);
    const screenToPdf = invert(pdfToScreen);

    const p = { x: 73, y: 211 } as PointIn<'pdf'>;
    const back = applyPoint(screenToPdf, applyPoint(pdfToScreen, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });
});

describe('applyQuad vs applyRect: orientation preserved where a rect would clamp', () => {
  it('a quarter-turn maps quad corners exactly; the rect is their AABB footprint', () => {
    const { pdfToView } = pageGeometry(
      { crop: { left: 0, bottom: 0, right: 100, top: 200 }, rotation: 90, userUnit: 1 },
      1,
    );
    // FS_QUADPOINTSF-order positional quad over the whole page (y-up).
    const quad: QuadIn<'pdf'> = {
      p1: { x: 0, y: 200 },
      p2: { x: 100, y: 200 },
      p3: { x: 100, y: 0 },
      p4: { x: 0, y: 0 },
    };
    expect(applyQuad(pdfToView, quad)).toEqual({
      p1: { x: 200, y: 0 },
      p2: { x: 200, y: 100 },
      p3: { x: 0, y: 100 },
      p4: { x: 0, y: 0 },
    });
    const rect: RectIn<'pdf'> = { x: 0, y: 0, width: 100, height: 200 };
    expect(applyRect(pdfToView, rect)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });

  it('under SKEW, applyQuad keeps the parallelogram while applyRect collapses to a box', () => {
    const shear = [1, 0, 0.5, 1, 0, 0] as Mat2D<'pdf', 'content'>; // x' = x + 0.5y
    const rect: RectIn<'pdf'> = { x: 0, y: 0, width: 10, height: 10 };
    const quad: QuadIn<'pdf'> = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      p3: { x: 10, y: 10 },
      p4: { x: 0, y: 10 },
    };
    // AABB widens to 15 and forgets the slant
    expect(applyRect(shear, rect)).toEqual({ x: 0, y: 0, width: 15, height: 10 });
    // the quad keeps the slanted top edge (x offset by +5)
    const q = applyQuad(shear, quad);
    expect(q.p1).toEqual({ x: 0, y: 0 });
    expect(q.p2).toEqual({ x: 10, y: 0 });
    expect(q.p3).toEqual({ x: 15, y: 10 });
    expect(q.p4).toEqual({ x: 5, y: 10 });
  });
});
