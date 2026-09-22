import { describe, expect, it } from 'vitest';
import type { PageImageHandle } from '@embedpdf/core';

import { resolveRenderOptions, type TilesOptions } from '../src/paint-plan';
import { RasterStore } from '../src/raster-store';
import { TileManager } from '../src/tile-manager';

/**
 * Memory-residency red lines: the manager's bookkeeping and the store's
 * bytes must stay bounded under sustained use. Bytes live in exactly one
 * budgeted owner (the RasterStore); the manager holds keys; raw fetch
 * concurrency is backpressured; stage-less demand is capped. These are the
 * invariants that keep a long deep-zoom pan session flat instead of
 * climbing to gigabytes.
 */

const PAGE = { width: 612, height: 792 };

function createHarness(
  options?: { tiling?: TilesOptions; storeBudget?: number; handleBytes?: number },
) {
  const store = new RasterStore(options?.storeBudget ?? 1024 * 1024 * 1024);
  const pending: Array<{
    key: string;
    resolve: () => void;
    aborted: () => boolean;
    settled: boolean;
  }> = [];
  let liveFetches = 0;
  let maxLiveFetches = 0;

  const tileManager = new TileManager({
    store,
    options: resolveRenderOptions({ tiles: { settleMs: 0, bleed: 0, ...options?.tiling } }),
    getPolicy: () => ({ kind: 'continuous' }) as never,
    getPageSize: () => PAGE,
    getEpoch: () => 0,
    fetchTile: (_pageObjectNumber, rect, scale: number, _includeAnnotations, signal) =>
      new Promise<PageImageHandle>((resolve, reject) => {
        liveFetches += 1;
        maxLiveFetches = Math.max(maxLiveFetches, liveFetches);
        const record = {
          key: `${rect.x.toFixed(2)}@${scale.toFixed(2)}`,
          settled: false,
          resolve: () => {
            if (record.settled) return;
            record.settled = true;
            liveFetches -= 1;
            resolve({
              source: { kind: 'bytes', bytes: new Uint8Array(options?.handleBytes ?? 1000) },
              objectUrl: () => Promise.reject(new Error('unused')),
            } as unknown as PageImageHandle);
          },
          aborted: () => signal.aborted,
        };
        signal.addEventListener(
          'abort',
          () => {
            if (record.settled) return;
            record.settled = true;
            liveFetches -= 1;
            reject(new Error('aborted'));
          },
          { once: true },
        );
        pending.push(record);
      }),
    onAdvance: () => {},
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
    store,
    pending,
    maxLive: () => maxLiveFetches,
    resolveAll: async () => {
      // Resolve-and-replan until the want set is fully fetched — the test's
      // stand-in for the wake → plan pump that drives backpressure.
      for (let round = 0; round < 200; round++) {
        const open = pending.filter((request) => !request.settled && !request.aborted());
        if (open.length === 0) break;
        for (const request of open) request.resolve();
        await drain();
      }
    },
  };
}

const drain = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

// Deep-zoom demand: level 4896 (scale 8); the walk scrolls down the page
// (792 pt tall — room for a long walk without clamping at the edge).
const demandAt = (y: number) => ({
  desiredDeviceWidth: 4896,
  visibleRect: { x: 0, y, width: 128, height: 128 },
});

describe('tile residency (the memory red lines)', () => {
  it('pan: manager entries stay bounded across a long walk — bytes live in the store, not the manager', async () => {
    const harness = createHarness();
    // Walk across the page one tile-span at a time; at each stop, pump the
    // wake → plan loop until the want set fully resolves (backpressure
    // starts deferred fetches on each replan, exactly like live wake-ups).
    const settleAt = async (x: number) => {
      for (let round = 0; round < 50; round++) {
        harness.manager.plan(1, demandAt(x), true);
        const open = harness.pending.filter((request) => !request.settled && !request.aborted());
        if (open.length === 0) break;
        for (const request of open) request.resolve();
        await drain();
      }
    };
    for (let step = 0; step < 10; step++) await settleAt(step * 64);
    // Want set at this level: 2×2 visible + prefetch ring ≈ up to ~16 tiles.
    // Same-level tiles that left the want set must not accumulate.
    const { entries } = harness.manager.stats(1);
    expect(entries).toBeLessThanOrEqual(24);
    // The walk touched meaningfully more distinct tiles than the resident
    // bound — proving eviction, not merely a small walk.
    expect(harness.pending.length).toBeGreaterThan(entries + 8);
  });

  it('backpressure: in-flight tile fetches never exceed the cap; the want set still completes', async () => {
    // Big visible window → want far more tiles than the cap at once.
    const harness = createHarness({ tiling: { prefetch: { margin: 0 } } });
    const wide = { desiredDeviceWidth: 4896, visibleRect: { x: 0, y: 0, width: 512, height: 384 } };
    harness.manager.plan(1, wide, true);
    expect(harness.maxLive()).toBeLessThanOrEqual(8);
    // Pump: resolve what's open, replan (the wake), repeat until done.
    for (let round = 0; round < 60; round++) {
      const open = harness.pending.filter((request) => !request.settled && !request.aborted());
      if (open.length === 0) break;
      for (const request of open) request.resolve();
      await drain();
      harness.manager.plan(1, wide, true);
    }
    expect(harness.maxLive()).toBeLessThanOrEqual(8);
    // 8×6 visible tiles all resolved and paintable.
    const plan = harness.manager.plan(1, wide, true);
    expect(plan.paint.length).toBe(48);
  });

  it('store budget: cached bytes respect the budget during a pan; visible tiles stay paintable', async () => {
    // Budget of 12 tiles' worth; each fake handle costs 1000.
    const harness = createHarness({ storeBudget: 12_000, handleBytes: 1000 });
    for (let step = 0; step < 6; step++) {
      for (let round = 0; round < 50; round++) {
        harness.manager.plan(1, demandAt(step * 64), true);
        const open = harness.pending.filter((request) => !request.settled && !request.aborted());
        if (open.length === 0) break;
        for (const request of open) request.resolve();
        await drain();
      }
      expect(harness.store.costUsed).toBeLessThanOrEqual(12_000);
    }
    // The final stop still paints its visible tiles from the store.
    const plan = harness.manager.plan(1, demandAt(5 * 64), true);
    expect(plan.paint.length).toBeGreaterThanOrEqual(4);
  });

  it('stage-less: an absent visibleRect is capped — bounded tiles, not a whole-page explosion', async () => {
    const harness = createHarness({ tiling: { prefetch: { margin: 0 } } });
    // A absurdly deep stage-less demand (the 4,650%-PageView scenario).
    harness.manager.plan(1, { desiredDeviceWidth: 80_000 }, true);
    await harness.resolveAll();
    const plan = harness.manager.plan(1, { desiredDeviceWidth: 80_000 }, true);
    expect(plan.engaged).toBe(true);
    // The whole page is still covered…
    expect(plan.paint.length).toBeGreaterThan(0);
    // …but by a bounded tile count (the clamp), not tens of thousands.
    expect(harness.pending.length).toBeLessThanOrEqual(64);
  });
});
