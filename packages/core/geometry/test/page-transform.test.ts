import { describe, expect, it } from 'vitest';
import { deviceHeightForWidth, pageTransform, type PageRotation } from '../src/index';

/**
 * `pageTransform` is the single per-page bridge: page points ↔ view px ↔ device px.
 * These pin (a) device snapping + the engine's width→height rule, (b) the rotation
 * math, (c) the contentToView/viewToContent round-trip, and (d) cssMatrix ≡ contentToView.
 */
describe('pageTransform', () => {
  it('identity: scale 1, dpr 1, no rotation', () => {
    const transform = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 0,
      scale: 1,
      dpr: 1,
    });
    expect(transform.viewWidth).toBe(100);
    expect(transform.viewHeight).toBe(200);
    expect(transform.deviceWidth).toBe(100);
    expect(transform.deviceHeight).toBe(200);
    expect(transform.renderScale).toBe(1);
    expect(transform.contentToView({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    expect(transform.viewToContent({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    expect(transform.cssMatrix).toBe('matrix(1, 0, 0, 1, 0, 0)');
  });

  it('zoom: scale 2 doubles view px and the bitmap', () => {
    const transform = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 0,
      scale: 2,
      dpr: 1,
    });
    expect(transform.viewWidth).toBe(200);
    expect(transform.deviceWidth).toBe(200);
    expect(transform.deviceHeight).toBe(400);
    expect(transform.renderScale).toBe(2);
    expect(transform.contentToView({ x: 10, y: 20 })).toEqual({ x: 20, y: 40 });
  });

  it('dpr 2: the bitmap is 2× the view box (1:1 device → crisp)', () => {
    const transform = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 0,
      scale: 1,
      dpr: 2,
    });
    // box stays 100×200 CSS; bitmap is 200×400 device → exactly 1:1 on a Retina screen
    expect(transform.viewWidth).toBe(100);
    expect(transform.viewHeight).toBe(200);
    expect(transform.deviceWidth).toBe(200);
    expect(transform.deviceHeight).toBe(400);
    expect(transform.renderScale).toBe(2);
    // view-space coordinates are unaffected by dpr
    expect(transform.contentToView({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
  });

  it('toPixels: content-space (un-rotated) scaling for in-wrapper overlays', () => {
    // dpr 2: content box is 100×200 CSS (deviceWidth/dpr); scale stays 1 px/pt
    const transform = pageTransform({
      pageSize: { width: 100, height: 200 },
      rotation: 90,
      scale: 1,
      dpr: 2,
    });
    expect(transform.contentWidth).toBe(100);
    expect(transform.contentHeight).toBe(200);
    // content-space ignores rotation (the wrapper's CSS rotation carries it)
    expect(transform.toPixels({ x: 10, y: 20 })).toEqual({ x: 10, y: 20 });
    // ...while contentToView applies it (content top-left → display top-right)
    expect(transform.contentToView({ x: 0, y: 0 })).toEqual({ x: 200, y: 0 });
  });

  it('snaps device dims to whole pixels (no fractional bitmap)', () => {
    const transform = pageTransform({
      pageSize: { width: 100, height: 100 },
      rotation: 0,
      scale: 1.337,
      dpr: 1,
    });
    expect(transform.deviceWidth).toBe(134); // round(133.7)
    expect(transform.viewWidth).toBe(134); // box matches the snapped bitmap
  });

  it('deviceHeight follows the engine width-rule exactly', () => {
    // PageRenderReader: height = max(1, round(width * h / w))
    expect(deviceHeightForWidth({ width: 612, height: 792 }, 739)).toBe(956); // round(956.3)
    const transform = pageTransform({
      pageSize: { width: 612, height: 792 },
      rotation: 0,
      scale: 739 / 612,
      dpr: 1,
    });
    expect(transform.deviceWidth).toBe(739);
    expect(transform.deviceHeight).toBe(956);
  });

  describe('rotation: footprint swaps; the bitmap stays un-rotated', () => {
    it('90° swaps the view footprint but not the device bitmap', () => {
      const transform = pageTransform({
        pageSize: { width: 100, height: 200 },
        rotation: 90,
        scale: 1,
        dpr: 1,
      });
      expect(transform.viewWidth).toBe(200); // footprint swapped
      expect(transform.viewHeight).toBe(100);
      expect(transform.deviceWidth).toBe(100); // bitmap is the un-rotated content
      expect(transform.deviceHeight).toBe(200);
      // content top-left → display box top-right
      expect(transform.contentToView({ x: 0, y: 0 })).toEqual({ x: 200, y: 0 });
      expect(transform.cssMatrix).toBe('matrix(0, 1, -1, 0, 200, 0)');
    });

    it('whole-page rect maps to the full footprint at 90°', () => {
      const transform = pageTransform({
        pageSize: { width: 100, height: 200 },
        rotation: 90,
        scale: 1,
        dpr: 1,
      });
      expect(transform.contentToViewRect({ x: 0, y: 0, width: 100, height: 200 })).toEqual({
        x: 0,
        y: 0,
        width: 200,
        height: 100,
      });
    });

    it('viewToContentRect is the exact inverse (the visibility primitive)', () => {
      const rotations: PageRotation[] = [0, 90, 180, 270];
      for (const rotation of rotations) {
        const transform = pageTransform({
          pageSize: { width: 100, height: 200 },
          rotation,
          scale: 2,
          dpr: 1,
        });
        // Whole footprint inverts to the whole page…
        const whole = transform.viewToContentRect({
          x: 0,
          y: 0,
          width: transform.viewWidth,
          height: transform.viewHeight,
        });
        expect(whole.x).toBeCloseTo(0);
        expect(whole.y).toBeCloseTo(0);
        expect(whole.width).toBeCloseTo(100);
        expect(whole.height).toBeCloseTo(200);
        // …and a round trip through contentToViewRect is the identity — the
        // guarantee that lets the stage's visibleRect and toContentPoint hit
        // the same coordinates for every quarter-turn.
        const rect = { x: 10, y: 20, width: 30, height: 40 };
        const back = transform.viewToContentRect(transform.contentToViewRect(rect));
        expect(back.x).toBeCloseTo(rect.x);
        expect(back.y).toBeCloseTo(rect.y);
        expect(back.width).toBeCloseTo(rect.width);
        expect(back.height).toBeCloseTo(rect.height);
      }
    });
  });

  describe('contentToView ∘ viewToContent is identity (every rotation × scale × dpr)', () => {
    const rotations: PageRotation[] = [0, 90, 180, 270];
    const scales = [1, 2, 0.5, 1.333];
    const dprs = [1, 2];
    const points = [
      { x: 0, y: 0 },
      { x: 137, y: 42 },
      { x: 610, y: 791 },
    ];
    for (const rotation of rotations) {
      for (const scale of scales) {
        for (const dpr of dprs) {
          it(`rot ${rotation}, scale ${scale}, dpr ${dpr}`, () => {
            const transform = pageTransform({
              pageSize: { width: 612, height: 792 },
              rotation,
              scale,
              dpr,
            });
            for (const point of points) {
              const back = transform.viewToContent(transform.contentToView(point));
              expect(back.x).toBeCloseTo(point.x, 4);
              expect(back.y).toBeCloseTo(point.y, 4);
            }
          });
        }
      }
    }
  });
});

/*
 * `baseScale`/`zoom`: the page's physical 100% (viewUnitsPerPoint × userUnit)
 * and its zoom relative to it — the number zoom-relative policies (the /F
 * NoZoom exemption) consume. Distinct from `viewScale`, a units conversion.
 */
describe('pageTransform baseScale/zoom: percent-of-100% semantics', () => {
  const pageSize = { width: 612, height: 792 };

  it('zoom is 1 exactly at the declared 100% (web: scale = 96/72)', () => {
    const transform = pageTransform({
      pageSize,
      rotation: 0,
      scale: 96 / 72,
      baseScale: 96 / 72,
      dpr: 1,
    });
    expect(transform.baseScale).toBeCloseTo(96 / 72, 6);
    expect(transform.zoom).toBeCloseTo(1, 3); // device snapping may add ~1e-4
  });

  it('userUnit folds into the baseline: a userUnit-5 page at physical 100% reads zoom 1', () => {
    const userUnit = 5;
    const base = (96 / 72) * userUnit;
    const transform = pageTransform({
      pageSize,
      rotation: 0,
      scale: base,
      baseScale: base,
      dpr: 1,
    });
    expect(transform.zoom).toBeCloseTo(1, 3);
    // …and doubling the displayed size reads as 200%.
    const t2 = pageTransform({ pageSize, rotation: 0, scale: base * 2, baseScale: base, dpr: 1 });
    expect(t2.zoom).toBeCloseTo(2, 3);
  });

  it('defaults to a neutral baseline (zoom ≈ 1) when the caller declares none', () => {
    const transform = pageTransform({ pageSize, rotation: 0, scale: 0.42, dpr: 2 });
    expect(transform.baseScale).toBeCloseTo(0.42, 6);
    expect(transform.zoom).toBeCloseTo(1, 2);
  });
});
