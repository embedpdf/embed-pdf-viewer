import { describe, expect, it, vi } from 'vitest';
import type { PageImageHandle } from '@embedpdf/core';
import type { Rect } from '@embedpdf/core-geometry';

import { resolveRenderOptions, type TilesOptions } from '../src/paint-plan';
import { RasterStore } from '../src/raster-store';
import { TileManager } from '../src/tile-manager';

/**
 * Red-line suite for the retention invariant: every
 * screen region paints the sharpest painted pixels available, quality per
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

function createHarness(options?: { policy?: unknown; tiling?: TilesOptions }) {
  const store = new RasterStore(256);
  const pending: Array<{
    key: string;
    rect: Rect;
    scale: number;
    resolve: () => void;
    fail: (error?: Error) => void;
    aborted: () => boolean;
  }> = [];
  let advances = 0;
  let epoch = 0;

  const tileManager = new TileManager({
    store,
    // bleed 0 keeps the geometry assertions exact; bleed has its own tests.
    options: resolveRenderOptions({ tiles: { settleMs: 0, bleed: 0, ...options?.tiling } }),
    getPolicy: () => (options?.policy === undefined ? LATTICE : options.policy) as never,
    getPageSize: () => PAGE,
    getEpoch: () => epoch,
    fetchTile: (_pageObjectNumber, rect, scale, _includeAnnotations, signal) =>
      new Promise<PageImageHandle>((resolve, reject) => {
        const record = {
          key: `${rect.x},${rect.y}@${scale}`,
          rect,
          scale,
          resolve: () => resolve({ fake: record.key } as unknown as PageImageHandle),
          fail: (error?: Error) => reject(error ?? new Error('render failed')),
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

  // The suite addresses one implicit view; this facade binds it (a trailing
  // `view` overrides it for multi-view tests), so the suite exercises the
  // view-scoped API through one seam.
  const manager = {
    plan: (
      pageObjectNumber: number,
      demand: Parameters<TileManager['plan']>[2],
      includeAnnotations: boolean,
      view = 'test',
    ) => tileManager.plan(view, pageObjectNumber, demand, includeAnnotations),
    sourcePainted: (pageObjectNumber: number, key: string, view = 'test') =>
      tileManager.sourcePainted(view, pageObjectNumber, key),
    sourceUnpainted: (pageObjectNumber: number, key: string, view = 'test') =>
      tileManager.sourceUnpainted(view, pageObjectNumber, key),
    releasePage: (pageObjectNumber: number, view = 'test') =>
      tileManager.releasePage(view, pageObjectNumber),
    stats: (pageObjectNumber: number, view = 'test') => tileManager.stats(view, pageObjectNumber),
  };
  return {
    manager,
    pending,
    advanceCount: () => advances,
    bumpEpoch: () => {
      epoch += 1;
    },
    /** Resolve every in-flight fetch (they enter the next paint plan as ready). */
    resolveAll: async () => {
      for (const request of [...pending]) if (!request.aborted()) request.resolve();
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
    const harness = createHarness();
    // 300px wanted, ladder supplies 320 — deficit < 1 → no tiles, no fetches.
    const plan = harness.manager.plan(1, { desiredDeviceWidth: 300 }, true);
    expect(plan.engaged).toBe(false);
    expect(harness.pending).toHaveLength(0);
  });

  it('engages past the budget under a continuous policy', () => {
    const harness = createHarness({ policy: { kind: 'continuous' } });
    // Demand 4896 vs the default 640 budget: deficit 7.65 → tiles own
    // sharpness, at the exact demanded scale (4896/612 = 8 — resting
    // pixels are 1:1, the dpr-1 crispness rule).
    const plan = harness.manager.plan(1, DEEP, true);
    expect(plan.engaged).toBe(true);
    expect(harness.pending).toHaveLength(4);
    expect(harness.pending.every((request) => request.scale === 8)).toBe(true);
  });

  it('continuous below the budget never engages — the base is exact there', () => {
    const harness = createHarness({ policy: { kind: 'continuous' } });
    // 600 ≤ 640 budget: base renders exactly 600 — deficit 1, engageAt 1.0.
    const plan = harness.manager.plan(1, { desiredDeviceWidth: 600 }, true);
    expect(plan.engaged).toBe(false);
    expect(harness.pending).toHaveLength(0);
  });

  it('exact mode: the same settled demand re-plans to the same object (memo)', async () => {
    const harness = createHarness({ policy: { kind: 'continuous' } });
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    const first = harness.manager.plan(1, DEEP, true);
    const second = harness.manager.plan(1, DEEP, true);
    expect(second).toBe(first);
    expect(first.paint).toHaveLength(4);
  });

  it('engages past the ladder cap: want = visible tiles at the snapped level', () => {
    const harness = createHarness();
    const plan = harness.manager.plan(1, DEEP, true);
    expect(plan.engaged).toBe(true);
    expect(plan.paint).toHaveLength(0); // nothing resolved yet — base covers
    // 128pt visible at 64pt tile span → 2×2 visible tiles… plus the
    // prefetch ring, which must not fetch while visible tiles are in flight.
    expect(harness.pending).toHaveLength(4);
    expect(harness.pending.every((request) => request.scale === 8)).toBe(true);
  });

  it('the prefetch ring fires only after every visible tile resolved', async () => {
    const harness = createHarness();
    harness.manager.plan(1, DEEP, true);
    expect(harness.pending).toHaveLength(4);
    await harness.resolveAll();
    // Recompute (as a woken layer would) → visible tiles all ready → the ring schedules.
    harness.manager.plan(1, DEEP, true);
    expect(harness.pending.length).toBeGreaterThan(4);
  });

  it('resolved tiles enter the paint list; zoom inside the level is plan-stable', async () => {
    const harness = createHarness();
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    const atLevel = harness.manager.plan(1, DEEP, true);
    expect(atLevel.paint).toHaveLength(4);
    const before = harness.pending.length;
    // 4896 → 4400 device px: same snapped level (8 — snap-up owns the range
    // (2448, 4896]), same visible rect → the same plan object (memo) and
    // zero new fetches. The identity law, tile edition.
    const zoomed = harness.manager.plan(1, { ...DEEP, desiredDeviceWidth: 4400 }, true);
    expect(zoomed.stamp).toBe(atLevel.stamp);
    expect(harness.pending.length).toBe(before);
  });

  it('retention: a level crossing keeps painted old tiles until their children are painted', async () => {
    const harness = createHarness();
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    let plan = harness.manager.plan(1, DEEP, true);
    // The layer painted the level-8 tiles.
    for (const source of plan.paint) harness.manager.sourcePainted(1, source.key);

    // Zoom deeper: level 16 wanted over a quarter of the old area.
    const deeper = {
      desiredDeviceWidth: 9792,
      visibleRect: { x: 0, y: 0, width: 64, height: 64 },
    };
    plan = harness.manager.plan(1, deeper, true);
    // Old painted level-8 tile(s) intersecting the view stay in paint...
    expect(plan.paint.some((source) => source.scale === 8)).toBe(true);
    // ...and sharper arrivals stack above them.
    await harness.resolveAll();
    plan = harness.manager.plan(1, deeper, true);
    const oldZ = plan.paint.find((source) => source.scale === 8)!.z;
    const newOnes = plan.paint.filter((source) => source.scale === 16);
    expect(newOnes.length).toBeGreaterThan(0);
    expect(newOnes.every((source) => source.z > oldZ)).toBe(true);

    // Fetch-complete is not enough to release (decode boundary): the old
    // tile leaves only when the covering children report painted.
    expect(plan.paint.some((source) => source.scale === 8)).toBe(true);
    for (const source of newOnes) harness.manager.sourcePainted(1, source.key);
    plan = harness.manager.plan(1, deeper, true);
    expect(plan.paint.some((source) => source.scale === 8)).toBe(false);
    expect(plan.paint.some((source) => source.scale === 16)).toBe(true);
  });

  it('zoom out: fine tiles stay painted above the coarse want until it lands', async () => {
    const harness = createHarness();
    // Start deep at level 16.
    const deep16 = {
      desiredDeviceWidth: 9792,
      visibleRect: { x: 0, y: 0, width: 64, height: 64 },
    };
    harness.manager.plan(1, deep16, true);
    await harness.resolveAll();
    let plan = harness.manager.plan(1, deep16, true);
    for (const source of plan.paint) harness.manager.sourcePainted(1, source.key);

    // Zoom back out to level 8 over the same corner.
    plan = harness.manager.plan(1, DEEP, true);
    // The fine tiles keep painting (sharper than needed is fine)…
    expect(plan.paint.some((source) => source.scale === 16)).toBe(true);
    await harness.resolveAll();
    plan = harness.manager.plan(1, DEEP, true);
    const coarse = plan.paint.filter((source) => source.scale === 8);
    expect(coarse.length).toBeGreaterThan(0);
    // …until the coarse want-tiles are painted, which occludes-releases them.
    for (const source of coarse) harness.manager.sourcePainted(1, source.key);
    plan = harness.manager.plan(1, DEEP, true);
    expect(plan.paint.some((source) => source.scale === 16)).toBe(false);
  });

  it('pan: the same level fetches only the newly exposed tiles; existing ones stay', async () => {
    // margin 0 isolates the visible-tile mechanics (with the default ring, a one-span
    // pan lands entirely on prefetched tiles — that's the feature working).
    const harness = createHarness({ tiling: { prefetch: { margin: 0 } } });
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    harness.manager.plan(1, DEEP, true);
    const before = harness.pending.length;
    // Slide one tile-span right: one kept column, one new column.
    const panned = { ...DEEP, visibleRect: { x: 64, y: 0, width: 128, height: 128 } };
    const plan = harness.manager.plan(1, panned, true);
    expect(harness.pending.length).toBe(before + 2);
    // Tiles that stayed visible remain in paint without refetching.
    expect(plan.paint.some((source) => source.rect.x === 64 && source.rect.y === 0)).toBe(true);
  });

  it('abort: in-flight tiles that leave the want set are aborted', async () => {
    const harness = createHarness({ tiling: { prefetch: { margin: 0 } } });
    harness.manager.plan(1, DEEP, true);
    expect(harness.pending).toHaveLength(4);
    // Pan far away before anything resolves.
    harness.manager.plan(1, { ...DEEP, visibleRect: { x: 448, y: 448, width: 128, height: 128 } }, true);
    await drain();
    expect(harness.pending.slice(0, 4).every((request) => request.aborted())).toBe(true);
  });

  it('epoch: an invalidation bump drops every retained tile immediately', async () => {
    const harness = createHarness();
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    let plan = harness.manager.plan(1, DEEP, true);
    for (const source of plan.paint) harness.manager.sourcePainted(1, source.key);
    expect(harness.manager.plan(1, DEEP, true).paint).toHaveLength(4);

    harness.bumpEpoch();
    plan = harness.manager.plan(1, DEEP, true);
    // Old pixels are wrong, not blurry: nothing retained, fresh fetches.
    expect(plan.paint).toHaveLength(0);
    expect(plan.fetching.length).toBeGreaterThan(0);
  });

  it('disengaging (zoom back under the cap) clears tile state', async () => {
    const harness = createHarness();
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    expect(harness.manager.plan(1, DEEP, true).paint).toHaveLength(4);
    const plan = harness.manager.plan(1, { desiredDeviceWidth: 1200 }, true);
    expect(plan.engaged).toBe(false);
    expect(plan.paint).toHaveLength(0);
  });

  it('tile resolutions call onAdvance for every arrival', async () => {
    const harness = createHarness();
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    expect(harness.advanceCount()).toBeGreaterThanOrEqual(4);
  });

  it('unpaint: a tile leaving the DOM stops counting as coverage until it re-paints', async () => {
    const harness = createHarness();
    harness.manager.plan(1, DEEP, true);
    await harness.resolveAll();
    let plan = harness.manager.plan(1, DEEP, true);
    for (const source of plan.paint) harness.manager.sourcePainted(1, source.key);

    // Zoom deeper: level 16 wanted over a quarter of the old area.
    const deeper = {
      desiredDeviceWidth: 9792,
      visibleRect: { x: 0, y: 0, width: 64, height: 64 },
    };
    harness.manager.plan(1, deeper, true);
    await harness.resolveAll();
    plan = harness.manager.plan(1, deeper, true);
    const fine = plan.paint.filter((source) => source.scale === 16);
    expect(fine.length).toBeGreaterThan(1);

    // Paint all fine tiles, then one of them unmounts (pan-away) before the
    // release question is asked again…
    for (const source of fine.slice(0, -1)) harness.manager.sourcePainted(1, source.key);
    harness.manager.sourceUnpainted(1, fine[0]!.key);
    harness.manager.sourcePainted(1, fine[fine.length - 1]!.key);
    // …so the retained coarse tile must stay: its region is not fully
    // compositable right now.
    plan = harness.manager.plan(1, deeper, true);
    expect(plan.paint.some((source) => source.scale === 8)).toBe(true);

    // The tile remounts and re-reports painted → now the coarse one leaves.
    harness.manager.sourcePainted(1, fine[0]!.key);
    plan = harness.manager.plan(1, deeper, true);
    expect(plan.paint.some((source) => source.scale === 8)).toBe(false);
  });

  it('bleed: paint and fetch rects overlap neighbors by the bleed; retention math stays logical', async () => {
    const harness = createHarness({ tiling: { bleed: 1, prefetch: { margin: 0 } } });
    harness.manager.plan(1, DEEP, true); // level 8 — bleed is 1/8 pt per side
    // The fetched region is bled: interior tiles ask for span + 2×(1/8) pt.
    const interior = harness.pending.find((request) => request.rect.x > 0)!;
    expect(interior.rect.width).toBeCloseTo(64 + 2 / 8, 5);
    await harness.resolveAll();
    const plan = harness.manager.plan(1, DEEP, true);
    // Placement rects are bled the same way — neighbors overlap …
    const first = plan.paint.find((source) => source.rect.x === 0)!; // page-edge clamp
    const second = plan.paint.find((source) => source.rect.x > 0 && source.rect.x < 64)!;
    expect(second.rect.x).toBeCloseTo(64 - 1 / 8, 5);
    expect(first.rect.x + first.rect.width).toBeGreaterThan(second.rect.x);
    // …and the grid math still counts 2×2 visible tiles (logical, unbled).
    expect(plan.paint).toHaveLength(4);
  });

  it('failure: a failed tile wakes the layers, is not retried at this level, retries after a level change', async () => {
    const harness = createHarness({ tiling: { prefetch: { margin: 0 } } });
    harness.manager.plan(1, DEEP, true);
    expect(harness.pending).toHaveLength(4);
    const wakesBefore = harness.advanceCount();
    harness.pending[0]!.fail(); // real failure, not an abort
    for (const request of harness.pending.slice(1)) request.resolve();
    await drain();
    // The failure itself woke subscribers (progress never silently stalls) …
    expect(harness.advanceCount()).toBeGreaterThan(wakesBefore);
    // …the survivors paint, and the failed coord is not refetched at this level.
    const before = harness.pending.length;
    const plan = harness.manager.plan(1, DEEP, true);
    expect(plan.paint).toHaveLength(3);
    expect(harness.pending.length).toBe(before);
    // A level change clears the failure memory — the coord gets fresh chances.
    harness.manager.plan(1, { ...DEEP, desiredDeviceWidth: 9792 }, true);
    expect(harness.pending.length).toBeGreaterThan(before);
  });
});

describe('settle convergence (regression: a zoom must always land on its final level)', () => {
  it('burst then rest fetches the final level; a small follow-up step converges too', async () => {
    vi.useFakeTimers();
    try {
      // Exact mode (continuous policy) — every demand is its own level, the
      // case where the settle gate is the whole affordability story.
      const harness = createHarness({
        policy: { kind: 'continuous' },
        tiling: { settleMs: 150, prefetch: { margin: 0 } },
      });
      const demand = (width: number) => ({
        desiredDeviceWidth: width,
        visibleRect: { x: 0, y: 0, width: 128, height: 128 },
      });
      // First engagement kicks off immediately.
      harness.manager.plan(1, demand(4896), true);
      expect(harness.pending.length).toBeGreaterThan(0);
      await harness.resolveAll();

      // Burst: the level changes every frame; nothing fetches mid-gesture.
      const before = harness.pending.length;
      harness.manager.plan(1, demand(5200), true);
      harness.manager.plan(1, demand(5800), true);
      harness.manager.plan(1, demand(6400), true);
      expect(harness.pending.length).toBe(before);

      // Rest: the settle fires with the final level.
      await vi.advanceTimersByTimeAsync(200);
      expect(harness.pending.length).toBeGreaterThan(before);
      await harness.resolveAll();
      let plan = harness.manager.plan(1, demand(6400), true);
      expect(plan.paint.some((source) => Math.abs(source.scale - 6400 / PAGE.width) < 1e-9)).toBe(true);

      // One small step (the anchor-jitter cadence) converges the same way.
      harness.manager.plan(1, demand(6560), true);
      const beforeSmall = harness.pending.length;
      await vi.advanceTimersByTimeAsync(200);
      expect(harness.pending.length).toBeGreaterThan(beforeSmall);
      await harness.resolveAll();
      plan = harness.manager.plan(1, demand(6560), true);
      expect(plan.paint.some((source) => Math.abs(source.scale - 6560 / PAGE.width) < 1e-9)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('per-view tile state (multi-lens isolation)', () => {
  // The "sidebar opens, main view goes blurry" regression: the rail's
  // below-engage demand must never reach the main view's state, where it
  // would hit the disengage branch and destroy the main lens's entries.

  it("a rail's never-engaging plan leaves the main view's tiles untouched", async () => {
    const harness = createHarness({ policy: { kind: 'continuous' } });
    const main = harness.manager.plan(1, DEEP, true, 'stage');
    expect(main.engaged).toBe(true);
    expect(harness.pending).toHaveLength(4);
    await harness.resolveAll();
    const painted = harness.manager.plan(1, DEEP, true, 'stage');
    expect(painted.paint.length).toBeGreaterThan(0);

    // the sidebar opens: the thumbnail lens plans the same page, tiny demand
    const rail = harness.manager.plan(1, { desiredDeviceWidth: 200 }, true, 'stage-thumbs');
    expect(rail.engaged).toBe(false);
    expect(rail.paint).toHaveLength(0);

    // …and the main view's plan is byte-identical — nothing dropped, nothing
    // refetched, no thrash
    const after = harness.manager.plan(1, DEEP, true, 'stage');
    expect(after.paint.length).toBe(painted.paint.length);
    expect(harness.manager.stats(1, 'stage').entries).toBeGreaterThan(0);
    expect(harness.manager.stats(1, 'stage-thumbs').entries).toBe(0);
  });

  it('releasing one view keeps the other view fetching and painting', async () => {
    const harness = createHarness({ policy: { kind: 'continuous' } });
    harness.manager.plan(1, DEEP, true, 'stage');
    harness.manager.plan(1, DEEP, true, 'stage-thumbs'); // a second full-size lens
    const inFlight = harness.pending.filter((request) => !request.aborted()).length;
    expect(inFlight).toBeGreaterThan(0);

    // the rail scrolls this page out and releases its plane…
    harness.manager.releasePage(1, 'stage-thumbs');
    expect(harness.manager.stats(1, 'stage-thumbs').entries).toBe(0);
    // …while the main view's fetches stay alive and resolve to a paint list
    await harness.resolveAll();
    const main = harness.manager.plan(1, DEEP, true, 'stage');
    expect(main.paint.length).toBeGreaterThan(0);
  });

  it('painted reports are view-scoped: one view painting never releases the other', async () => {
    const harness = createHarness({ policy: { kind: 'continuous' } });
    harness.manager.plan(1, DEEP, true, 'stage');
    await harness.resolveAll();
    const plan = harness.manager.plan(1, DEEP, true, 'stage');
    const key = plan.paint[0]!.key;
    // a report against the wrong view is a no-op…
    harness.manager.sourcePainted(1, key, 'stage-thumbs');
    expect(harness.manager.plan(1, DEEP, true, 'stage')).toBe(plan); // memo intact
    // …the right view's report advances its own plan
    harness.manager.sourcePainted(1, key, 'stage');
    expect(harness.manager.plan(1, DEEP, true, 'stage')).not.toBe(plan);
  });

  it('the view argument defaults — single-lens callers keep the implicit view', () => {
    const harness = createHarness({ policy: { kind: 'continuous' } });
    harness.manager.plan(1, DEEP, true); // no view: the shared implicit one
    expect(harness.manager.stats(1).entries).toBeGreaterThan(0);
    expect(harness.manager.stats(1, 'stage').entries).toBe(0);
  });
});
