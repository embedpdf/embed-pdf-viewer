import { describe, expect, it, vi } from 'vitest';
import type { PageImageHandle, PdfRect } from '@embedpdf/core';

import { resolveRenderOptions, type TilesOptions } from './paint-plan';
import { RasterStore } from './raster-store';
import { TileManager } from './tile-manager';

/**
 * Red-line suite for the retention invariant: every
 * screen region paints the sharpest PAINTED pixels available, quality per
 * region only goes up while a want set resolves, and release is per-region
 * occlusion — never "no longer wanted".
 */

const PAGE = { width: 612, height: 792 };
const LATTICE = {
  kind: 'lattice',
  fullPage: { widths: [320, 640, 1280, 2560] },
  formats: ['webp'],
  background: 'white',
  enforced: false,
} as const;

function harness(opts?: { policy?: unknown; tiling?: TilesOptions }) {
  const store = new RasterStore(256);
  const pending: Array<{
    key: string;
    rect: PdfRect;
    scale: number;
    resolve: () => void;
    fail: (err?: Error) => void;
    aborted: () => boolean;
  }> = [];
  let advances = 0;
  let epoch = 0;

  const manager = new TileManager({
    store,
    // bleed 0 keeps the geometry assertions exact; bleed has its own tests.
    options: resolveRenderOptions({ tiles: { settleMs: 0, bleed: 0, ...opts?.tiling } }),
    getPolicy: () => (opts?.policy === undefined ? LATTICE : opts.policy) as never,
    getPageSize: () => PAGE,
    getEpoch: () => epoch,
    fetchTile: (_pon, rect, scale, _annotations, signal) =>
      new Promise<PageImageHandle>((resolve, reject) => {
        const record = {
          key: `${rect.left},${PAGE.height - rect.top}@${scale}`,
          rect,
          scale,
          resolve: () => resolve({ fake: record.key } as unknown as PageImageHandle),
          fail: (err?: Error) => reject(err ?? new Error('render failed')),
          aborted: () => signal.aborted,
        };
        signal.addEventListener('abort', () => reject(signal.reason ?? new Error('aborted')), {
          once: true,
        });
        pending.push(record);
      }),
    onAdvance: () => {
      advances += 1;
    },
  });

  return {
    manager,
    pending,
    advanceCount: () => advances,
    bumpEpoch: () => {
      epoch += 1;
    },
    /** Resolve every in-flight fetch (they enter the plan as ready). */
    resolveAll: async () => {
      for (const p of [...pending]) if (!p.aborted()) p.resolve();
      await drain();
    },
  };
}

const drain = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// Demand helpers: a 612pt page at device width 4896 = scale 8 exactly.
const DEEP = { desiredDeviceWidth: 4896, visibleRect: { x: 0, y: 0, width: 128, height: 128 } };

describe('TileManager', () => {
  it('never engages below the deficit threshold — a thumbnail demand is free', () => {
    const h = harness();
    // 300px wanted, ladder supplies 320 — deficit < 1 → no tiles, no fetches.
    const plan = h.manager.plan(1, { desiredDeviceWidth: 300 }, true);
    expect(plan.engaged).toBe(false);
    expect(h.pending).toHaveLength(0);
  });

  it('ENGAGES past the budget under a continuous policy — the local-engine fix', () => {
    const h = harness({ policy: { kind: 'continuous' } });
    // Demand 4896 vs the default 640 budget: deficit 7.65 → tiles own
    // sharpness, at the EXACT demanded scale (4896/612 = 8 — resting
    // pixels are 1:1, the dpr-1 crispness rule).
    const plan = h.manager.plan(1, DEEP, true);
    expect(plan.engaged).toBe(true);
    expect(h.pending).toHaveLength(4);
    expect(h.pending.every((p) => p.scale === 8)).toBe(true);
  });

  it('continuous below the budget never engages — the base is exact there', () => {
    const h = harness({ policy: { kind: 'continuous' } });
    // 600 ≤ 640 budget: base renders exactly 600 — deficit 1, engageAt 1.0.
    const plan = h.manager.plan(1, { desiredDeviceWidth: 600 }, true);
    expect(plan.engaged).toBe(false);
    expect(h.pending).toHaveLength(0);
  });

  it('exact mode: the same settled demand re-plans to the same object (memo)', async () => {
    const h = harness({ policy: { kind: 'continuous' } });
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    const a = h.manager.plan(1, DEEP, true);
    const b = h.manager.plan(1, DEEP, true);
    expect(b).toBe(a);
    expect(a.paint).toHaveLength(4);
  });

  it('engages past the ladder cap: want = visible tiles at the snapped level', () => {
    const h = harness();
    const plan = h.manager.plan(1, DEEP, true);
    expect(plan.engaged).toBe(true);
    expect(plan.paint).toHaveLength(0); // nothing resolved yet — base covers
    // 128pt visible at 64pt tile span → 2×2 visible tiles… plus the
    // prefetch ring, which must NOT fetch while P0 is in flight.
    expect(h.pending).toHaveLength(4);
    expect(h.pending.every((p) => p.scale === 8)).toBe(true);
  });

  it('P1 prefetch fires only after ALL P0 tiles resolved', async () => {
    const h = harness();
    h.manager.plan(1, DEEP, true);
    expect(h.pending).toHaveLength(4);
    await h.resolveAll();
    // Recompute (as a woken layer would) → P0 all ready → ring schedules.
    h.manager.plan(1, DEEP, true);
    expect(h.pending.length).toBeGreaterThan(4);
  });

  it('resolved tiles enter the paint list; zoom inside the level is plan-stable', async () => {
    const h = harness();
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    const a = h.manager.plan(1, DEEP, true);
    expect(a.paint).toHaveLength(4);
    const before = h.pending.length;
    // 4896 → 4400 device px: same snapped level (8 — snap-up owns the range
    // (2448, 4896]), same visible rect → the SAME plan object (memo) and
    // zero new fetches. The identity law, tile edition.
    const b = h.manager.plan(1, { ...DEEP, desiredDeviceWidth: 4400 }, true);
    expect(b.stamp).toBe(a.stamp);
    expect(h.pending.length).toBe(before);
  });

  it('RETENTION: level crossing keeps painted old tiles until children are PAINTED', async () => {
    const h = harness();
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    let plan = h.manager.plan(1, DEEP, true);
    // The layer painted the level-8 tiles.
    for (const s of plan.paint) h.manager.sourcePainted(1, s.key);

    // Zoom deeper: level 16 wanted over a quarter of the old area.
    const deeper = {
      desiredDeviceWidth: 9792,
      visibleRect: { x: 0, y: 0, width: 64, height: 64 },
    };
    plan = h.manager.plan(1, deeper, true);
    // Old painted level-8 tile(s) intersecting the view STAY in paint...
    expect(plan.paint.some((s) => s.scale === 8)).toBe(true);
    // ...and sharper arrivals stack ABOVE them.
    await h.resolveAll();
    plan = h.manager.plan(1, deeper, true);
    const oldZ = plan.paint.find((s) => s.scale === 8)!.z;
    const newOnes = plan.paint.filter((s) => s.scale === 16);
    expect(newOnes.length).toBeGreaterThan(0);
    expect(newOnes.every((s) => s.z > oldZ)).toBe(true);

    // Fetch-complete is NOT enough to release (decode boundary): the old
    // tile leaves only when the covering children report PAINTED.
    expect(plan.paint.some((s) => s.scale === 8)).toBe(true);
    for (const s of newOnes) h.manager.sourcePainted(1, s.key);
    plan = h.manager.plan(1, deeper, true);
    expect(plan.paint.some((s) => s.scale === 8)).toBe(false);
    expect(plan.paint.some((s) => s.scale === 16)).toBe(true);
  });

  it('ZOOM OUT: fine tiles stay painted above the coarse want until it lands', async () => {
    const h = harness();
    // Start deep at level 16.
    const deep16 = {
      desiredDeviceWidth: 9792,
      visibleRect: { x: 0, y: 0, width: 64, height: 64 },
    };
    h.manager.plan(1, deep16, true);
    await h.resolveAll();
    let plan = h.manager.plan(1, deep16, true);
    for (const s of plan.paint) h.manager.sourcePainted(1, s.key);

    // Zoom back out to level 8 over the same corner.
    plan = h.manager.plan(1, DEEP, true);
    // The fine tiles keep painting (sharper than needed is fine)…
    expect(plan.paint.some((s) => s.scale === 16)).toBe(true);
    await h.resolveAll();
    plan = h.manager.plan(1, DEEP, true);
    const coarse = plan.paint.filter((s) => s.scale === 8);
    expect(coarse.length).toBeGreaterThan(0);
    // …until the coarse want-tiles are PAINTED, which occludes-releases them.
    for (const s of coarse) h.manager.sourcePainted(1, s.key);
    plan = h.manager.plan(1, DEEP, true);
    expect(plan.paint.some((s) => s.scale === 16)).toBe(false);
  });

  it('PAN: same level fetches only the newly exposed tiles; existing stay', async () => {
    // margin 0 isolates the P0 mechanics (with the default ring, a one-span
    // pan lands entirely on prefetched tiles — that's the feature working).
    const h = harness({ tiling: { prefetch: { margin: 0 } } });
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    h.manager.plan(1, DEEP, true);
    const before = h.pending.length;
    // Slide one tile-span right: one kept column, one new column.
    const panned = { ...DEEP, visibleRect: { x: 64, y: 0, width: 128, height: 128 } };
    const plan = h.manager.plan(1, panned, true);
    expect(h.pending.length).toBe(before + 2);
    // Tiles that stayed visible remain in paint without refetching.
    expect(plan.paint.some((s) => s.rect.x === 64 && s.rect.y === 0)).toBe(true);
  });

  it('ABORT: in-flight tiles that leave the want set are aborted', async () => {
    const h = harness({ tiling: { prefetch: { margin: 0 } } });
    h.manager.plan(1, DEEP, true);
    expect(h.pending).toHaveLength(4);
    // Pan far away before anything resolves.
    h.manager.plan(1, { ...DEEP, visibleRect: { x: 448, y: 448, width: 128, height: 128 } }, true);
    await drain();
    expect(h.pending.slice(0, 4).every((p) => p.aborted())).toBe(true);
  });

  it('EPOCH: an invalidation bump drops every retained tile immediately', async () => {
    const h = harness();
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    let plan = h.manager.plan(1, DEEP, true);
    for (const s of plan.paint) h.manager.sourcePainted(1, s.key);
    expect(h.manager.plan(1, DEEP, true).paint).toHaveLength(4);

    h.bumpEpoch();
    plan = h.manager.plan(1, DEEP, true);
    // Old pixels are WRONG, not blurry: nothing retained, fresh fetches.
    expect(plan.paint).toHaveLength(0);
    expect(plan.fetching.length).toBeGreaterThan(0);
  });

  it('disengaging (zoom back under the cap) clears tile state', async () => {
    const h = harness();
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    expect(h.manager.plan(1, DEEP, true).paint).toHaveLength(4);
    const plan = h.manager.plan(1, { desiredDeviceWidth: 1200 }, true);
    expect(plan.engaged).toBe(false);
    expect(plan.paint).toHaveLength(0);
  });

  it('tile resolutions wake subscribers (PAINT_ADVANCED per arrival)', async () => {
    const h = harness();
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    expect(h.advanceCount()).toBeGreaterThanOrEqual(4);
  });

  it('UNPAINT: a tile leaving the DOM stops counting as coverage until it re-paints', async () => {
    const h = harness();
    h.manager.plan(1, DEEP, true);
    await h.resolveAll();
    let plan = h.manager.plan(1, DEEP, true);
    for (const s of plan.paint) h.manager.sourcePainted(1, s.key);

    // Zoom deeper: level 16 wanted over a quarter of the old area.
    const deeper = {
      desiredDeviceWidth: 9792,
      visibleRect: { x: 0, y: 0, width: 64, height: 64 },
    };
    h.manager.plan(1, deeper, true);
    await h.resolveAll();
    plan = h.manager.plan(1, deeper, true);
    const fine = plan.paint.filter((s) => s.scale === 16);
    expect(fine.length).toBeGreaterThan(1);

    // Paint all fine tiles, then one of them UNMOUNTS (pan-away) before the
    // release question is asked again…
    for (const s of fine.slice(0, -1)) h.manager.sourcePainted(1, s.key);
    h.manager.sourceUnpainted(1, fine[0]!.key);
    h.manager.sourcePainted(1, fine[fine.length - 1]!.key);
    // …so the retained coarse tile must STAY: its region is not fully
    // compositable right now.
    plan = h.manager.plan(1, deeper, true);
    expect(plan.paint.some((s) => s.scale === 8)).toBe(true);

    // The tile remounts and re-reports painted → NOW the coarse one leaves.
    h.manager.sourcePainted(1, fine[0]!.key);
    plan = h.manager.plan(1, deeper, true);
    expect(plan.paint.some((s) => s.scale === 8)).toBe(false);
  });

  it('BLEED: paint and fetch rects overlap neighbors by the bleed; retention math stays logical', async () => {
    const h = harness({ tiling: { bleed: 1, prefetch: { margin: 0 } } });
    h.manager.plan(1, DEEP, true); // level 8 — bleed is 1/8 pt per side
    // The FETCHED region is bled: interior tiles ask for span + 2×(1/8) pt.
    const interior = h.pending.find((p) => p.rect.left > 0)!;
    expect(interior.rect.right - interior.rect.left).toBeCloseTo(64 + 2 / 8, 5);
    await h.resolveAll();
    const plan = h.manager.plan(1, DEEP, true);
    // Placement rects are bled the same way — neighbors overlap …
    const first = plan.paint.find((s) => s.rect.x === 0)!; // page-edge clamp
    const second = plan.paint.find((s) => s.rect.x > 0 && s.rect.x < 64)!;
    expect(second.rect.x).toBeCloseTo(64 - 1 / 8, 5);
    expect(first.rect.x + first.rect.width).toBeGreaterThan(second.rect.x);
    // …and the grid math still counts 2×2 visible tiles (logical, unbled).
    expect(plan.paint).toHaveLength(4);
  });

  it('FAILURE: a failed tile wakes the layers, is not retried at this level, retries after a level change', async () => {
    const h = harness({ tiling: { prefetch: { margin: 0 } } });
    h.manager.plan(1, DEEP, true);
    expect(h.pending).toHaveLength(4);
    const wakesBefore = h.advanceCount();
    h.pending[0]!.fail(); // real failure, not an abort
    for (const p of h.pending.slice(1)) p.resolve();
    await drain();
    // The failure itself woke subscribers (progress never silently stalls) …
    expect(h.advanceCount()).toBeGreaterThan(wakesBefore);
    // …the survivors paint, and the failed coord is NOT refetched at this level.
    const before = h.pending.length;
    const plan = h.manager.plan(1, DEEP, true);
    expect(plan.paint).toHaveLength(3);
    expect(h.pending.length).toBe(before);
    // A level change clears the failure memory — the coord gets fresh chances.
    h.manager.plan(1, { ...DEEP, desiredDeviceWidth: 9792 }, true);
    expect(h.pending.length).toBeGreaterThan(before);
  });
});

describe('settle convergence (regression: a zoom must always land on its final level)', () => {
  it('burst then rest fetches the FINAL level; a small follow-up step converges too', async () => {
    vi.useFakeTimers();
    try {
      // Exact mode (continuous policy) — every demand is its own level, the
      // case where the settle gate is the whole affordability story.
      const h = harness({
        policy: { kind: 'continuous' },
        tiling: { settleMs: 150, prefetch: { margin: 0 } },
      });
      const demand = (w: number) => ({
        desiredDeviceWidth: w,
        visibleRect: { x: 0, y: 0, width: 128, height: 128 },
      });
      // First engagement kicks off immediately.
      h.manager.plan(1, demand(4896), true);
      expect(h.pending.length).toBeGreaterThan(0);
      await h.resolveAll();

      // Burst: the level changes every frame; nothing fetches mid-gesture.
      const before = h.pending.length;
      h.manager.plan(1, demand(5200), true);
      h.manager.plan(1, demand(5800), true);
      h.manager.plan(1, demand(6400), true);
      expect(h.pending.length).toBe(before);

      // Rest: the settle fires with the FINAL level.
      await vi.advanceTimersByTimeAsync(200);
      expect(h.pending.length).toBeGreaterThan(before);
      await h.resolveAll();
      let plan = h.manager.plan(1, demand(6400), true);
      expect(plan.paint.some((s) => Math.abs(s.scale - 6400 / PAGE.width) < 1e-9)).toBe(true);

      // One small step (the anchor-jitter cadence) converges the same way.
      h.manager.plan(1, demand(6560), true);
      const beforeSmall = h.pending.length;
      await vi.advanceTimersByTimeAsync(200);
      expect(h.pending.length).toBeGreaterThan(beforeSmall);
      await h.resolveAll();
      plan = h.manager.plan(1, demand(6560), true);
      expect(plan.paint.some((s) => Math.abs(s.scale - 6560 / PAGE.width) < 1e-9)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
