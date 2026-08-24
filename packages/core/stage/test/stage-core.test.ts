import { describe, expect, it } from 'vitest';
import * as S from '../src';

const vp = { width: 1000, height: 700 };
const GAP = 16;

/** Build a PageGeom from intrinsic dimensions (the layout fns take `size`, not bare w/h). */
const pg = (width: number, height: number, rotation?: S.PageRotation): S.PageGeom => ({
  size: { width, height },
  ...(rotation !== undefined ? { rotation } : {}),
});

describe('resolveZoom', () => {
  it('fit-width fits the box width (minus gap)', () => {
    expect(
      S.resolveZoom({ mode: S.ZoomMode.FitWidth }, { width: 2000, height: 800 }, vp, GAP),
    ).toBeCloseTo((1000 - 2 * GAP) / 2000, 6);
  });

  it('fit-page fits the smaller of width/height', () => {
    expect(
      S.resolveZoom({ mode: S.ZoomMode.FitPage }, { width: 2000, height: 3000 }, vp, GAP),
    ).toBeCloseTo(Math.min((1000 - 2 * GAP) / 2000, (700 - 2 * GAP) / 3000), 6);
  });

  it('automatic = fit-width but capped at 100% (height-independent)', () => {
    // narrow box → fit-width would upscale → capped to 1
    expect(
      S.resolveZoom({ mode: S.ZoomMode.Automatic }, { width: 400, height: 800 }, vp, GAP),
    ).toBe(1);
    // wide box → below 100% → fits width
    expect(
      S.resolveZoom({ mode: S.ZoomMode.Automatic }, { width: 2000, height: 800 }, vp, GAP),
    ).toBeCloseTo((1000 - 2 * GAP) / 2000, 6);
    // a tall page does NOT zoom out — automatic ignores height
    expect(
      S.resolveZoom({ mode: S.ZoomMode.Automatic }, { width: 400, height: 5000 }, vp, GAP),
    ).toBe(1);
  });

  it('a fixed level passes through, clamped to [ZOOM_MIN, ZOOM_MAX]', () => {
    expect(S.resolveZoom({ level: 2.5 }, { width: 1, height: 1 }, vp)).toBe(2.5);
    expect(S.resolveZoom({ level: 999 }, { width: 1, height: 1 }, vp)).toBe(S.ZOOM_MAX);
    expect(S.resolveZoom({ level: 0 }, { width: 1, height: 1 }, vp)).toBe(S.ZOOM_MIN);
  });

  it('pageWidth/pageHeight: absolute pixel targets, document-independent', () => {
    // a 612pt letter and a 2880pt construction sheet both render 200px wide
    expect(612 * S.resolveZoom({ pageWidth: 200 }, { width: 612, height: 792 }, vp)).toBeCloseTo(
      200,
      6,
    );
    expect(2880 * S.resolveZoom({ pageWidth: 200 }, { width: 2880, height: 2000 }, vp)).toBeCloseTo(
      200,
      6,
    );
    // vertical twin (filmstrip): box height = N px
    expect(792 * S.resolveZoom({ pageHeight: 150 }, { width: 612, height: 792 }, vp)).toBeCloseTo(
      150,
      6,
    );
    // clamped like every other intent
    expect(S.resolveZoom({ pageWidth: 1 }, { width: 1e9, height: 1 }, vp)).toBe(S.ZOOM_MIN);
  });
});

describe('placeCamera — THE placement algorithm (pure align; the caller clamps)', () => {
  const scene = S.linearLayout(
    [pg(600, 800), pg(600, 800), pg(600, 800)],
    S.groupPages(3, 'none'),
    { axis: 'y', gap: GAP },
  );
  const rect = (i: number) => {
    const it = scene.items[i];
    return { x: it.x, y: it.y, width: it.width, height: it.height };
  };

  it('the landing rule is ZOOM-INVARIANT: start/start puts the reading corner at the gutter, fitting or overflowing', () => {
    for (const zoom of [0.5, 1, 2]) {
      const cam = S.placeCamera(rect(1), vp, zoom, 24);
      expect((scene.items[1].x - cam.x) * cam.zoom).toBeCloseTo(24, 6);
      expect((scene.items[1].y - cam.y) * cam.zoom).toBeCloseTo(24, 6);
    }
  });

  it("'end' = far edges flush (a padding in), at every zoom", () => {
    const r = rect(1);
    for (const zoom of [0.5, 2]) {
      const cam = S.placeCamera(r, vp, zoom, 24, { x: 'end', y: 'start' });
      expect((r.x + r.width - cam.x) * cam.zoom).toBeCloseTo(vp.width - 24, 6);
      expect((r.y - cam.y) * cam.zoom).toBeCloseTo(24, 6);
    }
  });

  it("'center' centers the subject, fitting (presented) or overflowing (Drawboard)", () => {
    const r = rect(1);
    for (const zoom of [0.5, 2]) {
      const cam = S.placeCamera(r, vp, zoom, 24, { x: 'center', y: 'center' });
      expect((r.x + r.width / 2 - cam.x) * cam.zoom).toBeCloseTo(vp.width / 2, 6);
      expect((r.y + r.height / 2 - cam.y) * cam.zoom).toBeCloseTo(vp.height / 2, 6);
    }
  });

  it("a fraction puts the subject CENTER at that viewport line ('center' ≡ 0.5)", () => {
    const r = rect(1);
    const cam = S.placeCamera(r, vp, 1, 24, { x: 'center', y: 0.35 });
    expect((r.y + r.height / 2 - cam.y) * cam.zoom).toBeCloseTo(vp.height * 0.35, 6);
    const half = S.placeCamera(r, vp, 1, 24, { x: 'center', y: 0.5 });
    expect(half).toEqual(S.placeCamera(r, vp, 1, 24, { x: 'center', y: 'center' }));
  });

  it('composed with clampCamera, a no-freedom axis collapses to the fitAlign rest (the old fit-case, from geometry)', () => {
    // zoom 0.5: the page fits BOTH axes, but the true bounds (the scene) still
    // overflow y — so the start landing survives on y, while x (the scene fits)
    // is locked to the default center rest. Alignment is policy; rest is clamp.
    const r = rect(1);
    const placed = S.placeCamera(r, vp, 0.5, 24, { x: 'start', y: 'start' });
    const bounds = { x: 0, y: 0, width: scene.size.width, height: scene.size.height };
    const clamped = S.clampCamera(placed, bounds, vp, { bounded: true, padding: 24 });
    expect((r.x + r.width / 2 - clamped.x) * clamped.zoom).toBeCloseTo(vp.width / 2, 6); // x: rest
    expect((r.y - clamped.y) * clamped.zoom).toBeCloseTo(24, 6); // y: the landing survives
  });
});

describe('revealCamera — scrollIntoView as camera math', () => {
  const rect = { x: 100, y: 2000, width: 300, height: 400 };

  it('already fully visible → the camera is unchanged (no-op by construction)', () => {
    const cam = { x: 0, y: 1900, zoom: 1 }; // window [1900..2600] contains [2000..2400]
    expect(S.revealCamera(cam, rect, vp, 24)).toEqual(cam);
  });

  it('target below → MINIMAL scroll: far edge lands a padding inside', () => {
    const cam = { x: 0, y: 0, zoom: 1 }; // rect is far below the window
    const out = S.revealCamera(cam, rect, vp, 24);
    expect(out.y).toBeCloseTo(2000 + 400 - (700 - 24), 6); // bottom edge + padding
    expect(out.x).toBe(0); // x already fine → untouched (per-axis independence)
  });

  it('target above → minimal scroll the other way: near edge + padding', () => {
    const cam = { x: 0, y: 5000, zoom: 1 };
    expect(S.revealCamera(cam, rect, vp, 24).y).toBeCloseTo(2000 - 24, 6);
  });

  it('oversized target → aligns its start (like scrollIntoView)', () => {
    const big = { x: 0, y: 2000, width: 300, height: 5000 };
    expect(S.revealCamera({ x: 0, y: 0, zoom: 1 }, big, vp, 24).y).toBeCloseTo(2000 - 24, 6);
  });
});

describe('zoomAround', () => {
  it('keeps the world point under the cursor fixed (no drift)', () => {
    const c = { x: 100, y: 50, zoom: 1 };
    const cursor = { x: 300, y: 200 };
    const before = S.toWorld(c, cursor);
    const after = S.toWorld(S.zoomAround(c, cursor, 2.3), cursor);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});

describe('anchor round-trip', () => {
  it('cameraFromAnchor inverts anchorFromCamera', () => {
    const scene = S.linearLayout(
      [pg(600, 800), pg(600, 800), pg(600, 800)],
      S.groupPages(3, 'none'),
      {
        axis: 'y',
        gap: GAP,
      },
    );
    const cam = { x: scene.items[1].x, y: scene.items[1].y + 120, zoom: 1.3 };
    const anchor = S.anchorFromCamera(cam, scene, vp);
    const back = S.cameraFromAnchor(anchor, scene, vp, 1.3);
    expect(back.x).toBeCloseTo(cam.x, 4);
    expect(back.y).toBeCloseTo(cam.y, 4);
  });

  it('round-trips at ANY policy point — capture and restore just have to agree', () => {
    const scene = S.linearLayout([pg(600, 800), pg(600, 800)], S.groupPages(2, 'none'), {
      axis: 'y',
      gap: GAP,
    });
    const cam = { x: -100, y: 300, zoom: 0.9 };
    for (const at of [
      { x: 0, y: 0 }, // anchorAlign start/start — the browser scroll model
      { x: vp.width / 2, y: vp.height * 0.35 }, // a fraction policy
    ]) {
      const anchor = S.anchorFromCamera(cam, scene, vp, at);
      const back = S.cameraFromAnchor(anchor, scene, vp, 0.9, at);
      expect(back.x).toBeCloseTo(cam.x, 4);
      expect(back.y).toBeCloseTo(cam.y, 4);
    }
  });
});

describe('clampCamera', () => {
  const k0 = { bounded: true, padding: 0 } as const;

  it('clamps the camera within the content when bounded', () => {
    const clamped = S.clampCamera(
      { x: 0, y: 99999, zoom: 1 },
      { x: 0, y: 0, width: 1000, height: 5000 },
      vp,
      k0,
    );
    expect(clamped.y).toBeLessThanOrEqual(5000 - vp.height + 0.001);
    expect(clamped.y).toBeGreaterThanOrEqual(0);
  });

  it('passes through untouched when unbounded', () => {
    const c = { x: 0, y: 99999, zoom: 1 };
    expect(
      S.clampCamera(c, { x: 0, y: 0, width: 10, height: 10 }, vp, {
        bounded: false,
        padding: 0,
      }),
    ).toEqual(c);
  });

  it('confines to a NON-zero-origin rect (a single paged item)', () => {
    // an item sitting at world y=4000, height 800, viewport 700 tall (item taller than vp)
    const bounds = { x: 0, y: 4000, width: 1000, height: 800 };
    const top = S.clampCamera({ x: 0, y: -99999, zoom: 1 }, bounds, vp, k0);
    expect(top.y).toBeCloseTo(4000, 6); // can't scroll above the item's top
    const bottom = S.clampCamera({ x: 0, y: 99999, zoom: 1 }, bounds, vp, k0);
    expect(bottom.y).toBeCloseTo(4000 + 800 - vp.height, 6); // nor below its bottom
  });

  it('centers a small item within its rect (fit-case respects origin)', () => {
    // item smaller than the viewport ⇒ centered around bounds.y, not 0
    const bounds = { x: 0, y: 4000, width: 300, height: 300 };
    const c = S.clampCamera({ x: 0, y: 0, zoom: 1 }, bounds, vp, k0);
    expect(c.y).toBeCloseTo(4000 + (300 - vp.height) / 2, 6); // centered within the item's rect
  });

  it('fitAlign picks the REST point of a fitting axis (start/end, logical x)', () => {
    const bounds = { x: 0, y: 0, width: 300, height: 300 }; // fits both axes
    const k = (fa: S.Alignment, direction?: S.Direction) =>
      ({ bounded: true, padding: 24, fitAlign: fa, direction }) as S.CameraConstraint;
    // y:'start' — content's top edge a padding below the viewport top
    const top = S.clampCamera({ x: 0, y: 0, zoom: 1 }, bounds, vp, k({ x: 'center', y: 'start' }));
    expect(top.y).toBeCloseTo(-24, 6); // camera above origin by the gutter
    // y:'end' — bottom edge a padding above the viewport bottom
    const bot = S.clampCamera({ x: 0, y: 0, zoom: 1 }, bounds, vp, k({ x: 'center', y: 'end' }));
    expect(bot.y).toBeCloseTo(300 - (vp.height - 24), 6);
    // logical x: RTL + 'start' rests at the RIGHT edge (mirrors to 'end')
    const rtl = S.clampCamera(
      { x: 0, y: 0, zoom: 1 },
      bounds,
      vp,
      k({ x: 'start', y: 'center' }, 'rtl'),
    );
    expect(rtl.x).toBeCloseTo(300 - (vp.width - 24), 6);
  });

  it('padding = a constant breathing gutter the camera may reveal', () => {
    const p = 24;
    const k = { bounded: true, padding: p } as const;
    const bounds = { x: 0, y: 0, width: 1000, height: 5000 };
    // may scroll up to `padding` beyond each content edge…
    const top = S.clampCamera({ x: 0, y: -99999, zoom: 1 }, bounds, vp, k);
    expect(top.y).toBeCloseTo(-p, 6);
    const bottom = S.clampCamera({ x: 0, y: 99999, zoom: 1 }, bounds, vp, k);
    expect(bottom.y).toBeCloseTo(5000 - vp.height + p, 6);
    // …and at exactly fit-width zoom, the lock leaves exactly `padding` per side.
    const zFit = (vp.width - 2 * p) / 1000;
    const fit = S.clampCamera({ x: -99999, y: 0, zoom: zFit }, bounds, vp, k);
    expect(fit.x * zFit).toBeCloseTo(-p, 4); // padding of gutter on the left
  });
});

describe('scrollMetrics — the camera as a native scroller', () => {
  const P = 24;
  const bounds = { x: 0, y: 0, width: 800, height: 5000 }; // y overflows vp, x fits
  const k = { bounded: true, padding: P } as const;

  it('bounded overflow: the DOM identities hold, aligned with the clamp', () => {
    // camera clamped to the very top → scrollTop 0
    const top = S.clampCamera({ x: 0, y: -99999, zoom: 1 }, bounds, vp, k);
    const mTop = S.scrollMetrics(top, bounds, vp, P);
    expect(mTop.scrollTop).toBeCloseTo(0, 6);
    expect(mTop.scrollHeight).toBeCloseTo(5000 + 2 * P, 6); // padded content extent
    expect(mTop.clientHeight).toBe(vp.height);
    expect(mTop.scrollableY).toBe(true);
    // clamped to the very bottom → scrollTop === scrollHeight − clientHeight,
    // exactly the DOM's max — the clamp and the scroller share travelRange
    const bot = S.clampCamera({ x: 0, y: 99999, zoom: 1 }, bounds, vp, k);
    const mBot = S.scrollMetrics(bot, bounds, vp, P);
    expect(mBot.scrollTop).toBeCloseTo(mBot.scrollHeight - mBot.clientHeight, 6);
  });

  it('a fitting axis reports unscrollable with offset 0 (native: no bar)', () => {
    const c = S.clampCamera({ x: 0, y: 0, zoom: 1 }, bounds, vp, k); // x fits, rests centered
    const m = S.scrollMetrics(c, bounds, vp, P);
    expect(m.scrollableX).toBe(false);
    expect(m.scrollLeft).toBeCloseTo(0, 6);
    expect(m.scrollWidth).toBeCloseTo(vp.width, 6); // DOM: scrollWidth = clientWidth when nothing overflows
  });

  it('zoom scales the range: doubling zoom doubles the content extent', () => {
    const c = S.clampCamera({ x: 0, y: 100, zoom: 2 }, bounds, vp, k);
    const m = S.scrollMetrics(c, bounds, vp, P);
    expect(m.scrollHeight).toBeCloseTo(5000 * 2 + 2 * P, 6);
    expect(m.scrollableX).toBe(true); // 800 * 2 now overflows 1000 − it scrolls
  });

  it('unbounded: the range is the union of content and window (the Figma bar)', () => {
    // camera parked far LEFT of the content — thumb hugs the start
    const west = { x: -3000, y: 0, zoom: 1 };
    const mW = S.scrollMetrics(west, bounds, vp, P);
    expect(mW.scrollLeft).toBeCloseTo(0, 6);
    expect(mW.scrollWidth).toBeCloseTo(800 + P - -3000, 6); // union: window lo → content hi (padded)
    expect(mW.scrollableX).toBe(true);
    // camera far RIGHT — thumb hugs the end
    const east = { x: 4000, y: 0, zoom: 1 };
    const mE = S.scrollMetrics(east, bounds, vp, P);
    expect(mE.scrollLeft).toBeCloseTo(mE.scrollWidth - mE.clientWidth, 6);
  });

  it('unbounded with everything in view: unscrollable, like a fitting native div', () => {
    // zoomed way out: the window ([-300, 9700] × [-300, 6700] world) covers the
    // whole padded content ([-240, 1040] × [-240, 5240])
    const c = { x: -300, y: -300, zoom: 0.1 };
    const m = S.scrollMetrics(c, bounds, vp, P);
    expect(m.scrollableX).toBe(false);
    expect(m.scrollableY).toBe(false);
  });

  it('cameraFromScroll: Element.scrollTo semantics — absolute, clamped, per-axis', () => {
    const c = S.clampCamera({ x: 0, y: 1000, zoom: 1 }, bounds, vp, k);
    const m = S.scrollMetrics(c, bounds, vp, P);
    // round-trip: writing the current offsets back is the identity
    const same = S.cameraFromScroll(c, bounds, vp, P, { left: m.scrollLeft, top: m.scrollTop });
    expect(same.x).toBeCloseTo(c.x, 6);
    expect(same.y).toBeCloseTo(c.y, 6);
    // an omitted axis does not move; a present one lands exactly
    const moved = S.cameraFromScroll(c, bounds, vp, P, { top: 2000 });
    expect(moved.x).toBeCloseTo(c.x, 6);
    expect(S.scrollMetrics(moved, bounds, vp, P).scrollTop).toBeCloseTo(2000, 6);
    // beyond the end clamps to max (scrollHeight − clientHeight), like the DOM
    const over = S.cameraFromScroll(c, bounds, vp, P, { top: 1e9 });
    const mo = S.scrollMetrics(over, bounds, vp, P);
    expect(mo.scrollTop).toBeCloseTo(mo.scrollHeight - mo.clientHeight, 6);
    // zoom is untouched — scrolling is a pan in scroller clothing
    expect(over.zoom).toBe(c.zoom);
  });
});

describe('resolveZoom: fit-all', () => {
  it('fits the whole scene box (same math as fit-page, whole-scene box)', () => {
    const sceneBox = { width: 3000, height: 2400 };
    expect(S.resolveZoom({ mode: S.ZoomMode.FitAll }, sceneBox, vp, GAP)).toBeCloseTo(
      Math.min((1000 - 2 * GAP) / 3000, (700 - 2 * GAP) / 2400),
      6,
    );
  });
});

describe('layout maxItemSize', () => {
  it('linearLayout reports the max item width & height across mixed pages', () => {
    const scene = S.linearLayout(
      [pg(600, 800), pg(900, 700), pg(600, 1200)],
      S.groupPages(3, 'none'),
      { axis: 'y', gap: GAP },
    );
    expect(scene.maxItemSize).toEqual({ width: 900, height: 1200 });
  });

  it('gridLayout reports the cell max as max item size', () => {
    const scene = S.gridLayout([pg(600, 800), pg(900, 700)], S.groupPages(2, 'none'), { gap: 48 });
    expect(scene.maxItemSize).toEqual({ width: 900, height: 800 });
  });
});

describe('sizing: uniform (cross-axis equalize)', () => {
  const mixed = [
    pg(600, 800), // portrait
    pg(1000, 700), // widest
    pg(500, 900), // narrow + tallest
  ];

  it('vertical uniform makes every item width equal (to the widest) + records contentScale', () => {
    const scene = S.linearLayout(mixed, S.groupPages(3, 'none'), {
      axis: 'y',
      gap: GAP,
      sizing: 'uniform',
    });
    expect(scene.items.every((it) => Math.abs(it.width - 1000) < 1e-6)).toBe(true);
    expect(scene.items[1].pages[0].contentScale).toBeCloseTo(1, 6); // widest → factor 1
    expect(scene.items[0].pages[0].contentScale).toBeCloseTo(1000 / 600, 6);
    expect(scene.items[2].pages[0].contentScale).toBeCloseTo(1000 / 500, 6);
    expect(scene.items[0].height).toBeCloseTo(800 * (1000 / 600), 6); // height scales too
  });

  it('horizontal uniform makes every item height equal (to the tallest)', () => {
    const scene = S.linearLayout(mixed, S.groupPages(3, 'none'), {
      axis: 'x',
      gap: GAP,
      sizing: 'uniform',
    });
    expect(scene.items.every((it) => Math.abs(it.height - 900) < 1e-6)).toBe(true);
    expect(scene.items[2].pages[0].contentScale).toBeCloseTo(1, 6); // tallest → factor 1
    expect(scene.items[0].pages[0].contentScale).toBeCloseTo(900 / 800, 6);
  });
  it('intrinsic keeps true sizes (contentScale 1)', () => {
    const scene = S.linearLayout(mixed, S.groupPages(3, 'none'), {
      axis: 'y',
      gap: GAP,
      sizing: 'intrinsic',
    });
    expect(scene.items.map((it) => it.width)).toEqual([600, 1000, 500]);
    expect(scene.items.every((it) => it.pages[0].contentScale === 1)).toBe(true);
  });
});

describe('viewUnitsPerPoint: physical unit factor folds into the layout', () => {
  const f = 96 / 72;
  const page = [pg(612, 792)]; // US Letter (points)

  it('intrinsic: world size = points × factor, contentScale = factor', () => {
    const scene = S.linearLayout(page, S.groupPages(1, 'none'), { viewUnitsPerPoint: f });
    expect(scene.items[0].pages[0].contentScale).toBeCloseTo(f, 6);
    expect(scene.items[0].width).toBeCloseTo(612 * f, 4); // 816 CSS px
    expect(scene.items[0].height).toBeCloseTo(792 * f, 4);
  });

  it('defaults to 1 (neutral): world = points', () => {
    const scene = S.linearLayout(page, S.groupPages(1, 'none'));
    expect(scene.items[0].pages[0].contentScale).toBeCloseTo(1, 6);
    expect(scene.items[0].width).toBeCloseTo(612, 4);
  });

  it('uniform: factor composes with cross-equalize', () => {
    const mixed = [pg(600, 800), pg(1000, 700)];
    const scene = S.linearLayout(mixed, S.groupPages(2, 'none'), {
      sizing: 'uniform',
      viewUnitsPerPoint: f,
    });
    // every item equalized to the widest (1000pt) × factor
    expect(scene.items.every((it) => Math.abs(it.width - 1000 * f) < 1e-4)).toBe(true);
    expect(scene.items[0].pages[0].contentScale).toBeCloseTo((1000 / 600) * f, 6);
  });
});

describe('page rotation: the box is the DISPLAY footprint (w↔h for quarter-turns)', () => {
  it('a 90° page lays out as landscape; the PageBox carries the rotation', () => {
    const scene = S.linearLayout([pg(600, 800, 90)], S.groupPages(1, 'none'), {
      axis: 'y',
      gap: GAP,
      sizing: 'intrinsic',
    });
    const box = scene.items[0].pages[0];
    // intrinsic 600×800 portrait, rotated 90° → 800×600 landscape footprint
    expect(box.width).toBe(800);
    expect(box.height).toBe(600);
    expect(box.rotation).toBe(90);
    expect(box.contentScale).toBe(1); // rotation is isotropic — scale unaffected
  });

  it('180° keeps dimensions; 270° swaps them (same as 90°)', () => {
    const half = S.linearLayout([pg(600, 800, 180)], S.groupPages(1, 'none'), {
      axis: 'y',
      gap: GAP,
    });
    expect([half.items[0].pages[0].width, half.items[0].pages[0].height]).toEqual([600, 800]);
    const three = S.linearLayout([pg(600, 800, 270)], S.groupPages(1, 'none'), {
      axis: 'y',
      gap: GAP,
    });
    expect([three.items[0].pages[0].width, three.items[0].pages[0].height]).toEqual([800, 600]);
  });

  it('uniform equalizes the DISPLAY width — a rotated page sizes to its footprint', () => {
    // page 0 is a portrait rotated 90° → 800-wide footprint, the widest.
    const scene = S.linearLayout(
      [
        pg(600, 800, 90), // display 800×600 — widest footprint
        pg(700, 500), // display 700×500
      ],
      S.groupPages(2, 'none'),
      { axis: 'y', gap: GAP, sizing: 'uniform' },
    );
    expect(scene.items.every((it) => Math.abs(it.width - 800) < 1e-6)).toBe(true);
    expect(scene.items[0].pages[0].contentScale).toBeCloseTo(1, 6); // widest footprint → factor 1
    expect(scene.items[1].pages[0].contentScale).toBeCloseTo(800 / 700, 6);
  });
});

describe('direction: rtl (a layout property, not a navigation one)', () => {
  const four = Array.from({ length: 4 }, () => pg(600, 800));

  it('horizontal rtl: page 1 sits at the RIGHT, items advance leftward', () => {
    const scene = S.linearLayout(four, S.groupPages(4, 'none'), {
      axis: 'x',
      gap: GAP,
      direction: 'rtl',
    });
    // item 0 is the rightmost, item 3 the leftmost
    expect(scene.items[0].x).toBeCloseTo(scene.size.width - 600, 6);
    expect(scene.items[3].x).toBeCloseTo(0, 6);
    // the spatial index still works on the mirrored geometry
    const found = scene.query({ x: 0, y: 0, width: 10, height: 800 });
    expect(found.some((it) => it.index === 3)).toBe(true);
    expect(scene.nearestItem({ x: scene.size.width - 5, y: 400 }).index).toBe(0);
  });

  it('vertical rtl: scroll axis unchanged, but SPREADS bind on the right', () => {
    const scene = S.linearLayout(four, S.groupPages(4, 'odd'), {
      axis: 'y',
      gap: GAP,
      direction: 'rtl',
    });
    expect(scene.items[0].y).toBe(0); // still top-down
    const [p0, p1] = scene.items[0].pages;
    // reading-first page (0) takes the RIGHT slot of the spread
    expect(p0.pageIndex).toBe(0);
    expect(p0.x).toBeGreaterThan(p1.x);
  });

  it('grid rtl: rows fill right→left, top→bottom; index lookups still O(1)', () => {
    const scene = S.gridLayout(four, S.groupPages(4, 'none'), {
      gap: 48,
      columns: 2,
      direction: 'rtl',
    });
    // row 0: item 0 right, item 1 left; row 1 below
    expect(scene.items[0].x).toBeGreaterThan(scene.items[1].x);
    expect(scene.items[2].y).toBeGreaterThan(scene.items[0].y);
    expect(scene.items[2].x).toBeGreaterThan(scene.items[3].x);
    // nearestItem maps spatial columns back to reading order
    expect(scene.nearestItem({ x: scene.size.width - 5, y: 5 }).index).toBe(0);
    expect(scene.nearestItem({ x: 5, y: 5 }).index).toBe(1);
  });

  it('placeCamera: align.x is LOGICAL — start lands at the RIGHT edge in rtl', () => {
    const subject = { x: 0, y: 0, width: 1200, height: 1600 }; // overflows at zoom 1
    const cam = S.placeCamera(subject, vp, 1, 24, { x: 'start', y: 'start' }, 'rtl');
    // reading start = right edge: subject's right sits a padding in from viewport right
    expect((subject.width - cam.x) * cam.zoom).toBeCloseTo(vp.width - 24, 6);
    expect((0 - cam.y) * cam.zoom).toBeCloseTo(24, 6); // top unchanged
  });
});

describe('pageFrame: reserved chrome space around each PAGE', () => {
  const P = pg(600, 800);
  const m = { top: 10, right: 8, bottom: 20, left: 6 };

  it('linear vertical: pages sit inside their slots; bands reserved between pages', () => {
    const scene = S.linearLayout([P, P], S.groupPages(2, 'none'), {
      axis: 'y',
      gap: 16,
      pageFrame: m,
    });
    const p0 = scene.items[0].pages[0];
    const p1 = scene.items[1].pages[0];
    expect(p0.x - scene.items[0].x).toBeCloseTo(6, 6); // left band inside the item
    expect(p0.y - scene.items[0].y).toBeCloseTo(10, 6); // top band
    // page-bottom → next page-top = bottom + gap + top (the chrome never collides)
    expect(p1.y - (p0.y + p0.height)).toBeCloseTo(20 + 16 + 10, 6);
    expect(scene.items[0].height).toBeCloseTo(800 + 30, 6); // outer box
  });

  it('SPREADS: each page keeps its OWN flanks — left/right chrome works (the fix)', () => {
    const scene = S.linearLayout([P, P], S.groupPages(2, 'odd'), {
      axis: 'y',
      gap: 16,
      pageFrame: m,
    });
    const [a, b] = scene.items[0].pages;
    // between the spread halves: a's right band + gap + b's left band
    expect(b.x - (a.x + a.width)).toBeCloseTo(8 + 16 + 6, 6);
    expect(a.x - scene.items[0].x).toBeCloseTo(6, 6); // outer flank too
  });

  it('RTL spread: slots mirror but margins stay PHYSICAL (left room stays mL)', () => {
    const scene = S.linearLayout([P, P], S.groupPages(2, 'odd'), {
      axis: 'y',
      gap: 16,
      pageFrame: m,
      direction: 'rtl',
    });
    const item = scene.items[0];
    const left = item.pages.find((p) => p.pageIndex === 1)!; // reading-second sits left
    const right = item.pages.find((p) => p.pageIndex === 0)!;
    expect(left.x - item.x).toBeCloseTo(6, 6); // mL preserved at the item edge
    expect(right.x - (left.x + left.width)).toBeCloseTo(8 + 16 + 6, 6);
  });

  it('uniform sizing scales the PAGES, never the margins', () => {
    const scene = S.linearLayout([pg(600, 800), pg(1200, 800)], S.groupPages(2, 'none'), {
      axis: 'y',
      gap: 16,
      sizing: 'uniform',
      pageFrame: m,
    });
    // page 1 scaled up to 1200 wide; both outer widths equal 1200 + 14
    expect(scene.items[0].pages[0].width).toBeCloseTo(1200, 6);
    expect(scene.items[0].width).toBeCloseTo(1200 + 14, 6);
    expect(scene.items[1].width).toBeCloseTo(1200 + 14, 6);
    expect(scene.items[0].pages[0].x - scene.items[0].x).toBeCloseTo(6, 6); // margin constant
  });
});

describe('gridLayout per-row heights (mixed page sizes)', () => {
  it('a row is as tall as ITS tallest item, not the global max (no giant voids)', () => {
    const pages = [
      pg(600, 800), // row 0
      pg(600, 400), // row 0 (short — centers within ROW height)
      pg(600, 1200), // row 1 (the global max)
      pg(600, 600), // row 1
    ];
    const scene = S.gridLayout(pages, S.groupPages(4, 'none'), { gap: 12, columns: 2 });
    // row 0 is 800 tall (NOT 1200): row 1 starts right below it + gap
    expect(scene.items[2].y).toBeCloseTo(800 + 12, 6);
    // the short page centers within its OWN row's height
    expect(scene.items[1].y).toBeCloseTo((800 - 400) / 2, 6);
    expect(scene.items[3].y).toBeCloseTo(800 + 12 + (1200 - 600) / 2, 6);
    // scene height = sum of row heights + gap, not rows × global max
    expect(scene.size.height).toBeCloseTo(800 + 12 + 1200, 6);
    // the spatial index respects the variable rows
    expect(scene.nearestItem({ x: 300, y: 850 }).index).toBe(2);
    const hits = scene.query({ x: 0, y: 0, width: 1212, height: 700 });
    expect(hits.map((it) => it.index).sort()).toEqual([0, 1]);
  });
});

describe('gridLayout lineWidth (wrapped)', () => {
  const pages = Array.from({ length: 7 }, () => pg(600, 800));
  const g = () => S.groupPages(7, 'none');
  // cell = 600 wide, gap 48 → a column costs 648 of (lineWidth + 48)

  it('derives the column count from the line width', () => {
    expect(S.gridLayout(pages, g(), { gap: 48, lineWidth: 1300 }).items[1].y).toBe(0); // 2 cols: item 1 in row 0
    const two = S.gridLayout(pages, g(), { gap: 48, lineWidth: 1300 });
    expect(two.items[2].y).toBeGreaterThan(0); // …and item 2 wrapped to row 1
    const three = S.gridLayout(pages, g(), { gap: 48, lineWidth: 2000 });
    expect(three.items[2].y).toBe(0); // 3 columns now
    expect(three.items[3].y).toBeGreaterThan(0);
  });

  it('never fewer than 1 column, never more than the item count', () => {
    const narrow = S.gridLayout(pages, g(), { gap: 48, lineWidth: 100 });
    expect(narrow.items.every((it, i) => i === 0 || it.y > narrow.items[i - 1].y)).toBe(true); // 1 col
    const wide = S.gridLayout(pages.slice(0, 3), S.groupPages(3, 'none'), {
      gap: 48,
      lineWidth: 99999,
    });
    expect(wide.size.width).toBeCloseTo(3 * 648 - 48, 6); // clamped to 3 occupied columns
  });

  it('wrapped + RTL fills each derived row right→left', () => {
    const scene = S.gridLayout(pages, g(), { gap: 48, lineWidth: 1300, direction: 'rtl' });
    expect(scene.items[0].x).toBeGreaterThan(scene.items[1].x); // row 0: 0 right of 1
    expect(scene.items[2].y).toBeGreaterThan(scene.items[0].y); // row 1 below
  });
});

describe('groupPages', () => {
  it('groups by spread mode', () => {
    expect(S.groupPages(4, 'none')).toEqual([[0], [1], [2], [3]]);
    expect(S.groupPages(4, 'odd')).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(S.groupPages(4, 'even')).toEqual([[0], [1, 2], [3]]);
  });
});

/*
 * `/UserUnit` (§14.11.6): a userUnit-5 page is PHYSICALLY 5× its point size.
 * It folds into the page's measured layout size AND its per-page
 * `contentScale`, so "world units per content point" stays true for every
 * page — the invariant every content→world mapping depends on.
 */
describe('userUnit folds into layout size and per-page contentScale', () => {
  it('scales the page box and its contentScale together', () => {
    const scene = S.linearLayout(
      [{ size: { width: 100, height: 200 } }, { size: { width: 100, height: 200 }, userUnit: 5 }],
      S.groupPages(2, 'none'),
      { gap: 0, sizing: 'intrinsic' },
    );
    const [plain, big] = scene.items.map((it) => it.pages[0]);
    expect(plain.width).toBe(100);
    expect(plain.contentScale).toBe(1);
    expect(big.width).toBe(500); // lays out 5× larger, like Acrobat
    expect(big.height).toBe(1000);
    expect(big.contentScale).toBe(5); // world per content POINT — per page
    // the invariant: box extent ÷ contentScale recovers the point size
    expect(big.width / big.contentScale).toBe(100);
  });

  it('composes with viewUnitsPerPoint (the platform physical factor)', () => {
    const scene = S.linearLayout(
      [{ size: { width: 72, height: 72 }, userUnit: 2 }],
      S.groupPages(1, 'none'),
      { gap: 0, sizing: 'intrinsic', viewUnitsPerPoint: 96 / 72 },
    );
    const box = scene.items[0].pages[0];
    // 72pt × 2 (userUnit) × 4/3 (96dpi) = 192 world units — two inches
    expect(box.width).toBeCloseTo(192, 6);
    expect(box.contentScale).toBeCloseTo((96 / 72) * 2, 6);
  });
});
