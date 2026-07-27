import { describe, expect, it } from 'vitest';
import { deviceHeightForWidth, pageTransform, type PageRotation } from '../src/index';

/**
 * `pageTransform` is the single per-page bridge: page points ↔ view px ↔ device px.
 * These pin (a) device snapping + the engine's width→height rule, (b) the rotation
 * math, (c) the pageToView/viewToPage round-trip, and (d) cssMatrix ≡ pageToView.
 */
describe('pageTransform', () => {
  it('identity: scale 1, dpr 1, no rotation', () => {
    const t = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 0,
      scale: 1,
      dpr: 1,
    });
    expect(t.viewWidth).toBe(100);
    expect(t.viewHeight).toBe(200);
    expect(t.deviceWidth).toBe(100);
    expect(t.deviceHeight).toBe(200);
    expect(t.renderScale).toBe(1);
    expect(t.pageToView({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    expect(t.viewToPage({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    expect(t.cssMatrix).toBe('matrix(1, 0, 0, 1, 0, 0)');
  });

  it('zoom: scale 2 doubles view px and the bitmap', () => {
    const t = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 0,
      scale: 2,
      dpr: 1,
    });
    expect(t.viewWidth).toBe(200);
    expect(t.deviceWidth).toBe(200);
    expect(t.deviceHeight).toBe(400);
    expect(t.renderScale).toBe(2);
    expect(t.pageToView({ x: 10, y: 20 })).toEqual({ x: 20, y: 40 });
  });

  it('dpr 2: the bitmap is 2× the view box (1:1 device → crisp)', () => {
    const t = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 0,
      scale: 1,
      dpr: 2,
    });
    // box stays 100×200 CSS; bitmap is 200×400 device → exactly 1:1 on a Retina screen
    expect(t.viewWidth).toBe(100);
    expect(t.viewHeight).toBe(200);
    expect(t.deviceWidth).toBe(200);
    expect(t.deviceHeight).toBe(400);
    expect(t.renderScale).toBe(2);
    // view-space coordinates are unaffected by dpr
    expect(t.pageToView({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it('pageToContent: content-space (un-rotated) scaling for in-wrapper overlays', () => {
    // dpr 2: content box is 100×200 CSS (deviceWidth/dpr); scale stays 1 px/pt
    const t = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 90,
      scale: 1,
      dpr: 2,
    });
    expect(t.contentWidth).toBe(100);
    expect(t.contentHeight).toBe(200);
    // content-space ignores rotation (the wrapper's CSS rotation carries it)
    expect(t.pageToContent({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    // ...while pageToView applies it (content top-left → display top-right)
    expect(t.pageToView({ x: 0, y: 0 })).toEqual({ x: 200, y: 0 });
  });

  it('snaps device dims to whole pixels (no fractional bitmap)', () => {
    const t = pageTransform({
      pageSize: { width: 100, height: 100 },
      rotation: 0,
      scale: 1.337,
      dpr: 1,
    });
    expect(t.deviceWidth).toBe(134); // round(133.7)
    expect(t.viewWidth).toBe(134); // box matches the snapped bitmap
  });

  it('deviceHeight follows the engine width-rule exactly', () => {
    // PageRenderReader: height = max(1, round(width * h / w))
    expect(deviceHeightForWidth({ width: 612, height: 792 }, 739)).toBe(956); // round(956.3)
    const t = pageTransform({
      pageSize: { width: 612, height: 792 },
      rotation: 0,
      scale: 739 / 612,
      dpr: 1,
    });
    expect(t.deviceWidth).toBe(739);
    expect(t.deviceHeight).toBe(956);
  });

  describe('rotation: footprint swaps; the bitmap stays un-rotated', () => {
    it('90° swaps the view footprint but not the device bitmap', () => {
      const t = pageTransform({
        pageSize: { width: 100, height: 200 },
        rotation: 90,
        scale: 1,
        dpr: 1,
      });
      expect(t.viewWidth).toBe(200); // footprint swapped
      expect(t.viewHeight).toBe(100);
      expect(t.deviceWidth).toBe(100); // bitmap is the UN-rotated content
      expect(t.deviceHeight).toBe(200);
      // content top-left → display box top-right
      expect(t.pageToView({ x: 0, y: 0 })).toEqual({ x: 200, y: 0 });
      expect(t.cssMatrix).toBe('matrix(0, 1, -1, 0, 200, 0)');
    });

    it('whole-page rect maps to the full footprint at 90°', () => {
      const t = pageTransform({
        pageSize: { width: 100, height: 200 },
        rotation: 90,
        scale: 1,
        dpr: 1,
      });
      expect(t.pageToViewRect({ x: 0, y: 0, width: 100, height: 200 })).toEqual({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      });
    });

    it('viewToPageRect is the exact inverse (the visibility primitive)', () => {
      const rotations: PageRotation[] = [0, 90, 180, 270];
      for (const rotation of rotations) {
        const t = pageTransform({
          pageSize: { width: 100, height: 200 },
          rotation,
          scale: 2,
          dpr: 1,
        });
        // Whole footprint inverts to the whole page…
        const whole = t.viewToPageRect({ x: 0, y: 0, width: t.viewWidth, height: t.viewHeight });
        expect(whole.x).toBeCloseTo(0);
        expect(whole.y).toBeCloseTo(0);
        expect(whole.width).toBeCloseTo(100);
        expect(whole.height).toBeCloseTo(200);
        // …and a round trip through pageToViewRect is the identity — the
        // guarantee that lets the stage's visibleRect and toPagePoint hit
        // the same coordinates for every quarter-turn.
        const r = { x: 10, y: 20, width: 30, height: 40 };
        const back = t.viewToPageRect(t.pageToViewRect(r));
        expect(back.x).toBeCloseTo(r.x);
        expect(back.y).toBeCloseTo(r.y);
        expect(back.width).toBeCloseTo(r.width);
        expect(back.height).toBeCloseTo(r.height);
      }
    });
  });

  describe('pageToView ∘ viewToPage is identity (every rotation × scale × dpr)', () => {
    const rotations: PageRotation[] = [0, 90, 180, 270];
    const scales = [1, 2, 0.5, 1.333];
    const dprs = [1, 2];
    const pts = [
      { x: 0, y: 0 },
      { x: 137, y: 42 },
      { x: 610, y: 791 },
    ];
    for (const rotation of rotations) {
      for (const scale of scales) {
        for (const dpr of dprs) {
          it(`rot ${rotation}, scale ${scale}, dpr ${dpr}`, () => {
            const t = pageTransform({
              pageSize: { width: 612, height: 792 },
              rotation,
              scale,
              dpr,
            });
            for (const p of pts) {
              const back = t.viewToPage(t.pageToView(p));
              expect(back.x).toBeCloseTo(p.x, 4);
              expect(back.y).toBeCloseTo(p.y, 4);
            }
          });
        }
      }
    }
  });
});

/*
 * `baseScale`/`zoom`: the page's PHYSICAL 100% (viewUnitsPerPoint × userUnit)
 * and its zoom relative to it — the number zoom-relative policies (the /F
 * NoZoom exemption) consume. Distinct from `viewScale`, a units conversion.
 */
describe('pageTransform baseScale/zoom: percent-of-100% semantics', () => {
  const pageSize = { width: 612, height: 792 };

  it('zoom is 1 exactly at the declared 100% (web: scale = 96/72)', () => {
    const t = pageTransform({ pageSize, rotation: 0, scale: 96 / 72, baseScale: 96 / 72, dpr: 1 });
    expect(t.baseScale).toBeCloseTo(96 / 72, 6);
    expect(t.zoom).toBeCloseTo(1, 3); // device snapping may add ~1e-4
  });

  it('userUnit folds into the baseline: a userUnit-5 page at physical 100% reads zoom 1', () => {
    const userUnit = 5;
    const base = (96 / 72) * userUnit;
    const t = pageTransform({ pageSize, rotation: 0, scale: base, baseScale: base, dpr: 1 });
    expect(t.zoom).toBeCloseTo(1, 3);
    // …and doubling the displayed size reads as 200%.
    const t2 = pageTransform({ pageSize, rotation: 0, scale: base * 2, baseScale: base, dpr: 1 });
    expect(t2.zoom).toBeCloseTo(2, 3);
  });

  it('defaults to a neutral baseline (zoom ≈ 1) when the caller declares none', () => {
    const t = pageTransform({ pageSize, rotation: 0, scale: 0.42, dpr: 2 });
    expect(t.baseScale).toBeCloseTo(0.42, 6);
    expect(t.zoom).toBeCloseTo(1, 2);
  });
});
