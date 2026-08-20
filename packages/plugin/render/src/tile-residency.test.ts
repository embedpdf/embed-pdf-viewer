import { describe, expect, it } from 'vitest';
import type { PageImageHandle, PdfRect } from '@embedpdf/core';

import { resolveRenderOptions, type TilesOptions } from './paint-plan';
import { RasterStore } from './raster-store';
import { TileManager } from './tile-manager';

/**
 * Memory-residency red lines: the manager's bookkeeping and the store's
 * bytes must stay BOUNDED under sustained use. Bytes live in exactly one
 * budgeted owner (the RasterStore); the manager holds keys; raw fetch
 * concurrency is backpressured; stage-less demand is capped. These are the
 * invariants that keep a long deep-zoom pan session flat instead of
 * climbing to gigabytes.
 */

const PAGE = { width: 612, height: 792 };

function harness(opts?: {
  tiling?: TilesOptions;
  storeBudget?: number;
  handleBytes?: number;
}) {
  const store = new RasterStore(opts?.storeBudget ?? 1024 * 1024 * 1024);
  const pending: Array<{
    key: string;
    resolve: () => void;
    aborted: () => boolean;
    settled: boolean;
  }> = [];
  let liveFetches = 0;
  let maxLiveFetches = 0;

  const manager = new TileManager({
    store,
    options: resolveRenderOptions({ tiles: { settleMs: 0, bleed: 0, ...opts?.tiling } }),
    getPolicy: () => ({ kind: 'continuous' }) as never,
    getPageSize: () => PAGE,
    getEpoch: () => 0,
    fetchTile: (_pon, rect: PdfRect, scale: number, _a, signal) =>
      new Promise<PageImageHandle>((resolve, reject) => {
        liveFetches += 1;
        maxLiveFetches = Math.max(maxLiveFetches, liveFetches);
        const record = {
          key: `${rect.left.toFixed(2)}@${scale.toFixed(2)}`,
          settled: false,
          resolve: () => {
            if (record.settled) return;
            record.settled = true;
            liveFetches -= 1;
            resolve({
              source: { kind: 'bytes', bytes: new Uint8Array(opts?.handleBytes ?? 1000) },
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

  return {
    manager,
    store,
    pending,
    maxLive: () => maxLiveFetches,
    resolveAll: async () => {
      // Resolve-and-replan until the want set is fully fetched — the test's
      // stand-in for the wake → plan pump that drives backpressure.
      for (let round = 0; round < 200; round++) {
        const open = pending.filter((p) => !p.settled && !p.aborted());
        if (open.length === 0) break;
        for (const p of open) p.resolve();
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

// Deep-zoom demand: level 4896 (scale 8); the walk scrolls DOWN the page
// (792 pt tall — room for a long walk without clamping at the edge).
const demandAt = (y: number) => ({
  desiredDeviceWidth: 4896,
  visibleRect: { x: 0, y, width: 128, height: 128 },
});

describe('tile residency (the memory red lines)', () => {
  it('PAN: manager entries stay bounded across a long walk — bytes live in the store, not the manager', async () => {
    const h = harness();
    // Walk across the page one tile-span at a time; at each stop, pump the
    // wake → plan loop until the want set fully resolves (backpressure
    // starts deferred fetches on each replan, exactly like live wake-ups).
    const settleAt = async (x: number) => {
      for (let round = 0; round < 50; round++) {
        h.manager.plan(1, demandAt(x), true);
        const open = h.pending.filter((p) => !p.settled && !p.aborted());
        if (open.length === 0) break;
        for (const p of open) p.resolve();
        await drain();
      }
    };
    for (let step = 0; step < 10; step++) await settleAt(step * 64);
    // Want set at this level: 2×2 visible + prefetch ring ≈ up to ~16 tiles.
    // Same-level tiles that left the want set must NOT accumulate.
    const { entries } = h.manager.stats(1);
    expect(entries).toBeLessThanOrEqual(24);
    // The walk touched meaningfully more distinct tiles than the resident
    // bound — proving eviction, not merely a small walk.
    expect(h.pending.length).toBeGreaterThan(entries + 8);
  });

  it('BACKPRESSURE: in-flight tile fetches never exceed the cap; the want set still completes', async () => {
    // Big visible window → want far more tiles than the cap at once.
    const h = harness({ tiling: { prefetch: { margin: 0 } } });
    const wide = { desiredDeviceWidth: 4896, visibleRect: { x: 0, y: 0, width: 512, height: 384 } };
    h.manager.plan(1, wide, true);
    expect(h.maxLive()).toBeLessThanOrEqual(8);
    // Pump: resolve what's open, replan (the wake), repeat until done.
    for (let round = 0; round < 60; round++) {
      const open = h.pending.filter((p) => !p.settled && !p.aborted());
      if (open.length === 0) break;
      for (const p of open) p.resolve();
      await drain();
      h.manager.plan(1, wide, true);
    }
    expect(h.maxLive()).toBeLessThanOrEqual(8);
    // 8×6 visible tiles all resolved and paintable.
    const plan = h.manager.plan(1, wide, true);
    expect(plan.paint.length).toBe(48);
  });

  it('STORE BUDGET: cached bytes respect the budget during a pan; visible tiles stay paintable', async () => {
    // Budget of 12 tiles' worth; each fake handle costs 1000.
    const h = harness({ storeBudget: 12_000, handleBytes: 1000 });
    for (let step = 0; step < 6; step++) {
      for (let round = 0; round < 50; round++) {
        h.manager.plan(1, demandAt(step * 64), true);
        const open = h.pending.filter((p) => !p.settled && !p.aborted());
        if (open.length === 0) break;
        for (const p of open) p.resolve();
        await drain();
      }
      expect(h.store.costUsed).toBeLessThanOrEqual(12_000);
    }
    // The final stop still paints its visible tiles from the store.
    const plan = h.manager.plan(1, demandAt(5 * 64), true);
    expect(plan.paint.length).toBeGreaterThanOrEqual(4);
  });

  it('STAGE-LESS: absent visibleRect is capped — bounded tiles, not a whole-page explosion', async () => {
    const h = harness({ tiling: { prefetch: { margin: 0 } } });
    // A absurdly deep stage-less demand (the 4,650%-PageView scenario).
    h.manager.plan(1, { desiredDeviceWidth: 80_000 }, true);
    await h.resolveAll();
    const plan = h.manager.plan(1, { desiredDeviceWidth: 80_000 }, true);
    expect(plan.engaged).toBe(true);
    // The whole page is still covered…
    expect(plan.paint.length).toBeGreaterThan(0);
    // …but by a bounded tile count (the clamp), not tens of thousands.
    expect(h.pending.length).toBeLessThanOrEqual(64);
  });
});
